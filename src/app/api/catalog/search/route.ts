import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { UpstreamError, normaliseQuery, searchCatalog, toItems } from "@/lib/server/catalog";
import { rateLimit } from "@/lib/server/rate-limit";

/**
 * GET /api/catalog/search?q=... — English books on Open Library matching the query, each marked
 * "full text available" (Project Gutenberg) or not. Signed-in readers only, 30 searches a minute.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "cache-control": "private, no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue", code: "UNAUTHENTICATED" }, { status: 401, headers: NO_STORE });

  const query = normaliseQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length < 2) return NextResponse.json({ query, items: [] }, { headers: NO_STORE });

  const wait = rateLimit(`search:${user.id}`, 30);
  if (wait) {
    return NextResponse.json(
      { error: "That's a lot of searches. Wait a moment and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { ...NO_STORE, "retry-after": String(wait) } }
    );
  }

  try {
    const entries = await searchCatalog(query);
    return NextResponse.json({ query, items: toItems(user.id, entries) }, { headers: NO_STORE });
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    console.warn("[catalog] search failed:", err.message);
    return NextResponse.json(
      { error: "Search is unavailable right now. You can still upload a file.", code: "SEARCH_UNAVAILABLE" },
      { status: 503, headers: NO_STORE }
    );
  }
}
