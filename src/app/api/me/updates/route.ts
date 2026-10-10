import { NextRequest, NextResponse } from "next/server";
import { appOrigin, currentUser } from "@/lib/server/auth";
import { setUpdatesOptIn } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (status: number, body: object) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** Records whether the signed-in reader wants product-update emails. Body: { optIn: boolean } */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return json(401, { error: "Sign in to continue", code: "UNAUTHENTICATED" });
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin()) return json(403, { error: "Cross-site request refused", code: "FORBIDDEN" });

  const body = (await request.json().catch(() => null)) as { optIn?: unknown } | null;
  if (typeof body?.optIn !== "boolean") return json(400, { error: "optIn must be true or false", code: "INVALID" });

  setUpdatesOptIn(user.id, body.optIn);
  return json(200, { optIn: body.optIn });
}
