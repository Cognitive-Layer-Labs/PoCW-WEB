import { NextRequest, NextResponse } from "next/server";
import { appOrigin, currentUser } from "@/lib/server/auth";
import { deleteBook } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Removes a book (and its test history and share links) from the signed-in user's shelf. */
export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue", code: "UNAUTHENTICATED" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin()) return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  const { id } = await context.params;
  const ok = /^\d{1,12}$/.test(id) && deleteBook(user.id, Number(id));
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
}
