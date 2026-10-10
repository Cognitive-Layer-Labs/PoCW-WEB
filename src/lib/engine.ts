/**
 * Browser client for the PoCW engine. Every call goes to this app's own
 * route handler (/api/engine/...), which forwards it to the engine.
 */

const BASE = "/api/engine";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// ─── Engine shapes ───────────────────────────────────────────────────────────

export type QuestionType = "open" | "mcq" | "true_false";

export interface IndexStatus {
  knowledgeId: string;
  status: "pending" | "indexing" | "ready" | "failed" | string;
  title?: string;
  source?: string;
  error?: string;
  contentId?: number;
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
  importantConceptCount?: number;
  maxQuestions?: number;
}

export interface AnswerFeedback {
  correct: boolean;
  /** 0-100 */
  score: number;
  reasoning: string;
  referenceKeyPoints?: string[];
  correctAnswer?: string;
  progress: { questionNumber: number; theta: number; se: number; bloomLevel: string };
  isComplete: boolean;
  nextQuestion?: VerifyQuestion;
}

export interface ResponseDetail {
  question: string;
  type: QuestionType;
  /** 0-100 */
  score: number;
  difficulty: number;
  bloomLevel: string;
  correct: boolean;
  conceptId?: string;
}

export interface ConceptOutcome {
  id: string;
  label: string;
  asked: number;
  correct: number;
  mastered: boolean;
}

export interface PoCWResult {
  competenceIndicator: boolean;
  /** 0-100, projected from theta */
  score: number;
  theta: number;
  se: number;
  converged: boolean;
  /** 0-100 */
  confidence_interval: [number, number];
  questions_asked: number;
  response_detail?: ResponseDetail[];
  concepts?: ConceptOutcome[];
  knowledgeId: string;
  subject?: string;
  timestamp?: string;
  disclaimers?: Record<string, string>;
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
  contentId?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type Difficulty = "easy" | "medium" | "hard";

export interface TestSettings {
  questions: number;
  difficulty: Difficulty;
  types: QuestionType[];
}

// Mirrors the engine's difficulty presets, but sent as explicit values so the
// learner's chosen question count is respected (the preset would override it).
const DIFFICULTY_VALUES: Record<Difficulty, { difficulty: number; threshold: number }> = {
  easy: { difficulty: 0.2, threshold: 0.35 },
  medium: { difficulty: 0.4, threshold: 0.5 },
  hard: { difficulty: 0.65, threshold: 0.65 },
};

// ─── Errors ──────────────────────────────────────────────────────────────────

export class EngineError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "EngineError";
  }
  /** The session or document no longer exists on the engine. */
  get gone(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

const FRIENDLY: Record<number, string> = {
  413: "That file is larger than 10 MB.",
  429: "The engine is busy right now. Wait a minute and try again.",
  502: "The engine is unreachable right now. Try again in a moment.",
  503: "The engine is temporarily unavailable. Try again in a moment.",
  504: "The engine took too long to answer. Try again.",
};

async function toError(res: Response, fallback: string): Promise<EngineError> {
  let message = FRIENDLY[res.status];
  let code: string | undefined;
  try {
    const body = await res.json();
    code = typeof body?.code === "string" ? body.code : undefined;
    if (!message && typeof body?.error === "string" && body.error) message = body.error;
  } catch {
    /* not JSON */
  }
  return new EngineError(message || `${fallback} (HTTP ${res.status}).`, res.status, code);
}

async function call(path: string, init: RequestInit, fallback: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, { cache: "no-store", ...init });
  } catch {
    throw new EngineError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (!res.ok) throw await toError(res, fallback);
  return res;
}

function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) return 5000;
  return Math.min(30, Math.max(2, seconds)) * 1000;
}

export interface IndexPoll {
  status: IndexStatus;
  /** Present while the document is still being indexed. */
  retryAfterMs?: number;
}

async function asPoll(res: Response): Promise<IndexPoll> {
  const status = (await res.json()) as IndexStatus;
  return status.status === "ready" ? { status } : { status, retryAfterMs: retryAfterMs(res) };
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export async function uploadDocument(body: Blob, contentType: string): Promise<IndexPoll> {
  const res = await call(
    "upload",
    { method: "POST", headers: { "content-type": contentType }, body },
    "Upload failed"
  );
  return asPoll(res);
}

export async function indexUrl(source: string): Promise<IndexPoll> {
  const res = await call(
    "index",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) },
    "Indexing failed"
  );
  return asPoll(res);
}

export async function getIndexStatus(knowledgeId: string): Promise<IndexPoll> {
  const res = await call(`index/${encodeURIComponent(knowledgeId)}`, { method: "GET" }, "Status check failed");
  return asPoll(res);
}

export async function getGraph(knowledgeId: string): Promise<KnowledgeGraph> {
  const res = await call(`graph/${encodeURIComponent(knowledgeId)}`, { method: "GET" }, "Loading the graph failed");
  const graph = (await res.json()) as KnowledgeGraph;
  return { ...graph, nodes: graph.nodes ?? [], edges: graph.edges ?? [] };
}

export async function startTest(knowledgeId: string, settings: TestSettings): Promise<StartResponse> {
  const { difficulty, threshold } = DIFFICULTY_VALUES[settings.difficulty];
  const res = await call(
    "verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        knowledgeId,
        subject: "anonymous",
        config: {
          max_questions: settings.questions,
          difficulty,
          threshold,
          q_types: settings.types,
          response: "detailed",
        },
      }),
    },
    "Starting the test failed"
  );
  return res.json();
}

export async function submitAnswer(sessionId: string, answer: string): Promise<AnswerFeedback> {
  const res = await call(
    `verify/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer }) },
    "Sending your answer failed"
  );
  return res.json();
}

export async function getResult(sessionId: string): Promise<PoCWResult> {
  const res = await call(`verify/${encodeURIComponent(sessionId)}/result`, { method: "GET" }, "Loading results failed");
  return res.json();
}

// ─── Client-side validation ──────────────────────────────────────────────────

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

export const ACCEPT_ATTR = ".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown";

/** Returns the content type to upload with, or an error message. */
export function checkFile(file: File): { contentType: string } | { error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXT_TYPES[ext];
  if (!contentType) return { error: `"${file.name}" isn't supported. Use a PDF, .txt or .md file.` };
  if (file.size === 0) return { error: `"${file.name}" is empty.` };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.` };
  }
  return { contentType: contentType === "text/markdown" ? "text/markdown; charset=utf-8" : contentType === "text/plain" ? "text/plain; charset=utf-8" : contentType };
}

export function checkUrl(value: string): { url: string } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Paste a link first." };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "That doesn't look like a link. It should start with http:// or https://." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http:// and https:// links are supported." };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { error: "That link is missing a domain." };
  }
  return { url: parsed.toString() };
}
