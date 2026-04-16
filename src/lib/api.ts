/**
 * PoCW Oracle API client
 * Browser calls are sent to internal frontend API proxy routes.
 */

const ORACLE_PROXY_BASE = "/api/oracle";

// ─── Types mirroring oracle-service SDK types ────────────────────────────────

export type QuestionType = "open" | "mcq" | "true_false" | "scenario";

export interface VerifyQuestion {
  text: string;
  number: number;
  type: QuestionType;
  bloomLevel: string;
  difficulty: number;
  totalQuestions: number;
  options?: string[];
}

export interface AnswerFeedback {
  correct: boolean;
  score: number;
  reasoning: string;
  dimensions?: {
    accuracy: number;
    depth: number;
    specificity: number;
    reasoning: number;
  };
  progress: {
    questionNumber: number;
    theta: number;
    se: number;
    bloomLevel: string;
  };
  isComplete: boolean;
  /** Included in response when isComplete is false */
  nextQuestion?: VerifyQuestion;
}

export interface ScoreBreakdown {
  question: string;
  type: QuestionType;
  score: number;
  difficulty: number;
  bloomLevel: string;
  correct: boolean;
}

export interface OnchainAttestation {
  type: "onchain";
  signature: string;
  contentId: number;
  score: number;
  oracle: string;
  controllerAddress: string;
  sbtAddress: string;
  nonce: string;
  expiry: number;
  tokenUri: string;
  contentHash: string;
}

export interface OffchainAttestation {
  type: "offchain";
  signature: string;
  contentId: number;
  score: number;
  oracle: string;
  nonce: string;
  expiry: number;
  tokenUri: string;
  contentHash: string;
}

export type AttestationResult = OnchainAttestation | OffchainAttestation;

export interface PoCWDisclaimers {
  irtCalibration: string;
  bloomMapping: string;
  thresholdSemantics: string;
}

export interface PoCWResult {
  competenceIndicator: boolean;
  score: number;
  theta: number;
  se: number;
  converged: boolean;
  confidence_interval: [number, number];
  questions_asked: number;
  response_detail?: ScoreBreakdown[];
  attestation?: AttestationResult;
  knowledgeId: string;
  contentId: number;
  subject: string;
  timestamp: string;
  tokenUri?: string;
  disclaimers: PoCWDisclaimers;
}

export interface ChainConfig {
  controllerAddress: string;
  sbtAddress: string;
  rpc?: string;
}

export interface SessionConfig {
  max_questions?: number;
  difficulty?: number;
  q_types?: QuestionType[];
  threshold?: number;
  response?: "boolean" | "score" | "detailed";
  model?: string;
  language?: string;
  persona?: string;
  attest?: "onchain" | "offchain" | "none";
  chain?: ChainConfig;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Upload a raw file (PDF or text). The backend extracts text server-side. */
export async function uploadFile(
  file: File
): Promise<{ knowledgeId: string; status: string; contentId?: number }> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_PROXY_BASE}/upload`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: await file.arrayBuffer(),
    });
  } catch (err) {
    throw oracleConnectionError(err);
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Upload failed"));
  }
  return res.json();
}

export async function indexContent(
  source: string
): Promise<{ knowledgeId: string; status: string; contentId?: number }> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_PROXY_BASE}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
  } catch (err) {
    throw oracleConnectionError(err);
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Indexing failed"));
  }
  return res.json();
}

export async function pollIndexStatus(
  knowledgeId: string
): Promise<{ knowledgeId: string; status: string; error?: string }> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_PROXY_BASE}/index/${knowledgeId}`);
  } catch (err) {
    throw oracleConnectionError(err);
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Status check failed"));
  }
  return res.json();
}

export async function startVerify(
  knowledgeId: string,
  subject: string,
  config?: SessionConfig
): Promise<{ sessionId: string; question: VerifyQuestion }> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_PROXY_BASE}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeId, subject, config }),
    });
  } catch (err) {
    throw oracleConnectionError(err);
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Verify start failed"));
  }
  return res.json();
}

export async function submitAnswer(
  sessionId: string,
  answer: string
): Promise<AnswerFeedback> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_PROXY_BASE}/verify/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
  } catch (err) {
    throw oracleConnectionError(err);
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Answer submission failed"));
  }
  return res.json();
}

export async function getResult(sessionId: string): Promise<PoCWResult> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_PROXY_BASE}/verify/${sessionId}/result`);
  } catch (err) {
    throw oracleConnectionError(err);
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Result fetch failed"));
  }
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a human-readable error message from a failed response.
 * Prefers the `error` field from a JSON body; falls back to a short status description.
 */
async function extractErrorMessage(res: Response, prefix: string): Promise<string> {
  if (res.status === 401) {
    return (
      `${prefix}: Oracle API authentication failed (401). ` +
      "Check frontend server POCW_API_KEY and oracle POCW_API_KEY values."
    );
  }

  try {
    const body = await res.clone().json();
    if (typeof body?.error === "string") {
      return `${prefix}: ${body.error}`;
    }
  } catch {
    // not JSON — fall through
  }
  return `${prefix} (${res.status} ${res.statusText})`;
}

function oracleConnectionError(err: unknown): Error {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return new Error(
      `Cannot reach frontend oracle proxy route at ${ORACLE_PROXY_BASE}. ` +
      "Make sure Next.js is running and POCW_ORACLE_BASE_URL points to a reachable oracle backend."
    );
  }
  return err instanceof Error ? err : new Error("Unknown error");
}
