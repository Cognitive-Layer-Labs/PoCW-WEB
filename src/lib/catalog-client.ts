/** Browser calls to the catalog routes (search, browse lists, "Map & test"). */

import { EngineError, signedOut, toError } from "@/lib/engine";
import type { BrowseLists, CatalogItem } from "@/lib/catalog";

export class SearchError extends Error {
  constructor(message: string, readonly unavailable: boolean) {
    super(message);
    this.name = "SearchError";
  }
}

async function json(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchBooks(query: string, signal?: AbortSignal): Promise<CatalogItem[]> {
  let res: Response;
  try {
    res = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new SearchError("Can't reach Bookmap. Check your connection and try again.", false);
  }
  const body = (await json(res)) as { items?: CatalogItem[]; error?: string } | null;
  if (!res.ok) {
    signedOut(res.status);
    throw new SearchError(
      body?.error || "Search is unavailable right now. You can still upload a file.",
      res.status >= 500 || res.status === 0
    );
  }
  return Array.isArray(body?.items) ? body.items : [];
}

export async function browseBooks(): Promise<BrowseLists> {
  const res = await fetch("/api/catalog/browse", { cache: "no-store" });
  if (!res.ok) {
    signedOut(res.status);
    throw new Error("The book lists couldn't be loaded.");
  }
  const body = (await json(res)) as Partial<BrowseLists> | null;
  return { classics: body?.classics ?? [], popular: body?.popular ?? [] };
}

/** "Map & test": adds a book to the shelf from its Project Gutenberg text. Returns its book id. */
export async function mapBook(key: string): Promise<number> {
  let res: Response;
  try {
    res = await fetch("/api/catalog/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
      cache: "no-store",
    });
  } catch {
    throw new EngineError("Can't reach Bookmap. Check your connection and try again.", 0);
  }
  const body = (await json(res)) as { bookId?: number; error?: string; code?: string } | null;
  if (!res.ok) {
    signedOut(res.status);
    throw toError(res.status, body, "Adding that book failed");
  }
  if (!body?.bookId) throw new EngineError("The engine sent an unexpected response. Try again in a moment.", res.status);
  return body.bookId;
}
