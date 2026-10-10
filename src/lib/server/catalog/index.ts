import { db } from "@/lib/server/db";
import { MAX_QUERY_LENGTH, type BrowseLists, type CatalogItem } from "@/lib/catalog";
import {
  CLASSICS_KEY,
  CLASSICS_TTL_MS,
  GUTENBERG_EPUB,
  ensureGutenbergCatalog,
  gutenbergBook,
  gutenbergCoverUrl,
  gutenbergEpubUrl,
  loadClassics,
  matchGutenberg,
} from "./gutenberg";
import { mostReadWorks, olCoverUrl, searchWorks, type OlWork } from "./openlibrary";
import {
  KEY_PATTERN,
  cacheGet,
  cachedOrStale,
  entryByKey,
  entryForGutenberg,
  pruneSearchCache,
  saveEntries,
  staleWhileRevalidate,
  type CatalogEntry,
} from "./store";
import { normalise, tidyTitle, mainTitle } from "./text";

export { UpstreamError } from "./store";
export { gutenbergEpubUrl } from "./gutenberg";
export type { CatalogEntry } from "./store";

const SEARCH_TTL_MS = 10 * 60 * 1000;
const SEARCH_STALE_MS = 24 * 3600 * 1000;
const MOST_READ_KEY = "openlibrary:most-read:v1";
const MOST_READ_TTL_MS = 24 * 3600 * 1000;

/**
 * Two Open Library works can lead to the same Gutenberg book (duplicate records): keep the first.
 * Books without a cover go after the ones with one; they are usually stray records.
 */
function tidyResults(entries: CatalogEntry[]): CatalogEntry[] {
  const seen = new Set<number>();
  const unique = entries.filter((e) => {
    if (e.gutenbergId === null) return true;
    if (seen.has(e.gutenbergId)) return false;
    seen.add(e.gutenbergId);
    return true;
  });
  return [...unique.filter((e) => e.coverUrl), ...unique.filter((e) => !e.coverUrl)];
}

/** An Open Library work as a catalog entry, with its Gutenberg edition when there is one. */
function entryFromWork(work: OlWork): CatalogEntry {
  const pg = matchGutenberg({
    titles: [work.title, work.altTitle].filter((t): t is string => !!t),
    authors: work.authors,
    gutenbergIds: work.gutenbergIds,
  });
  return {
    key: work.key,
    title: work.title,
    // Gutenberg writes authors the English way ("Fyodor Dostoyevsky", not "Fiódor Dostoievski").
    author: (pg?.author ?? work.authors[0] ?? null)?.slice(0, 200) ?? null,
    year: work.year,
    coverUrl: work.coverId ? olCoverUrl(work.coverId) : pg ? gutenbergCoverUrl(pg.id) : null,
    gutenbergId: pg?.id ?? null,
  };
}

export function normaliseQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/** Search results, cached for 10 minutes per normalised query (and served stale if Open Library is down). */
export async function searchCatalog(query: string): Promise<CatalogEntry[]> {
  ensureGutenbergCatalog();
  const key = `search:${normalise(query)}`;
  if (Math.random() < 0.02) pruneSearchCache();
  return cachedOrStale(key, SEARCH_TTL_MS, SEARCH_STALE_MS, async () => {
    const entries = tidyResults((await searchWorks(query)).map(entryFromWork));
    saveEntries(entries);
    return entries;
  });
}

export async function mostRead(): Promise<CatalogEntry[]> {
  return staleWhileRevalidate(MOST_READ_KEY, MOST_READ_TTL_MS, async () => {
    const entries = tidyResults((await mostReadWorks(16)).map(entryFromWork)).slice(0, 15);
    saveEntries(entries);
    return entries;
  });
}

export async function classics(): Promise<CatalogEntry[]> {
  const value = await staleWhileRevalidate(CLASSICS_KEY, CLASSICS_TTL_MS, async () => {
    const result = await loadClassics();
    saveEntries(result.entries);
    return result;
  });
  return value.entries;
}

/** Cached lists only, without waiting on anything (for server-rendering the page). */
export function cachedLists(): { mostRead: CatalogEntry[] | null; classics: CatalogEntry[] | null } {
  const most = cacheGet<CatalogEntry[]>(MOST_READ_KEY);
  const cls = cacheGet<{ entries: CatalogEntry[] }>(CLASSICS_KEY);
  // Stale lists are still shown; asking for them again starts the refresh.
  if ((most && Date.now() - most.fetchedAt > MOST_READ_TTL_MS) || (cls && Date.now() - cls.fetchedAt > CLASSICS_TTL_MS)) {
    void mostRead().catch(() => undefined);
    void classics().catch(() => undefined);
  }
  return { mostRead: most?.value ?? null, classics: cls?.value.entries ?? null };
}

/**
 * Gutenberg books readers have mapped on Bookmap, by distinct readers then finished tests. Only
 * public-domain Gutenberg sources, described by the catalog: never a reader's upload, name or score.
 */
export function popularOnBookmap(limit = 12): Array<CatalogEntry & { readers: number }> {
  const rows = db()
    .prepare(
      `SELECT b.source_url,
              COUNT(DISTINCT b.user_id) AS readers,
              (SELECT COUNT(*) FROM attempts a JOIN books b2 ON b2.id = a.book_id
                WHERE b2.source_url = b.source_url AND a.finished_at IS NOT NULL) AS tests
         FROM books b
        WHERE b.source_kind = 'link' AND b.status = 'ready'
          AND b.source_url GLOB 'https://www.gutenberg.org/ebooks/[0-9]*.epub.noimages'
        GROUP BY b.source_url
        ORDER BY readers DESC, tests DESC, MIN(b.added_at)
        LIMIT ?`
    )
    .all(limit * 2) as Array<{ source_url: string; readers: number; tests: number }>;
  const out: Array<CatalogEntry & { readers: number }> = [];
  for (const r of rows) {
    const id = Number(GUTENBERG_EPUB.exec(r.source_url)?.[1]);
    if (!id) continue;
    const entry = resolveEntry(`pg${id}`);
    if (entry) out.push({ ...entry, readers: Number(r.readers) || 1 });
    if (out.length === limit) break;
  }
  return out;
}

/**
 * The catalog entry behind a key the browser sent. Open Library works must have been shown by
 * this server; Gutenberg books can also come straight from Gutenberg's catalog.
 */
export function resolveEntry(key: string): CatalogEntry | null {
  if (!KEY_PATTERN.test(key)) return null;
  const known = entryByKey(key);
  if (known || !key.startsWith("pg")) return known;
  const id = Number(key.slice(2));
  const viaWork = entryForGutenberg(id);
  if (viaWork) return { ...viaWork, key };
  const pg = gutenbergBook(id);
  if (!pg) return null;
  return { key, title: tidyTitle(mainTitle(pg.title)), author: pg.author, year: null, coverUrl: gutenbergCoverUrl(id), gutenbergId: id };
}

/** What the browser gets: no Gutenberg ids, plus whether each book is already on this reader's shelf. */
export function toItems(userId: number, entries: Array<CatalogEntry & { readers?: number }>): CatalogItem[] {
  const shelf = db().prepare("SELECT id, catalog_key, source_url FROM books WHERE user_id = ?").all(userId) as Array<{
    id: number;
    catalog_key: string | null;
    source_url: string | null;
  }>;
  const byKey = new Map<string, number>();
  const byUrl = new Map<string, number>();
  for (const b of shelf) {
    if (b.catalog_key) byKey.set(b.catalog_key, b.id);
    if (b.source_url) byUrl.set(b.source_url, b.id);
  }
  return entries.map((e) => ({
    key: e.key,
    title: e.title,
    author: e.author,
    year: e.year,
    coverUrl: e.coverUrl,
    available: e.gutenbergId !== null,
    bookId: byKey.get(e.key) ?? (e.gutenbergId ? byUrl.get(gutenbergEpubUrl(e.gutenbergId)) : undefined) ?? null,
    ...(e.readers !== undefined ? { readers: e.readers } : {}),
  }));
}

/** Everything the Add-a-book page shows before the reader types. Waits only on a cold cache. */
export async function browseLists(userId: number): Promise<BrowseLists> {
  ensureGutenbergCatalog();
  const [most, cls] = await Promise.allSettled([mostRead(), classics()]);
  if (most.status === "rejected") console.warn("[catalog] most read list unavailable:", most.reason instanceof Error ? most.reason.message : most.reason);
  if (cls.status === "rejected") console.warn("[catalog] classics unavailable:", cls.reason instanceof Error ? cls.reason.message : cls.reason);
  return {
    mostRead: toItems(userId, most.status === "fulfilled" ? most.value : []),
    classics: toItems(userId, cls.status === "fulfilled" ? cls.value : []),
    popular: toItems(userId, popularOnBookmap()),
  };
}

/**
 * The lists for server-rendering the page, from the cache only (never waiting on an upstream).
 * Null when a list isn't cached yet: the page then asks /api/catalog/browse, which waits for it.
 */
export function initialLists(userId: number): BrowseLists | null {
  ensureGutenbergCatalog();
  const { mostRead: most, classics: cls } = cachedLists();
  if (!most || !cls) return null;
  return { mostRead: toItems(userId, most), classics: toItems(userId, cls), popular: toItems(userId, popularOnBookmap()) };
}

/** Fills the caches shortly after the server starts, so the first reader doesn't wait. */
export function warmCatalog(): void {
  try {
    ensureGutenbergCatalog();
    void mostRead().catch((err) => console.warn("[catalog] warm-up: most read failed:", err instanceof Error ? err.message : err));
    void classics().catch((err) => console.warn("[catalog] warm-up: classics failed:", err instanceof Error ? err.message : err));
  } catch (err) {
    console.warn("[catalog] warm-up failed:", err instanceof Error ? err.message : err);
  }
}
