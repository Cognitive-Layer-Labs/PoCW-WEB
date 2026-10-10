import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/server/auth";
import { adminMaterial } from "@/lib/server/repo";
import { attachment, titleSlug } from "@/lib/server/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGINE_URL = (process.env.ENGINE_URL || "http://engine:3000").replace(/\/+$/, "");
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

type Context = { params: Promise<{ id: string }> };
const notFound = () => new NextResponse("Not found", { status: 404 });

/** The text the engine extracted from a book (what its map and questions come from). Admin only. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const user = await currentUser();
  if (!user || !isAdmin(user)) return notFound();
  const { id } = await context.params;
  const material = /^\d{1,12}$/.test(id) ? adminMaterial(Number(id)) : null;
  if (!material) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(`${ENGINE_URL}/api/index/${encodeURIComponent(material.knowledgeId)}/text`, {
      headers: { authorization: `Bearer ${ENGINE_API_KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(120_000), // link sources may be re-fetched
    });
  } catch {
    return new NextResponse("The engine is unreachable right now", { status: 502 });
  }
  if (upstream.status === 404) return new NextResponse("The engine no longer has this book", { status: 404 });
  if (!upstream.ok || !upstream.body) return new NextResponse("The engine couldn't return this text", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": attachment(`${titleSlug(material.title)}.txt`),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
