import zlib from "node:zlib";
import { db } from "@/lib/server/db";
import {
  BACKGROUND_TIMEOUT_MS,
  TIMEOUT_MS,
  UpstreamError,
  cacheGet,
  cacheSet,
  fetchJson,
  fetchUpstream,
  once,
  type CatalogEntry,
} from "./store";
import { displayAuthor, gutenbergAuthors, mainKey, mainTitle, sameSurname, surname, tidyTitle, titleKey } from "./text";

/**
 * Project Gutenberg: the only place Bookmap takes a book's full text from, because everything on
 * it is in the public domain (in the US). In-copyright books are never fetched from anywhere; the
 * reader uploads their own copy.
 *
 * - Availability: Gutenberg's own catalog (pg_catalog.csv.gz, rebuilt daily by Gutenberg), loaded
 *   into SQLite every few days. Matching a search result is then a local lookup by normalised
 *   title and author. (Gutendex answered in 37-42 s per request when this was built, far too slow
 *   to ask once per search result.)
 * - "Classics you can test right away": Gutendex's most-downloaded English books, falling back to
 *   Gutenberg's OPDS feed of the same ranking when Gutendex doesn't answer in time.
 * - The text: https://www.gutenberg.org/ebooks/<id>.epub.noimages, fetched and indexed by the engine.
 */

export const gutenbergEpubUrl = (id: number) => `https://www.gutenberg.org/ebooks/${id}.epub.noimages`;
export const gutenbergCoverUrl = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
export const GUTENBERG_EPUB = /^https:\/\/www\.gutenberg\.org\/ebooks\/(\d{1,7})\.epub\.noimages$/;

const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz";
const CATALOG_KEY = "gutenberg:catalog";
const CATALOG_TTL_MS = 3 * 24 * 3600 * 1000;
const CATALOG_RETRY_MS = 30 * 60 * 1000;

// ─── The catalog ─────────────────────────────────────────────────────────────

export interface GutenbergBook {
  id: number;
  title: string;
  author: string | null;
  surnames: string[];
}

/** Parses RFC 4180 CSV (quoted fields may hold commas, quotes and newlines). */
function* csvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      yield row;
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}

async function loadCatalog(): Promise<number> {
  const gz = await fetchUpstream(CATALOG_URL, { timeoutMs: 120_000, accept: "application/gzip", maxBytes: 40 * 1024 * 1024 });
  let text: string;
  try {
    text = zlib.gunzipSync(gz, { maxOutputLength: 200 * 1024 * 1024 }).toString("utf8");
  } catch {
    throw new UpstreamError("the Gutenberg catalog is not a gzip file");
  }

  const rows = csvRows(text);
  const header = rows.next().value as string[] | undefined;
  const col = (name: string) => header?.indexOf(name) ?? -1;
  const [ID, TYPE, TITLE, LANGUAGE, AUTHORS] = ["Text#", "Type", "Title", "Language", "Authors"].map(col);
  if ([ID, TYPE, TITLE, LANGUAGE, AUTHORS].some((i) => i < 0)) throw new UpstreamError("the Gutenberg catalog has unexpected columns");

  const books: Array<[number, string, string | null, string, string, string]> = [];
  for (const r of rows) {
    const id = Number(r[ID]);
    if (!Number.isInteger(id) || id <= 0 || r[TYPE] !== "Text") continue;
    if (!(r[LANGUAGE] ?? "").split(/;\s*/).includes("en")) continue;
    const title = (r[TITLE] ?? "").replace(/\s*\r?\n\s*/g, ": ").trim();
    if (!title) continue;
    const { display, surnames } = gutenbergAuthors(r[AUTHORS] ?? "");
    books.push([id, title.slice(0, 500), display?.slice(0, 200) ?? null, titleKey(title), mainKey(title), surnames.join(" ")]);
  }
  if (books.length < 10_000) throw new UpstreamError(`the Gutenberg catalog looks truncated (${books.length} English texts)`);

  const conn = db();
  const insert = conn.prepare("INSERT INTO gutenberg_books (id, title, author, title_key, main_key, surnames) VALUES (?, ?, ?, ?, ?, ?)");
  conn.transaction(() => {
    conn.exec("DELETE FROM gutenberg_books");
    for (const b of books) insert.run(...b);
  })();
  cacheSet(CATALOG_KEY, { books: books.length });
  return books.length;
}

/** Starts a catalog refresh in the background when it is missing or older than three days. */
export function ensureGutenbergCatalog(): void {
  const hit = cacheGet<{ books?: number; failed?: boolean }>(CATALOG_KEY);
  const age = hit ? Date.now() - hit.fetchedAt : Infinity;
  if (hit && (hit.value.failed ? age < CATALOG_RETRY_MS : age < CATALOG_TTL_MS)) return;
  once(CATALOG_KEY, loadCatalog)
    .then((n) => console.info(`[catalog] Project Gutenberg catalog loaded: ${n} English texts`))
    .catch((err) => {
      console.warn("[catalog] loading the Project Gutenberg catalog failed:", err instanceof Error ? err.message : err);
      // Remember the failure (keeping the old rows) so we retry in 30 minutes, not on every request.
      if (!hit || hit.value.failed) cacheSet(CATALOG_KEY, { failed: true });
      else cacheSet(CATALOG_KEY, hit.value, Date.now() - CATALOG_TTL_MS + CATALOG_RETRY_MS);
    });
}

function catalogLoaded(): boolean {
  return !!db().prepare("SELECT 1 FROM gutenberg_books LIMIT 1").get();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toBook = (r: any): GutenbergBook => ({
  id: r.id,
  title: r.title,
  author: r.author ?? null,
  surnames: String(r.surnames || "").split(" ").filter(Boolean),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function gutenbergBook(id: number): GutenbergBook | null {
  const row = db().prepare("SELECT * FROM gutenberg_books WHERE id = ?").get(id);
  return row ? toBook(row) : null;
}

function booksByIds(ids: number[]): GutenbergBook[] {
  if (ids.length === 0) return [];
  const list = ids.slice(0, 50);
  return (db().prepare(`SELECT * FROM gutenberg_books WHERE id IN (${list.map(() => "?").join(",")})`).all(...list) as unknown[]).map(toBook);
}

function booksByTitle(keys: string[]): GutenbergBook[] {
  const list = [...new Set(keys.filter(Boolean))].slice(0, 6);
  if (list.length === 0) return [];
  const marks = list.map(() => "?").join(",");
  return (
    db()
      .prepare(`SELECT * FROM gutenberg_books WHERE main_key IN (${marks}) OR title_key IN (${marks}) LIMIT 60`)
      .all(...list, ...list) as unknown[]
  ).map(toBook);
}

// ─── Matching ────────────────────────────────────────────────────────────────

export interface WorkToMatch {
  /** Every title the work goes by (the work's and its English edition's). */
  titles: string[];
  authors: string[];
  /** Gutenberg ids Open Library links to the work (unchecked: sometimes wrong). */
  gutenbergIds: number[];
}

/** Popularity rank of Gutenberg ids (most downloaded first), from the classics refresh. */
function popularityRank(): Map<number, number> {
  const hit = cacheGet<{ popularIds?: number[] }>(CLASSICS_KEY);
  return new Map((hit?.value.popularIds ?? []).map((id, i) => [id, i]));
}

/** Gutenberg ids some reader already has mapped: picking one of those makes the book ready at once. */
function mappedOnBookmap(ids: number[]): Set<number> {
  if (ids.length === 0) return new Set();
  const urls = ids.map(gutenbergEpubUrl);
  const rows = db()
    .prepare(`SELECT DISTINCT source_url FROM books WHERE status = 'ready' AND source_url IN (${urls.map(() => "?").join(",")})`)
    .all(...urls) as Array<{ source_url: string }>;
  return new Set(rows.map((r) => Number(GUTENBERG_EPUB.exec(r.source_url)?.[1])));
}

/**
 * The Gutenberg book for an Open Library work, or null. A candidate must have the same title
 * (before any subtitle) and, unless Open Library itself links it, an author with the same surname.
 * Among several editions: one already mapped on Bookmap, else the most downloaded, else the oldest.
 */
export function matchGutenberg(work: WorkToMatch): GutenbergBook | null {
  const keys = new Set(work.titles.flatMap((t) => [mainKey(t), titleKey(t)]).filter(Boolean));
  if (keys.size === 0) return null;
  const surnames = work.authors.map(surname).filter(Boolean);
  const byAuthor = (b: GutenbergBook) => surnames.length === 0 || b.surnames.some((s) => surnames.some((t) => sameSurname(s, t)));
  const byTitle = (b: GutenbergBook) => keys.has(mainKey(b.title)) || keys.has(titleKey(b.title));

  if (!catalogLoaded()) {
    // Catalog not loaded yet (first minutes after a deploy): trust Open Library's own link.
    const id = work.gutenbergIds.filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b)[0];
    return id ? { id, title: work.titles[0] ?? "", author: work.authors[0] ?? null, surnames } : null;
  }

  const candidates = new Map<number, GutenbergBook>();
  for (const b of booksByIds(work.gutenbergIds)) if (byTitle(b)) candidates.set(b.id, b);
  for (const b of booksByTitle([...keys])) if (byAuthor(b) && surnames.length > 0) candidates.set(b.id, b);
  if (candidates.size === 0) return null;

  const list = [...candidates.values()];
  const mapped = mappedOnBookmap(list.map((b) => b.id));
  const rank = popularityRank();
  list.sort((a, b) => {
    const m = Number(mapped.has(b.id)) - Number(mapped.has(a.id));
    if (m) return m;
    const ra = rank.get(a.id) ?? Infinity;
    const rb = rank.get(b.id) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.id - b.id;
  });
  return list[0];
}

// ─── Classics ────────────────────────────────────────────────────────────────

const CLASSICS_KEY = "gutenberg:classics:v1";
const CLASSICS_TTL_MS = 24 * 3600 * 1000;
const CLASSICS_COUNT = 12;

/** Reference works and multi-volume sets: popular downloads, but not books anyone "has read". */
const NOT_A_READ = /\b(dictionary|encyclop|thesaurus|glossary|complete works|collected works|works of|index of|catalogue|catalog|anthology|vol\.|volume|part \d+ of|\d+ of \d+)\b/i;

interface PopularBook {
  id: number;
  title: string;
  author: string | null;
}

interface GutendexPage {
  results?: Array<{
    id?: number;
    title?: string;
    authors?: Array<{ name?: string }>;
    languages?: string[];
    media_type?: string;
    formats?: Record<string, string>;
  }>;
}

async function popularFromGutendex(): Promise<PopularBook[]> {
  const page = await fetchJson<GutendexPage>("https://gutendex.com/books/?languages=en&sort=popular", { timeoutMs: TIMEOUT_MS });
  return (page.results ?? [])
    .filter((b) => Number.isInteger(b.id) && b.title && b.media_type === "Text" && b.languages?.includes("en"))
    .filter((b) => Object.keys(b.formats ?? {}).some((f) => f.startsWith("application/epub+zip")))
    .map((b) => ({
      id: b.id!,
      title: b.title!,
      author: (b.authors ?? []).map((a) => (a.name ? displayAuthor(a.name) : "")).filter(Boolean).slice(0, 2).join(" and ") || null,
    }));
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** Gutenberg's own OPDS feed, sorted by downloads (25 per page). */
async function popularFromOpds(): Promise<PopularBook[]> {
  const pages = await Promise.all(
    [1, 26].map((start) =>
      fetchUpstream(`https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads&start_index=${start}`, {
        timeoutMs: TIMEOUT_MS,
        accept: "application/atom+xml",
        maxBytes: 2 * 1024 * 1024,
      }).then((b) => b.toString("utf8"))
    )
  );
  const out: PopularBook[] = [];
  for (const xml of pages) {
    for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const id = Number(/<id>https?:\/\/www\.gutenberg\.org\/ebooks\/(\d+)\.opds<\/id>/.exec(entry)?.[1]);
      const title = decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? "").trim();
      const content = decodeXml(/<content type="text">([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? "").trim();
      if (!Number.isInteger(id) || !title) continue;
      out.push({ id, title, author: content && !/downloads$/.test(content) ? content : null });
    }
  }
  return out;
}

interface OlDocs {
  docs?: Array<{ title?: string; author_name?: string[]; cover_i?: number; id_project_gutenberg?: string[] }>;
}

const olCover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`;

/** Same book: same title before any subtitle, or (for works titled in another script) same author. */
function sameBook(book: PopularBook, doc: { title?: string; author_name?: string[] }): boolean {
  if (doc.title && mainKey(doc.title) === mainKey(book.title)) return true;
  const theirs = (doc.author_name ?? []).map(surname);
  const ours = surname(book.author ?? "");
  return !!ours && theirs.some((s) => sameSurname(s, ours));
}

/**
 * Real covers from Open Library for Gutenberg books: one request for the works Open Library links
 * to these Gutenberg ids, then a title + author search for the rest. Gutenberg's own generated
 * cover is the fallback.
 */
async function openLibraryCovers(books: PopularBook[]): Promise<Map<number, string>> {
  const covers = new Map<number, string>();
  if (books.length === 0) return covers;
  const search = (params: Record<string, string>) =>
    fetchJson<OlDocs>(`https://openlibrary.org/search.json?${new URLSearchParams({ ...params, lang: "en" })}`, {
      timeoutMs: BACKGROUND_TIMEOUT_MS,
    });

  const linked = await search({
    q: `id_project_gutenberg:(${books.map((b) => b.id).join(" OR ")})`,
    fields: "title,author_name,cover_i,id_project_gutenberg",
    limit: "100",
  });
  for (const doc of linked.docs ?? []) {
    if (!doc.cover_i) continue;
    for (const b of books) {
      if (!covers.has(b.id) && doc.id_project_gutenberg?.includes(String(b.id)) && sameBook(b, doc)) covers.set(b.id, olCover(doc.cover_i));
    }
  }

  await Promise.all(
    books
      .filter((b) => !covers.has(b.id) && b.author)
      .map(async (b) => {
        const title = mainTitle(b.title).replace(/"/g, "");
        const res = await search({ q: `title:"${title}" author:"${surname(b.author!)}"`, fields: "title,author_name,cover_i", limit: "5" }).catch(
          () => null
        );
        const doc = res?.docs?.find((d) => d.cover_i && d.title && mainKey(d.title) === mainKey(b.title) && sameBook(b, { author_name: d.author_name }));
        if (doc?.cover_i) covers.set(b.id, olCover(doc.cover_i));
      })
  );
  return covers;
}

async function loadClassics(): Promise<{ entries: CatalogEntry[]; popularIds: number[]; source: string }> {
  let popular: PopularBook[];
  let source = "gutendex";
  try {
    popular = await popularFromGutendex();
    if (popular.length === 0) throw new UpstreamError("Gutendex returned no books");
  } catch (err) {
    console.warn("[catalog] Gutendex unavailable, using Gutenberg's OPDS feed:", err instanceof Error ? err.message : err);
    popular = await popularFromOpds();
    source = "gutenberg-opds";
  }

  const known = catalogLoaded();
  const picked: PopularBook[] = [];
  const seen = new Set<string>();
  for (const b of popular) {
    const pg = known ? gutenbergBook(b.id) : null;
    if (known && !pg) continue; // not an English text
    const title = tidyTitle(mainTitle(b.title));
    if (NOT_A_READ.test(b.title) || title.length < 2) continue;
    const author = pg?.author ?? b.author;
    const dedupe = `${titleKey(title)}|${surname(author ?? "")}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    picked.push({ id: b.id, title, author });
    if (picked.length === CLASSICS_COUNT) break;
  }

  let covers = new Map<number, string>();
  try {
    covers = await openLibraryCovers(picked);
  } catch (err) {
    console.warn("[catalog] Open Library covers for classics failed, using Gutenberg's:", err instanceof Error ? err.message : err);
  }

  const entries = picked.map<CatalogEntry>((b) => ({
    key: `pg${b.id}`,
    title: b.title,
    author: b.author,
    year: null,
    coverUrl: covers.get(b.id) ?? gutenbergCoverUrl(b.id),
    gutenbergId: b.id,
  }));
  return { entries, popularIds: popular.map((b) => b.id), source };
}

export { CLASSICS_KEY, CLASSICS_TTL_MS, loadClassics };
