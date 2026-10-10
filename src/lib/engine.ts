/**
 * Browser client for the engine. Every call goes to this app's own route
 * handler (/api/engine/...), which checks the session and forwards it.
 */

const BASE = "/api/engine";

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

// ─── Engine shapes ───────────────────────────────────────────────────────────

export type QuestionType = "open" | "mcq" | "true_false";

export interface IndexStatus {
  knowledgeId: string;
  status: "pending" | "indexing" | "ready" | "failed" | string;
  title?: string;
  author?: string;
  error?: string;
  bookId?: number;
}

export interface VerifyQuestion {
  text: string;
  number: number;
  type: QuestionType;
  bloomLevel: string;
  difficulty: number;
  totalQuestions: number;
  options?: string[];
}

export interface StartResponse {
  sessionId: string;
  question: VerifyQuestion;
  maxQuestions?: number;
  attemptId?: number;
}

export interface AnswerFeedback {
  correct: boolean;
  /** 0-100 */
  score: number;
  reasoning: string;
  referenceKeyPoints?: string[];
  correctAnswer?: string;
  progress?: { questionNumber: number; theta: number; se: number; bloomLevel: string };
  isComplete: boolean;
  nextQuestion?: VerifyQuestion;
}

export interface GraphNode {
  id: string;
  label: string;
  bloomLevel?: string;
  importance?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship?: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type Level = "gentle" | "standard" | "challenging";

export interface TestSettings {
  questions: 5 | 10 | 15;
  level: Level;
  types: QuestionType[];
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class EngineError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "EngineError";
  }
  /** The session or book no longer exists. */
  get gone(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

const FRIENDLY: Record<number, string> = {
  401: "You've been signed out. Sign in again to continue.",
  413: "That file is larger than 40 MB.",
  429: "Bookmap is busy right now. Wait a minute and try again.",
  502: "Bookmap can't reach its engine right now. Try again in a moment.",
  503: "The engine is temporarily unavailable. Try again in a moment.",
  504: "The engine took too long to answer. Try again.",
};

function toError(status: number, body: unknown, fallback: string): EngineError {
  const b = (body ?? {}) as { error?: unknown; code?: unknown };
  const code = typeof b.code === "string" ? b.code : undefined;
  const message = FRIENDLY[status] || (typeof b.error === "string" && b.error) || `${fallback} (HTTP ${status}).`;
  return new EngineError(message, status, code);
}

/** A 401 means the session ended: send the reader back to sign in. */
function signedOut(status: number) {
  if (status === 401 && typeof window !== "undefined") {
    window.location.assign(`/?next=${encodeURIComponent(window.location.pathname)}`);
  }
}

async function call<T>(path: string, init: RequestInit, fallback: string): Promise<{ status: number; body: T; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, { cache: "no-store", ...init });
  } catch {
    throw new EngineError("Can't reach Bookmap. Check your connection and try again.", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    signedOut(res.status);
    throw toError(res.status, body, fallback);
  }
  if (body === null) throw new EngineError("The engine sent an unexpected response. Try again in a moment.", res.status);
  return { status: res.status, body: body as T, headers: res.headers };
}

/** Delay before the next status check, honouring Retry-After (2-30 s). */
export function retryAfterMs(headers: Headers | null): number {
  const seconds = Number(headers?.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) return 5000;
  return Math.min(30, Math.max(2, seconds)) * 1000;
}

// ─── Calls ───────────────────────────────────────────────────────────────────

/** Uploads a book with progress events (fetch can't report upload progress). */
export function uploadBook(
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal
): Promise<IndexStatus> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => reject(new EngineError("Upload cancelled.", 0, "ABORTED"));
    xhr.open("POST", `${BASE}/upload`);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new EngineError("The upload was interrupted. Check your connection and try again.", 0));
    xhr.ontimeout = () => reject(new EngineError("The upload took too long. Try again on a faster connection.", 0));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        signedOut(xhr.status);
        reject(toError(xhr.status, body, "Upload failed"));
        return;
      }
      const status = body as IndexStatus | null;
      if (!status?.knowledgeId || !status.bookId) {
        reject(new EngineError("The engine sent an unexpected response. Try again in a moment.", xhr.status));
        return;
      }
      resolve(status);
    };
    xhr.send(file);
  });
}

export async function addLink(source: string): Promise<IndexStatus> {
  const { body } = await call<IndexStatus>(
    "index",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) },
    "Adding that link failed"
  );
  if (!body.knowledgeId || !body.bookId) throw new EngineError("The engine sent an unexpected response. Try again in a moment.", 200);
  return body;
}

export async function getIndexStatus(knowledgeId: string): Promise<{ status: IndexStatus; retryAfterMs: number }> {
  const { body, headers } = await call<IndexStatus>(`index/${encodeURIComponent(knowledgeId)}`, { method: "GET" }, "Status check failed");
  return { status: body, retryAfterMs: retryAfterMs(headers) };
}

export async function getGraph(knowledgeId: string): Promise<KnowledgeGraph> {
  const { body } = await call<KnowledgeGraph>(`graph/${encodeURIComponent(knowledgeId)}`, { method: "GET" }, "Loading the map failed");
  return {
    nodes: Array.isArray(body?.nodes) ? body.nodes : [],
    edges: Array.isArray(body?.edges) ? body.edges : [],
  };
}

export async function startTest(knowledgeId: string, settings: TestSettings): Promise<StartResponse> {
  const { status, body } = await call<StartResponse & { error?: string; code?: string }>(
    "verify",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ knowledgeId, settings }) },
    "Starting the test failed"
  );
  // 202 = the book is still being mapped (INDEXING_IN_PROGRESS), no session yet.
  if (status !== 200 || !body?.sessionId || !body.question) {
    throw new EngineError(
      body?.code === "INDEXING_IN_PROGRESS"
        ? "This book is still being mapped. Try again in a few seconds."
        : body?.error || "The test couldn't start. Try again.",
      status,
      body?.code
    );
  }
  return body;
}

export async function submitAnswer(sessionId: string, answer: string): Promise<AnswerFeedback> {
  const { body } = await call<AnswerFeedback>(
    `verify/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer }) },
    "Sending your answer failed"
  );
  return body;
}

export async function getResult(sessionId: string): Promise<{ attemptId: number }> {
  const { body } = await call<{ attemptId?: number }>(`verify/${encodeURIComponent(sessionId)}/result`, { method: "GET" }, "Loading results failed");
  if (!body.attemptId) throw new EngineError("Your results couldn't be saved. Try again.", 200);
  return { attemptId: body.attemptId };
}

// ─── Client-side validation ──────────────────────────────────────────────────

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

export const ACCEPT_ATTR = ".pdf,.epub,.txt,.md,.markdown,application/pdf,application/epub+zip,text/plain,text/markdown";

/** Returns the content type to upload with, or an error message. */
export function checkFile(file: File): { contentType: string } | { error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXT_TYPES[ext];
  if (!contentType) return { error: `"${file.name}" isn't a PDF, EPUB, .txt or .md file.` };
  if (file.size === 0) return { error: `"${file.name}" is empty.` };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 40 MB.` };
  }
  return { contentType };
}

export function checkUrl(value: string): { url: string } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Paste a link first." };
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: "That doesn't look like a link. It should start with https://." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http:// and https:// links work." };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { error: "That link is missing a domain." };
  }
  return { url: parsed.toString() };
}
