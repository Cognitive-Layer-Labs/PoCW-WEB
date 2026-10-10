import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  appUrl,
  createSession,
  exchangeGoogleCode,
  sessionCookieOptions,
  unsign,
  upsertUser,
  type OAuthState,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_TTL_MS = 10 * 60 * 1000;

function fail(reason: "signin" | "cancelled"): NextResponse {
  const res = NextResponse.redirect(`${appUrl()}/?error=${reason}`, 303);
  res.cookies.delete(OAUTH_COOKIE());
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("cancelled");

  const saved = unsign<OAuthState>(request.cookies.get(OAUTH_COOKIE())?.value);
  const code = params.get("code");
  const state = params.get("state");
  if (!saved || !code || !state || state !== saved.state || Date.now() - saved.iat > STATE_TTL_MS) {
    return fail("signin");
  }

  try {
    const claims = await exchangeGoogleCode(code, saved.verifier);
    const user = upsertUser({ sub: claims.sub!, email: claims.email!, name: claims.name, avatarUrl: claims.picture });
    const session = createSession(user.id);
    const res = NextResponse.redirect(`${appUrl()}${saved.next}`, 303);
    res.headers.set("cache-control", "no-store");
    res.cookies.delete(OAUTH_COOKIE());
    res.cookies.set(SESSION_COOKIE(), session.token, sessionCookieOptions(session.expires));
    return res;
  } catch (err) {
    console.error("[auth] Google sign-in failed:", err instanceof Error ? err.message : err);
    return fail("signin");
  }
}
