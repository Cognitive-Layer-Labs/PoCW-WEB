import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/server/auth";
import { setConceptCount, updateBookStatus, upsertBook, type Book } from "@/lib/server/repo";

/**
 * Talking to the PoCW engine on a reader's behalf, shared by the engine proxy
 * (/api/engine/...) and the catalog routes: the bearer token is added here, the
 * reader's IP is forwarded for the engine's rate limit, and books are recorded
 * in the app database from the engine's own answers.
 */

const ENGINE_URL = (process.env.ENGINE_URL || "http://engine:3000").replace(/\/+$/, "");
export const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

const UPSTREAM_TIMEOUT_MS = 120_000;

export type Method = "GET" | "POST";

export function error(status: number, message: string, code = "PROXY_ERROR"): NextResponse {
  return NextResponse.json({ error: message, code }, { status, headers: { "cache-control": "no-store" } });
}

/** State-changing calls must come from our own pages (SameSite=Lax already blocks most of this). */
export function crossSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin !== appOrigin();
}

/**
 * Client IP for the engine's per-IP rate limit. Uses the right-most
 * X-Forwarded-For entry: that one is written by our own reverse proxy (Caddy
 * replaces the header, nginx-style proxies append), while anything to its left
 * is client-controlled and would let a caller pick a fresh rate-limit bucket
 * on every request.
 */
function clientIp(request: NextRequest): string | null {
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const last = hops[hops.length - 1];
  if (last && last.length <= 64) return last;
  return null;
}

export interface Upstream {
  status: number;
  headers: Headers;
  json: Record<string, unknown> | null;
  text: string;
}

/** Calls the engine. Returns a NextResponse for transport-level failures. */
export async function engine(
  request: NextRequest,
  method: Method,
  path: string,
  body?: { bytes: Uint8Array<ArrayBuffer>; contentType: string },
  timeoutMs = UPSTREAM_TIMEOUT_MS
): Promise<Upstream | NextResponse> {
  const headers = new Headers({ authorization: `Bearer ${ENGINE_API_KEY}`, accept: "application/json" });
  const ip = clientIp(request);
  if (ip) headers.set("x-forwarded-for", ip);
  if (body) headers.set("content-type", body.contentType);

  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/${path}`, {
      method,
      headers,
      body: body?.bytes,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return timedOut
      ? error(504, "The engine took too long to answer", "UPSTREAM_TIMEOUT")
      : error(502, "The engine is unreachable right now", "UPSTREAM_UNREACHABLE");
  }

  // Never leak upstream auth problems as-is: they are a server misconfiguration.
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined);
    return error(502, "The engine rejected this server's credentials", "UPSTREAM_AUTH");
  }

  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed;
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, json, text };
}

/** Pass the engine's answer through (status, Retry-After, body), optionally with extra fields. */
export function reply(up: Upstream, extra?: Record<string, unknown>): NextResponse {
  const headers = new Headers({ "cache-control": "no-store" });
  const retryAfter = up.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  if (up.json) return NextResponse.json(extra ? { ...up.json, ...extra } : up.json, { status: up.status, headers });
  headers.set("content-type", up.headers.get("content-type") || "text/plain; charset=utf-8");
  return new NextResponse(up.text, { status: up.status, headers });
}

export const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Records an index status for the user's book; counts concepts the first time it is ready. */
export async function recordStatus(request: NextRequest, book: Book, status: Record<string, unknown>): Promise<void> {
  const s = str(status.status);
  if (!s) return;
  updateBookStatus(book.id, { status: s, title: status.title, author: status.author, error: status.error });
  if (s === "ready" && book.conceptCount === null) {
    const graph = await engine(request, "GET", `graph/${encodeURIComponent(book.knowledgeId)}`, undefined, 15_000);
    if (!(graph instanceof NextResponse) && graph.status === 200 && Array.isArray(graph.json?.nodes)) {
      setConceptCount(book.id, (graph.json!.nodes as unknown[]).length);
    }
  }
}

/**
 * Asks the engine to index an http(s) link and records the book on the reader's shelf. A book
 * picked from the catalog brings its own title, author and cover, which then stay put.
 */
export async function indexLinkForUser(
  request: NextRequest,
  userId: number,
  url: URL,
  fallbackTitle: string,
  catalog?: { key: string; title: string; author: string | null; coverUrl: string | null }
): Promise<{ response: NextResponse; book: Book | null }> {
  const bytes = new TextEncoder().encode(JSON.stringify({ source: url.href }));
  const up = await engine(request, "POST", "index", { bytes, contentType: "application/json" });
  if (up instanceof NextResponse) return { response: up, book: null };
  const knowledgeId = str(up.json?.knowledgeId);
  if (up.status >= 300 || !knowledgeId) return { response: reply(up), book: null };

  const book = upsertBook({
    userId,
    knowledgeId,
    title: catalog?.title ?? fallbackTitle,
    author: catalog?.author ?? null,
    coverUrl: catalog?.coverUrl ?? null,
    catalogKey: catalog?.key ?? null,
    sourceKind: "link",
    sourceUrl: url.href,
    status: str(up.json?.status) ?? "pending",
  });
  await recordStatus(request, book, up.json!);
  return { response: reply(up, { bookId: book.id }), book };
}
