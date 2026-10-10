import { NextRequest, NextResponse } from "next/server";
import { OAUTH_COOKIE, appUrl, googleAuthorizationUrl, googleConfigured, randomToken, safeNext, secureCookies, sign, type OAuthState } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Starts Google sign-in. A plain top-level GET, so no CSP form-action is involved. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!googleConfigured()) {
    return NextResponse.redirect(`${appUrl()}/?error=config`, 303);
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const payload: OAuthState = { state, verifier, next, iat: Date.now() };

  const res = NextResponse.redirect(googleAuthorizationUrl(state, verifier), 303);
  res.headers.set("cache-control", "no-store");
  res.cookies.set(OAUTH_COOKIE(), sign(payload), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
