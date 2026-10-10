import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { browseLists } from "@/lib/server/catalog";

/**
 * GET /api/catalog/browse — "Most read in English", "Classics you can test right away" and
 * "Popular on Bookmap". Cached server-side for a day; only a cold cache makes this wait.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue", code: "UNAUTHENTICATED" }, { status: 401 });
  return NextResponse.json(await browseLists(user.id), { headers: { "cache-control": "private, no-store" } });
}
