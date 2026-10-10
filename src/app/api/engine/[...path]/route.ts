import { NextRequest, NextResponse } from "next/server";
import { appOrigin, currentUser, type User } from "@/lib/server/auth";
import {
  attemptBySession,
  bookByKnowledgeId,
  createAttempt,
  currentQuestionOf,
  finishAttempt,
  recordAnswer,
  setConceptCount,
  updateBookStatus,
  upsertBook,
  setStoredFile,
  type AttemptSettings,
  type Book,
} from "@/lib/server/repo";
import { saveOriginal } from "@/lib/server/uploads";

/**
 * Same-origin proxy to the PoCW engine.
 *
 *   /api/engine/<path>  ->  ${ENGINE_URL}/api/<path>
 *
 * The engine is never exposed to the browser: this handler requires a signed-in
 * user, checks that the book or test session belongs to them, adds the bearer
 * token server-side, only forwards the routes Bookmap uses, and records books
 * and test results in the app database from the engine's own answers.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGINE_URL = (process.env.ENGINE_URL || "http://engine:3000").replace(/\/+$/, "");
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 300_000;

/** Path segments that stand for an id (knowledgeId / sessionId). */
const ID_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._:-]{0,199}$/;

const UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "application/pdf",
  "application/epub+zip": "application/epub+zip",
  "text/plain": "text/plain; charset=utf-8",
  "text/markdown": "text/markdown; charset=utf-8",
};

type Method = "GET" | "POST";
type Route = "upload" | "index" | "status" | "verify" | "answer" | "result" | "graph";

/**
 * Explicit route table. Anything not listed here (admin routes, listing every
 * indexed document, re-index, title patching, ...) is rejected with 404.
 */
const ROUTES: Array<{ name: Route; method: Method; pattern: string[] }> = [
  { name: "upload", method: "POST", pattern: ["upload"] },
  { name: "index", method: "POST", pattern: ["index"] },
  { name: "status", method: "GET", pattern: ["index", ":id"] },
  { name: "verify", method: "POST", pattern: ["verify"] },
  { name: "answer", method: "POST", pattern: ["verify", ":id", "answer"] },
  { name: "result", method: "GET", pattern: ["verify", ":id", "result"] },
  { name: "graph", method: "GET", pattern: ["graph", ":id"] },
];

const LEVELS: Record<AttemptSettings["level"], { difficulty: number; threshold: number }> = {
  gentle: { difficulty: 0.2, threshold: 0.35 },
  standard: { difficulty: 0.4, threshold: 0.5 },
  challenging: { difficulty: 0.65, threshold: 0.65 },
};
const QUESTION_COUNTS = [5, 10, 15];
const QUESTION_TYPES = ["open", "mcq", "true_false"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function error(status: number, message: string, code = "PROXY_ERROR"): NextResponse {
  return NextResponse.json({ error: message, code }, { status, headers: { "cache-control": "no-store" } });
}

const notFound = () => error(404, "Not found", "NOT_FOUND");

function match(method: Method, segments: string[]): Route | null {
  const route = ROUTES.find(
    (r) =>
      r.method === method &&
      r.pattern.length === segments.length &&
      r.pattern.every((part, i) => (part === ":id" ? ID_SEGMENT.test(segments[i]) : part === segments[i]))
  );
  return route?.name ?? null;
}

/** Reject traversal, encoded separators and empty segments before matching. */
function hasUnsafePath(request: NextRequest, segments: string[]): boolean {
  const raw = request.nextUrl.pathname;
  if (/%2f|%5c|%2e|%00/i.test(raw) || raw.includes("//") || raw.includes("\\")) return true;
  return segments.some(
    (s) => s.length === 0 || s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0")
  );
}

/** State-changing calls must come from our own pages (SameSite=Lax already blocks most of this). */
function crossSite(request: NextRequest): boolean {
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

/** Read the request body, giving up as soon as it exceeds the limit. */
async function readBody(request: NextRequest, limit: number): Promise<Uint8Array<ArrayBuffer> | "too-large"> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) return "too-large";
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
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
  return out;
}

async function readJson(request: NextRequest): Promise<Record<string, unknown> | "too-large" | null> {
  const body = await readBody(request, MAX_JSON_BYTES);
  if (body === "too-large") return body;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface Upstream {
  status: number;
  headers: Headers;
  json: Record<string, unknown> | null;
  text: string;
}

/** Calls the engine. Returns a NextResponse for transport-level failures. */
async function engine(
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
function reply(up: Upstream, extra?: Record<string, unknown>): NextResponse {
  const headers = new Headers({ "cache-control": "no-store" });
  const retryAfter = up.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  if (up.json) return NextResponse.json(extra ? { ...up.json, ...extra } : up.json, { status: up.status, headers });
  headers.set("content-type", up.headers.get("content-type") || "text/plain; charset=utf-8");
  return new NextResponse(up.text, { status: up.status, headers });
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function titleFromFileName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  return base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled book";
}

function titleFromUrl(url: URL): string {
  const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  const cleaned = titleFromFileName(last.replace(/[-]+/g, " "));
  return cleaned && cleaned !== "Untitled book" ? cleaned : url.hostname.replace(/^www\./, "");
}

/** Records an index status for the user's book; counts concepts the first time it is ready. */
async function recordStatus(request: NextRequest, book: Book, status: Record<string, unknown>): Promise<void> {
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

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleUpload(request: NextRequest, user: User): Promise<NextResponse> {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentType = UPLOAD_TYPES[type];
  if (!contentType) return error(415, "Use a PDF, EPUB, .txt or .md file", "UNSUPPORTED_TYPE");

  let fileName = "";
  try {
    fileName = decodeURIComponent(request.headers.get("x-file-name") || "");
  } catch {
    fileName = "";
  }
  fileName = fileName.replace(/[\u0000-\u001f\u007f/\\]+/g, " ").trim().slice(0, 300);

  const bytes = await readBody(request, MAX_UPLOAD_BYTES);
  if (bytes === "too-large") return error(413, "That file is larger than 40 MB", "PAYLOAD_TOO_LARGE");
  if (bytes.byteLength === 0) return error(400, "That file is empty", "EMPTY_BODY");

  const up = await engine(request, "POST", "upload", { bytes, contentType }, UPLOAD_TIMEOUT_MS);
  if (up instanceof NextResponse) return up;
  const knowledgeId = str(up.json?.knowledgeId);
  if (up.status >= 300 || !knowledgeId) return reply(up);

  const book = upsertBook({
    userId: user.id,
    knowledgeId,
    title: titleFromFileName(fileName || "Untitled book"),
    sourceKind: "file",
    fileName: fileName || null,
    status: str(up.json?.status) ?? "pending",
  });
  // Keep the original file for the admin "Materials" section (best effort; never fails the upload).
  const saved = await saveOriginal(knowledgeId, contentType, bytes);
  if (saved) setStoredFile(book.id, saved);
  await recordStatus(request, book, up.json!);
  return reply(up, { bookId: book.id });
}

async function handleIndex(request: NextRequest, user: User): Promise<NextResponse> {
  const body = await readJson(request);
  if (body === "too-large") return error(413, "Request too large", "PAYLOAD_TOO_LARGE");
  let url: URL;
  try {
    url = new URL(String(body?.source ?? "").trim());
  } catch {
    return error(400, "That doesn't look like a link", "INVALID_URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.href.length > 2000) {
    return error(400, "Only http:// and https:// links are supported", "INVALID_URL");
  }

  const bytes = new TextEncoder().encode(JSON.stringify({ source: url.href }));
  const up = await engine(request, "POST", "index", { bytes, contentType: "application/json" });
  if (up instanceof NextResponse) return up;
  const knowledgeId = str(up.json?.knowledgeId);
  if (up.status >= 300 || !knowledgeId) return reply(up);

  const book = upsertBook({
    userId: user.id,
    knowledgeId,
    title: titleFromUrl(url),
    sourceKind: "link",
    sourceUrl: url.href,
    status: str(up.json?.status) ?? "pending",
  });
  await recordStatus(request, book, up.json!);
  return reply(up, { bookId: book.id });
}

async function handleStatus(request: NextRequest, user: User, knowledgeId: string): Promise<NextResponse> {
  const book = bookByKnowledgeId(user.id, knowledgeId);
  if (!book) return notFound();
  const up = await engine(request, "GET", `index/${encodeURIComponent(knowledgeId)}`);
  if (up instanceof NextResponse) return up;
  if (up.json && up.status < 300) await recordStatus(request, book, up.json);
  return reply(up, { bookId: book.id });
}

async function handleGraph(request: NextRequest, user: User, knowledgeId: string): Promise<NextResponse> {
  const book = bookByKnowledgeId(user.id, knowledgeId);
  if (!book) return notFound();
  const up = await engine(request, "GET", `graph/${encodeURIComponent(knowledgeId)}`);
  if (up instanceof NextResponse) return up;
  if (up.status === 200 && Array.isArray(up.json?.nodes) && book.conceptCount !== (up.json!.nodes as unknown[]).length) {
    setConceptCount(book.id, (up.json!.nodes as unknown[]).length);
  }
  return reply(up);
}

/** Starts a test. The engine config is rebuilt here from validated settings. */
async function handleVerify(request: NextRequest, user: User): Promise<NextResponse> {
  const body = await readJson(request);
  if (body === "too-large") return error(413, "Request too large", "PAYLOAD_TOO_LARGE");
  const knowledgeId = str(body?.knowledgeId) ?? "";
  const settings = (body?.settings ?? {}) as Record<string, unknown>;
  const questions = Number(settings.questions);
  const level = str(settings.level) as AttemptSettings["level"] | undefined;
  const types = Array.isArray(settings.types) ? [...new Set(settings.types.filter((t): t is string => QUESTION_TYPES.includes(t as string)))] : [];
  if (!ID_SEGMENT.test(knowledgeId) || !QUESTION_COUNTS.includes(questions) || !level || !LEVELS[level] || types.length === 0) {
    return error(400, "Invalid test settings", "INVALID_SETTINGS");
  }

  const book = bookByKnowledgeId(user.id, knowledgeId);
  if (!book) return notFound();

  const payload = {
    knowledgeId,
    subject: `bookmap-user-${user.id}`,
    config: {
      max_questions: questions,
      difficulty: LEVELS[level].difficulty,
      threshold: LEVELS[level].threshold,
      q_types: types,
      response: "detailed",
    },
  };
  const up = await engine(request, "POST", "verify", {
    bytes: new TextEncoder().encode(JSON.stringify(payload)),
    contentType: "application/json",
  });
  if (up instanceof NextResponse) return up;
  const sessionId = str(up.json?.sessionId);
  if (up.status !== 200 || !sessionId || !ID_SEGMENT.test(sessionId)) return reply(up);

  const attemptId = createAttempt({
    userId: user.id,
    bookId: book.id,
    knowledgeId,
    sessionId,
    settings: { questions, level, types },
    firstQuestion: up.json!.question,
  });
  return reply(up, { attemptId });
}

async function handleAnswer(request: NextRequest, user: User, sessionId: string): Promise<NextResponse> {
  const attempt = attemptBySession(user.id, sessionId);
  if (!attempt) return notFound();
  const body = await readJson(request);
  if (body === "too-large") return error(413, "That answer is too long", "PAYLOAD_TOO_LARGE");
  const answer = str(body?.answer);
  if (!answer || answer.length > 50_000) return error(400, "An answer is required", "INVALID_ANSWER");

  const up = await engine(request, "POST", `verify/${encodeURIComponent(sessionId)}/answer`, {
    bytes: new TextEncoder().encode(JSON.stringify({ answer })),
    contentType: "application/json",
  });
  if (up instanceof NextResponse) return up;

  if (up.status === 200 && up.json) {
    const fb = up.json;
    const q = currentQuestionOf(attempt.id) ?? {};
    const progress = (fb.progress ?? {}) as Record<string, unknown>;
    const number = Number(q.number ?? progress.questionNumber) || attempt.transcript.length + 1;
    recordAnswer(
      attempt.id,
      {
        number,
        question: str(q.text) ?? "",
        type: str(q.type) ?? "open",
        bloomLevel: str(q.bloomLevel),
        options: Array.isArray(q.options) ? (q.options as unknown[]).map(String).slice(0, 10) : undefined,
        answer: answer.slice(0, 4000),
        correct: fb.correct === true,
        score: typeof fb.score === "number" ? fb.score : fb.correct === true ? 100 : 0,
        reasoning: str(fb.reasoning)?.slice(0, 4000),
        correctAnswer: str(fb.correctAnswer)?.slice(0, 500),
        keyPoints: Array.isArray(fb.referenceKeyPoints) ? (fb.referenceKeyPoints as unknown[]).map(String).slice(0, 12) : undefined,
      },
      fb.isComplete === true ? null : (fb.nextQuestion ?? null)
    );
  }
  return reply(up);
}

async function handleResult(request: NextRequest, user: User, sessionId: string): Promise<NextResponse> {
  const attempt = attemptBySession(user.id, sessionId);
  if (!attempt) return notFound();
  const up = await engine(request, "GET", `verify/${encodeURIComponent(sessionId)}/result`);
  if (up instanceof NextResponse) return up;
  if (up.status === 200 && up.json) finishAttempt(attempt.id, up.json);
  return reply(up, up.status === 200 ? { attemptId: attempt.id } : undefined);
}

async function proxy(request: NextRequest, method: Method, segments: string[]): Promise<NextResponse> {
  if (hasUnsafePath(request, segments)) return error(400, "Invalid path");
  const route = match(method, segments);
  if (!route) return notFound();

  const user = await currentUser();
  if (!user) return error(401, "Sign in to continue", "UNAUTHENTICATED");
  if (method === "POST" && crossSite(request)) return error(403, "Cross-site request refused", "FORBIDDEN");
  if (!ENGINE_API_KEY) return error(500, "The engine is not configured on this server", "NOT_CONFIGURED");

  switch (route) {
    case "upload":
      return handleUpload(request, user);
    case "index":
      return handleIndex(request, user);
    case "status":
      return handleStatus(request, user, segments[1]);
    case "graph":
      return handleGraph(request, user, segments[1]);
    case "verify":
      return handleVerify(request, user);
    case "answer":
      return handleAnswer(request, user, segments[1]);
    case "result":
      return handleResult(request, user, segments[1]);
  }
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
