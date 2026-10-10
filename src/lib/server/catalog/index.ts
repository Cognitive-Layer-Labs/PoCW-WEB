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
  searchGutenberg,
  workKey,
} from "./gutenberg";
import { olCoverUrl, searchWorks, type OlWork } from "./openlibrary";
import {
  KEY_PATTERN,
  UpstreamError,
  cacheGet,
  cachedOrStale,
  entryByKey,
  entryForGutenberg,
  pruneSearchCache,
  saveEntries,
  staleWhileRevalidate,
  type CatalogEntry,
} from "./store";
import { mainKey, mainTitle, normalise, tidyTitle, titleKey } from "./text";

export { UpstreamError } from "./store";
export { gutenbergEpubUrl } from "./gutenberg";
export type { CatalogEntry } from "./store";

const SEARCH_TTL_MS = 10 * 60 * 1000;
const SEARCH_STALE_MS = 24 * 3600 * 1000;
const SEARCH_RESULTS = 12;

const sameTitle = (a: string, b: string) => [mainKey(a), titleKey(a)].some((k) => k === mainKey(b) || k === titleKey(b));

/** An Open Library work as a catalog entry, with its Gutenberg edition when there is one. */
function entryFromWork(work: OlWork): CatalogEntry {
  const pg = matchGutenberg({
    titles: [work.title, work.altTitle].filter((t): t is string => !!t),
    authors: work.authors,
    gutenbergIds: work.gutenbergIds,
  });
  // The title Gutenberg has the book under: an English edition's title is sometimes a collection's
  // ("Works of Charles Dickens" for Oliver Twist).
  const title = pg && work.altTitle && !sameTitle(work.title, pg.title) && sameTitle(work.altTitle, pg.title) ? work.altTitle : work.title;
  return {
    key: work.key,
    title,
    // Gutenberg writes authors the English way ("Fyodor Dostoyevsky", not "Fiódor Dostoievski").
    author: (pg?.author ?? work.authors[0] ?? null)?.slice(0, 200) ?? null,
    year: work.year,
    coverUrl: work.coverId ? olCoverUrl(work.coverId) : pg ? gutenbergCoverUrl(pg.id) : null,
    gutenbergId: pg?.id ?? null,
  };
}

/** One card per book: the first entry for each Gutenberg work (title and first author) is kept. */
function onePerWork(entries: CatalogEntry[]): CatalogEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (e.gutenbergId === null) return false;
    const pg = gutenbergBook(e.gutenbergId);
    const key = pg ? workKey(pg) : `pg${e.gutenbergId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normaliseQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * Books Bookmap can map, for what the reader typed: Open Library's results that are on Project
 * Gutenberg (they keep Open Library's cover and year), then Gutenberg's own catalog searched by
 * title and author, one card per book, up to 12. Open Library's part is cached for 10 minutes per
 * normalised query (served stale for a day if Open Library is down); if it is down with nothing
 * cached, the catalog's matches are still shown.
 */
export async function searchCatalog(query: string): Promise<CatalogEntry[]> {
  ensureGutenbergCatalog();
  if (Math.random() < 0.02) pruneSearchCache();
  let fromOpenLibrary: CatalogEntry[] = [];
  let failure: UpstreamError | null = null;
  try {
    fromOpenLibrary = await cachedOrStale(`search:${normalise(query)}`, SEARCH_TTL_MS, SEARCH_STALE_MS, async () => {
      const entries = (await searchWorks(query)).map(entryFromWork).filter((e) => e.gutenbergId !== null);
      saveEntries(entries);
      return entries;
    });
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    failure = err;
  }
  const fromGutenberg = searchGutenberg(query, SEARCH_RESULTS)
    .map((b) => resolveEntry(`pg${b.id}`))
    .filter((e): e is CatalogEntry => !!e);
  if (failure) {
    if (fromGutenberg.length === 0) throw failure;
    console.warn("[catalog] Open Library search failed, showing Gutenberg's matches only:", failure.message);
  }
  return onePerWork([...fromOpenLibrary, ...fromGutenberg]).slice(0, SEARCH_RESULTS);
}

/** "Most read classics": the most downloaded English books on Project Gutenberg. */
export async function classics(): Promise<CatalogEntry[]> {
  const value = await staleWhileRevalidate(CLASSICS_KEY, CLASSICS_TTL_MS, async () => {
    const result = await loadClassics();
    saveEntries(result.entries);
    return result;
  });
  return value.entries;
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

/**
 * What the browser gets: only books with free full text (Gutenberg ids stay on the server), and
 * whether each is already on this reader's shelf.
 */
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
  return entries
    .filter((e): e is typeof e & { gutenbergId: number } => e.gutenbergId !== null)
    .map((e) => ({
      key: e.key,
      title: e.title,
      author: e.author,
      year: e.year,
      coverUrl: e.coverUrl,
      bookId: byKey.get(e.key) ?? byUrl.get(gutenbergEpubUrl(e.gutenbergId)) ?? null,
      ...(e.readers !== undefined ? { readers: e.readers } : {}),
    }));
}

/** Everything the Add-a-book page shows before the reader types. Waits only on a cold cache. */
export async function browseLists(userId: number): Promise<BrowseLists> {
  ensureGutenbergCatalog();
  let list: CatalogEntry[] = [];
  try {
    list = await classics();
  } catch (err) {
    console.warn("[catalog] most read classics unavailable:", err instanceof Error ? err.message : err);
  }
  return { classics: toItems(userId, list), popular: toItems(userId, popularOnBookmap()) };
}

/**
 * The lists for server-rendering the page, from the cache only (never waiting on an upstream).
 * Null when the classics aren't cached yet: the page then asks /api/catalog/browse, which waits.
 */
export function initialLists(userId: number): BrowseLists | null {
  ensureGutenbergCatalog();
  const cached = cacheGet<{ entries: CatalogEntry[] }>(CLASSICS_KEY);
  if (!cached) return null;
  // A stale list is still shown; asking for it again starts the refresh.
  if (Date.now() - cached.fetchedAt > CLASSICS_TTL_MS) void classics().catch(() => undefined);
  return { classics: toItems(userId, cached.value.entries), popular: toItems(userId, popularOnBookmap()) };
}

/** Fills the caches shortly after the server starts, so the first reader doesn't wait. */
export function warmCatalog(): void {
  try {
    ensureGutenbergCatalog();
    void classics().catch((err) => console.warn("[catalog] warm-up: classics failed:", err instanceof Error ? err.message : err));
  } catch (err) {
    console.warn("[catalog] warm-up failed:", err instanceof Error ? err.message : err);
  }
}
