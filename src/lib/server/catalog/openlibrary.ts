import { TIMEOUT_MS, fetchJson } from "./store";
import { englishTitle, mainKey, surname } from "./text";

/**
 * Open Library: book search, for its ranking and its covers. A result is only shown when it is
 * also on Project Gutenberg. Metadata only: Bookmap never takes text from Open Library or the
 * Internet Archive.
 */

const FIELDS = [
  "key",
  "title",
  "author_name",
  "first_publish_year",
  "cover_i",
  "language",
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

/** Works with an English edition matching the reader's query, best match first. */
export async function searchWorks(query: string): Promise<OlWork[]> {
  const params = new URLSearchParams({ q: `${query} language:eng`, limit: "20", fields: FIELDS, lang: "en" });
  const res = await fetchJson<{ docs?: OlDoc[] }>(`https://openlibrary.org/search.json?${params}`, { timeoutMs: TIMEOUT_MS });
  // A result with neither a cover nor an author is almost always a stray record.
  return dedupe((res.docs ?? []).map(toWork).filter((w): w is OlWork => !!w)).filter((w) => w.coverId || w.authors.length);
}
