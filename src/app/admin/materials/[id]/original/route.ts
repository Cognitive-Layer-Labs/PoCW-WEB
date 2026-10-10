import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/server/auth";
import { adminMaterial } from "@/lib/server/repo";
import { MIME_BY_EXT, storedPath } from "@/lib/server/uploads";
import { attachment, titleSlug } from "@/lib/server/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const notFound = () => new NextResponse("Not found", { status: 404 });

/** The original file a reader uploaded. ADMIN_EMAILS only; everyone else gets a 404. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const user = await currentUser();
  if (!user || !isAdmin(user)) return notFound();
  const { id } = await context.params;
  const material = /^\d{1,12}$/.test(id) ? adminMaterial(Number(id)) : null;
  const abs = material?.storedFile ? storedPath(material.storedFile) : null;
  if (!material || !abs) return notFound();

  let size: number;
  try {
    size = (await fs.promises.stat(abs)).size;
  } catch {
    return notFound();
  }
  const ext = abs.split(".").pop() ?? "";
  const name = material.fileName?.trim() || `${titleSlug(material.title)}.${ext}`;
  const body = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "content-type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "content-length": String(size),
      "content-disposition": attachment(name),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
