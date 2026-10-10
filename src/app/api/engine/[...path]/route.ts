import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin proxy to the PoCW engine.
 *
 *   /api/engine/<path>  ->  ${ENGINE_URL}/api/<path>
 *
 * The engine is never exposed to the browser: this handler adds the bearer
 * token server-side and only forwards the handful of routes the landing uses.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGINE_URL = (process.env.ENGINE_URL || "http://engine:3000").replace(/\/+$/, "");
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;

/** Path segments that stand for an id (knowledgeId / sessionId). */
const ID_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._:-]{0,199}$/;

type Method = "GET" | "POST";

/**
 * Explicit route table. Anything not listed here (admin routes, listing every
 * indexed document, re-index, title patching, ...) is rejected with 404.
 */
const ROUTES: Array<{ method: Method; pattern: string[] }> = [
  { method: "POST", pattern: ["upload"] },
  { method: "POST", pattern: ["index"] },
  { method: "GET", pattern: ["index", ":id"] },
  { method: "POST", pattern: ["verify"] },
  { method: "POST", pattern: ["verify", ":id", "answer"] },
  { method: "GET", pattern: ["verify", ":id", "result"] },
  { method: "GET", pattern: ["graph", ":id"] },
];

function error(status: number, message: string, code = "PROXY_ERROR"): NextResponse {
  return NextResponse.json({ error: message, code }, { status, headers: { "cache-control": "no-store" } });
}

function isAllowed(method: Method, segments: string[]): boolean {
  return ROUTES.some(
    (route) =>
      route.method === method &&
      route.pattern.length === segments.length &&
      route.pattern.every((part, i) => (part === ":id" ? ID_SEGMENT.test(segments[i]) : part === segments[i]))
  );
}

/** Reject traversal, encoded separators and empty segments before matching. */
function hasUnsafePath(request: NextRequest, segments: string[]): boolean {
  const raw = request.nextUrl.pathname;
  if (/%2f|%5c|%2e|%00/i.test(raw) || raw.includes("//") || raw.includes("\\")) return true;
  return segments.some(
    (s) => s.length === 0 || s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0")
  );
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || null;
}

/** Read the request body, giving up as soon as it exceeds the limit. */
async function readBody(request: NextRequest): Promise<ArrayBuffer | "too-large"> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return "too-large";
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "too-large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

async function proxy(request: NextRequest, method: Method, segments: string[]): Promise<NextResponse> {
  if (hasUnsafePath(request, segments)) return error(400, "Invalid path");
  if (!isAllowed(method, segments)) return error(404, "Not found", "NOT_FOUND");
  if (!ENGINE_API_KEY) return error(500, "The engine is not configured on this server", "NOT_CONFIGURED");

  const target = `${ENGINE_URL}/api/${segments.join("/")}`;

  const headers = new Headers({ authorization: `Bearer ${ENGINE_API_KEY}`, accept: "application/json" });
  const ip = clientIp(request);
  if (ip) headers.set("x-forwarded-for", ip);

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    const read = await readBody(request);
    if (read === "too-large") return error(413, "That file is larger than 10 MB", "PAYLOAD_TOO_LARGE");
    body = read;
    headers.set("content-type", request.headers.get("content-type") || "application/octet-stream");
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return timedOut
      ? error(504, "The engine took too long to answer", "UPSTREAM_TIMEOUT")
      : error(502, "The engine is unreachable right now", "UPSTREAM_UNREACHABLE");
  }

  const responseHeaders = new Headers({ "cache-control": "no-store" });
  for (const name of ["content-type", "retry-after"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  // Never leak upstream auth problems as-is: they are a server misconfiguration.
  if (upstream.status === 401) {
    await upstream.body?.cancel().catch(() => undefined);
    return error(502, "The engine rejected this server's credentials", "UPSTREAM_AUTH");
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, "GET", path ?? []);
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, "POST", path ?? []);
}
