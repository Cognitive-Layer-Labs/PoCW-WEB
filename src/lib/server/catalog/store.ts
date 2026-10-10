import { db, now } from "@/lib/server/db";

/**
 * Upstream requests and what we keep from them: a small key/value cache (with the time it was
 * fetched) and the catalog entries the server has shown readers.
 */

export const USER_AGENT = "Bookmap/1.0 (+https://bookmap.baghici.com)";

/** Interactive requests (search) give up quickly; daily background refreshes can wait longer. */
export const TIMEOUT_MS = 6_000;
export const BACKGROUND_TIMEOUT_MS = 15_000;

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** GET with our User-Agent, a timeout and a size cap. Throws UpstreamError on any failure. */
export async function fetchUpstream(
  url: string,
  { timeoutMs = TIMEOUT_MS, accept = "application/json", maxBytes = 8 * 1024 * 1024 } = {}
): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new UpstreamError(`${new URL(url).hostname} ${timedOut ? "timed out" : "is unreachable"}`);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new UpstreamError(`${new URL(url).hostname} answered ${res.status}`);
  }
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new UpstreamError(`${new URL(url).hostname} sent too much`);
  }
  try {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new UpstreamError(`${new URL(url).hostname} sent too much`);
    return buf;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(`${new URL(url).hostname} timed out`);
  }
}

export async function fetchJson<T>(url: string, options?: { timeoutMs?: number }): Promise<T> {
  const buf = await fetchUpstream(url, options);
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    throw new UpstreamError(`${new URL(url).hostname} sent something that isn't JSON`);
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheRow<T> {
  value: T;
  fetchedAt: number;
}

export function cacheGet<T>(key: string): CacheRow<T> | null {
  const row = db().prepare("SELECT value, fetched_at FROM catalog_cache WHERE key = ?").get(key) as
    | { value: string; fetched_at: number }
    | undefined;
  if (!row) return null;
  try {
    return { value: JSON.parse(row.value) as T, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown, fetchedAt = Date.now()): void {
  db()
    .prepare(
      `INSERT INTO catalog_cache (key, value, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`
    )
    .run(key, JSON.stringify(value), fetchedAt);
}

/** Drops cached searches older than a day (called now and then, not on every search). */
export function pruneSearchCache(): void {
  db()
    .prepare("DELETE FROM catalog_cache WHERE key LIKE 'search:%' AND fetched_at < ?")
    .run(Date.now() - 24 * 3600 * 1000);
}

/** One refresh per key at a time, shared by every request (and every route bundle) that asks. */
const globalForCatalog = globalThis as unknown as { __bookmapInflight?: Map<string, Promise<unknown>> };
const inflight: Map<string, Promise<unknown>> = (globalForCatalog.__bookmapInflight ??= new Map<string, Promise<unknown>>());

export function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const job = load().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/**
 * Cached for `ttlMs`. Past that, the stale value is served at once while a refresh runs in the
 * background (and keeps being served if the upstream is down). Only a cold cache waits.
 */
export async function staleWhileRevalidate<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  const refresh = () =>
    once(key, async () => {
      const value = await load();
      cacheSet(key, value);
      return value;
    });
  if (!hit) return refresh();
  if (Date.now() - hit.fetchedAt > ttlMs) {
    refresh().catch((err) => console.warn(`[catalog] refreshing ${key} failed, serving the cached copy:`, err instanceof Error ? err.message : err));
  }
  return hit.value;
}

/** Cached for `ttlMs`; a failed refresh falls back to the last good value for up to `staleMs`. */
export async function cachedOrStale<T>(key: string, ttlMs: number, staleMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  const age = hit ? Date.now() - hit.fetchedAt : Infinity;
  if (hit && age <= ttlMs) return hit.value;
  try {
    return await once(key, async () => {
      const value = await load();
      cacheSet(key, value);
      return value;
    });
  } catch (err) {
    if (hit && age <= staleMs) return hit.value;
    throw err;
  }
}

// ─── Catalog entries ─────────────────────────────────────────────────────────

/**
 * A book as Open Library or Project Gutenberg describe it. Every book the server shows a reader
 * is stored, so "Map & test" and "Upload your copy" only send its key: the title, author, cover
 * and Gutenberg id a book gets always come from the catalog, never from the browser.
 */
export interface CatalogEntry {
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  gutenbergId: number | null;
}

export const KEY_PATTERN = /^(OL\d{1,12}W|pg\d{1,7})$/;

export function saveEntries(entries: CatalogEntry[]): void {
  if (entries.length === 0) return;
  const conn = db();
  const stmt = conn.prepare(
    `INSERT INTO catalog_entries (key, title, author, year, cover_url, gutenberg_id, updated_at)
     VALUES (@key, @title, @author, @year, @coverUrl, @gutenbergId, @t)
     ON CONFLICT(key) DO UPDATE SET
       title = excluded.title, author = excluded.author, year = excluded.year, cover_url = excluded.cover_url,
       gutenberg_id = excluded.gutenberg_id, updated_at = excluded.updated_at`
  );
  const t = now();
  conn.transaction(() => {
    for (const e of entries) stmt.run({ ...e, t });
  })();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toEntry = (r: any): CatalogEntry => ({
  key: r.key,
  title: r.title,
  author: r.author ?? null,
  year: r.year ?? null,
  coverUrl: r.cover_url ?? null,
  gutenbergId: r.gutenberg_id ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function entryByKey(key: string): CatalogEntry | null {
  if (!KEY_PATTERN.test(key)) return null;
  const row = db().prepare("SELECT * FROM catalog_entries WHERE key = ?").get(key);
  return row ? toEntry(row) : null;
}

/** The entry shown for a Gutenberg book: its own "pg" entry, else an Open Library work that links to it. */
export function entryForGutenberg(id: number): CatalogEntry | null {
  const row = db()
    .prepare("SELECT * FROM catalog_entries WHERE gutenberg_id = ? ORDER BY (key = ?) DESC, updated_at DESC LIMIT 1")
    .get(id, `pg${id}`);
  return row ? toEntry(row) : null;
}
