import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { gutenbergEpubUrl, resolveEntry } from "@/lib/server/catalog";
import { ENGINE_API_KEY, crossSite, error, indexLinkForUser } from "@/lib/server/engine-proxy";
import { rateLimit } from "@/lib/server/rate-limit";

/**
 * POST /api/catalog/add { key } — "Map & test" for a book from the search or the lists: the engine
 * indexes its Project Gutenberg EPUB (the same link for every reader, so a book someone already
 * mapped is ready at once) and the book lands on the reader's shelf with the catalog's title,
 * author and cover. Full text only ever comes from Project Gutenberg.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return error(401, "Sign in to continue", "UNAUTHENTICATED");
  if (crossSite(request)) return error(403, "Cross-site request refused", "FORBIDDEN");
  if (!ENGINE_API_KEY) return error(500, "The engine is not configured on this server", "NOT_CONFIGURED");

  const wait = rateLimit(`add:${user.id}`, 10);
  if (wait) {
    const res = error(429, "You're adding books very fast. Wait a moment and try again.", "RATE_LIMITED");
    res.headers.set("retry-after", String(wait));
    return res;
  }

  if (Number(request.headers.get("content-length") || 0) > 1024) return error(413, "Request too large", "PAYLOAD_TOO_LARGE");
  let key = "";
  try {
    const body = JSON.parse((await request.text()).slice(0, 1024));
    key = typeof body?.key === "string" ? body.key.trim() : "";
  } catch {
    return error(400, "Pick a book first", "INVALID_KEY");
  }

  const entry = key ? resolveEntry(key) : null;
  if (!entry) return error(404, "That book is no longer in the list. Search for it again.", "NOT_FOUND");
  if (!entry.gutenbergId) {
    return error(409, "This book has no free full text, so Bookmap can't map it.", "NOT_AVAILABLE");
  }

  const { response } = await indexLinkForUser(request, user.id, new URL(gutenbergEpubUrl(entry.gutenbergId)), entry.title, {
    key: entry.key,
    title: entry.title,
    author: entry.author,
    coverUrl: entry.coverUrl,
  });
  return response;
}
