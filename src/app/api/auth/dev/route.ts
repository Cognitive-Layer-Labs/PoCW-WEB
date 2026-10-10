import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, appUrl, createSession, devLoginEnabled, safeNext, sessionCookieOptions, upsertUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DEV-ONLY sign-in for automated tests: signs in as any email without Google.
 * Answers 404 unless AUTH_DEV_LOGIN is exactly "1". Never enable it in production.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!devLoginEnabled()) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const name = String(form?.get("name") ?? "").trim() || email.split("@")[0];
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email)) {
    return NextResponse.redirect(`${appUrl()}/dev-login?error=email`, 303);
  }

  console.warn(`\n!!! [auth] DEV LOGIN used for ${email} (AUTH_DEV_LOGIN=1). This must never be enabled in production. !!!\n`);
  const user = upsertUser({ sub: `dev:${email}`, email, name });
  const session = createSession(user.id);
  const res = NextResponse.redirect(`${appUrl()}${safeNext(String(form?.get("next") ?? ""))}`, 303);
  res.cookies.set(SESSION_COOKIE(), session.token, sessionCookieOptions(session.expires));
  return res;
}
