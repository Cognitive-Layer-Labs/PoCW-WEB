import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, appUrl, deleteSession, sessionCookieOptions } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  deleteSession(request.cookies.get(SESSION_COOKIE())?.value);
  const res = NextResponse.redirect(`${appUrl()}/`, 303);
  res.headers.set("cache-control", "no-store");
  res.cookies.set(SESSION_COOKIE(), "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
