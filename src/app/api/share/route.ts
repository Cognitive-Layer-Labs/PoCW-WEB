import { NextRequest, NextResponse } from "next/server";
import { appOrigin, appUrl, currentUser } from "@/lib/server/auth";
import { attemptForUser, shareAttempt } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (status: number, body: object) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** Creates (or returns) the public link for one of the signed-in user's finished tests. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return json(401, { error: "Sign in to continue", code: "UNAUTHENTICATED" });
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin()) return json(403, { error: "Cross-site request refused", code: "FORBIDDEN" });

  const body = (await request.json().catch(() => null)) as { attemptId?: unknown } | null;
  const attemptId = Number(body?.attemptId);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return json(400, { error: "attemptId is required", code: "INVALID" });

  const attempt = attemptForUser(user.id, attemptId);
  if (!attempt || !attempt.finishedAt) return json(404, { error: "Not found", code: "NOT_FOUND" });

  const slug = shareAttempt(attempt.id);
  return json(200, { slug, url: `${appUrl()}/s/${slug}` });
}
