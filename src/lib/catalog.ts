/**
 * A book from the catalog, as the browser sees it. Only books with free full text on Project
 * Gutenberg are ever sent: every one can be mapped straight away.
 */
export interface CatalogItem {
  /** Open Library work ("OL66554W") or Gutenberg book ("pg1342"); the only thing sent back. */
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  /** Already on this reader's shelf. */
  bookId: number | null;
  /** Popular on Bookmap: how many readers have it. */
  readers?: number;
}

export interface BrowseLists {
  /** "Most read classics": Project Gutenberg's most downloaded English books. */
  classics: CatalogItem[];
  popular: CatalogItem[];
}

export const MAX_QUERY_LENGTH = 120;

/** Open Library covers come in S/M/L; Gutenberg's in small/medium. */
export function coverAt(url: string, size: "M" | "L"): string {
  return size === "L" ? url.replace(/-M\.jpg$/, "-L.jpg") : url;
}
