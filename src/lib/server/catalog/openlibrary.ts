import { BACKGROUND_TIMEOUT_MS, TIMEOUT_MS, cacheGet, cacheSet, fetchJson } from "./store";
import { englishTitle, mainKey, normalise, sameSurname, surname } from "./text";

/**
 * Open Library: book search and "most read in English" (from its readers' "already read" logs).
 * Metadata only: Bookmap never takes text from Open Library or the Internet Archive.
 */

const FIELDS = [
  "key",
  "title",
  "author_name",
  "first_publish_year",
  "cover_i",
  "language",
  "edition_count",
  "already_read_count",
  "id_wikidata",
  "id_project_gutenberg",
  "editions",
  "editions.title",
  "editions.language",
  "editions.cover_i",
].join(",");

interface OlDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  language?: string[];
  already_read_count?: number;
  id_wikidata?: string[];
  id_project_gutenberg?: string[];
  editions?: { docs?: Array<{ title?: string; language?: string[]; cover_i?: number }> };
}

export interface OlWork {
  key: string; // OL…W
  title: string;
  /** The work's own title when it differs from the English one shown. */
  altTitle: string | null;
  authors: string[];
  year: number | null;
  coverId: number | null;
  gutenbergIds: number[];
  hasWikidata: boolean;
}

export const olCoverUrl = (id: number) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`;

function toWork(doc: OlDoc): OlWork | null {
  const key = /^\/works\/(OL\d{1,12}W)$/.exec(doc.key ?? "")?.[1];
  const workTitle = doc.title?.trim();
  if (!key || !workTitle) return null;
  const edition = doc.editions?.docs?.[0];
  const english = edition?.language?.includes("eng") ? edition : undefined;
  const title = englishTitle(workTitle, english?.title).slice(0, 300);
  const authors = [...new Set((doc.author_name ?? []).map((a) => a.trim()).filter(Boolean))].slice(0, 3);
  return {
    key,
    title,
    altTitle: title !== workTitle ? workTitle : null,
    authors,
    year: Number.isInteger(doc.first_publish_year) && doc.first_publish_year! > 0 ? doc.first_publish_year! : null,
    coverId: doc.cover_i ?? english?.cover_i ?? null,
    gutenbergIds: (doc.id_project_gutenberg ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
    hasWikidata: (doc.id_wikidata ?? []).length > 0,
  };
}

/** The same book listed twice (Open Library has duplicate works): keep the first. */
function dedupe(works: OlWork[]): OlWork[] {
  const seen = new Set<string>();
  return works.filter((w) => {
    const k = `${mainKey(w.title)}|${surname(w.authors[0] ?? "")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function search(params: Record<string, string>, timeoutMs: number): Promise<OlWork[]> {
  const url = `https://openlibrary.org/search.json?${new URLSearchParams({ ...params, fields: FIELDS, lang: "en" })}`;
  const res = await fetchJson<{ docs?: OlDoc[] }>(url, { timeoutMs });
  return dedupe((res.docs ?? []).map(toWork).filter((w): w is OlWork => !!w));
}

/** Works with an English edition matching the reader's query, best match first. */
export async function searchWorks(query: string, limit = 12): Promise<OlWork[]> {
  const works = await search({ q: `${query} language:eng`, limit: "20" }, TIMEOUT_MS);
  // A result with neither a cover nor an author is almost always a stray record.
  return works.filter((w) => w.coverId || w.authors.length).slice(0, limit);
}

/**
 * The English books Open Library readers have marked "already read" most, keeping only notable
 * books with real metadata: a cover, an author, and a Wikidata id or an English Wikipedia article
 * about the book (this drops self-published filler that games the reading logs).
 */
export async function mostReadWorks(count = 15): Promise<OlWork[]> {
  const works = (await search({ q: "language:eng", sort: "already_read", limit: "40" }, BACKGROUND_TIMEOUT_MS)).filter(
    (w) => w.coverId && w.authors.length
  );
  const unknown = works.filter((w) => !w.hasWikidata);
  const onWikipedia = await wikipediaArticles(unknown);
  return works.filter((w) => w.hasWikidata || onWikipedia.has(w.key)).slice(0, count);
}

// ─── Wikipedia check ─────────────────────────────────────────────────────────

const WIKI_TTL_MS = 30 * 24 * 3600 * 1000;

interface WikiQuery {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; missing?: boolean; invalid?: boolean; description?: string; pageprops?: Record<string, string> }>;
  };
}

/**
 * Keys of the works that have an English Wikipedia article about them: "<title>", "<title> (novel)"
 * or "<title> (book)" exists, isn't a disambiguation page, and its short description names the
 * author ("1945 novella by George Orwell"). Answers are cached for 30 days per book.
 */
async function wikipediaArticles(works: OlWork[]): Promise<Set<string>> {
  const found = new Set<string>();
  const ask: OlWork[] = [];
  for (const w of works) {
    const cached = cacheGet<boolean>(`wikipedia:${mainKey(w.title)}|${surname(w.authors[0] ?? "")}`);
    if (cached && Date.now() - cached.fetchedAt < WIKI_TTL_MS) {
      if (cached.value) found.add(w.key);
    } else ask.push(w);
  }

  for (let i = 0; i < ask.length; i += 12) {
    const batch = ask.slice(i, i + 12);
    const variants = batch.map((w) => {
      const t = w.title.replace(/[#<>[\]{}|]/g, "").trim();
      return [t, `${t} (novel)`, `${t} (book)`, `${t} (novella)`];
    });
    const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "description|pageprops",
      ppprop: "disambiguation",
      titles: variants.flat().join("|"),
    })}`;
    const res = await fetchJson<WikiQuery>(url, { timeoutMs: BACKGROUND_TIMEOUT_MS });
    const follow = new Map<string, string>();
    for (const n of res.query?.normalized ?? []) follow.set(n.from, n.to);
    for (const r of res.query?.redirects ?? []) follow.set(r.from, r.to);
    const resolve = (t: string) => {
      let cur = t;
      for (let hop = 0; hop < 3 && follow.has(cur); hop++) cur = follow.get(cur)!;
      return cur;
    };
    const pages = new Map((res.query?.pages ?? []).map((p) => [p.title, p]));

    batch.forEach((w, j) => {
      const author = surname(w.authors[0] ?? "");
      const ok = variants[j].some((v) => {
        const page = pages.get(resolve(v));
        if (!page || page.missing || page.invalid || page.pageprops?.disambiguation !== undefined) return false;
        const description = normalise(page.description ?? "");
        return author ? description.split(" ").some((word) => sameSurname(word, author)) : /\b(novel|book|novella|memoir)\b/.test(description);
      });
      if (ok) found.add(w.key);
      cacheSet(`wikipedia:${mainKey(w.title)}|${author}`, ok);
    });
  }
  return found;
}
