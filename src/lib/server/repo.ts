import crypto from "node:crypto";
import { db, now } from "./db";

/** Data access for books, attempts, shares and the admin view. */

// ─── Types ───────────────────────────────────────────────────────────────────

export type BookStatus = "pending" | "indexing" | "ready" | "failed";

export interface Book {
  id: number;
  userId: number;
  knowledgeId: string;
  title: string;
  author: string | null;
  sourceKind: "file" | "link";
  sourceUrl: string | null;
  fileName: string | null;
  status: BookStatus;
  error: string | null;
  conceptCount: number | null;
  addedAt: string;
}

export interface ShelfBook extends Book {
  attempts: number;
  bestScore: number | null;
  lastScore: number | null;
  lastTestedAt: string | null;
}

export interface AttemptSettings {
  questions: number;
  level: "gentle" | "standard" | "challenging";
  types: string[];
}

export interface ConceptOutcome {
  id: string;
  label: string;
  asked: number;
  correct: number;
  mastered: boolean;
}

export interface TranscriptItem {
  number: number;
  question: string;
  type: string;
  bloomLevel?: string;
  options?: string[];
  answer: string;
  correct: boolean;
  score: number;
  reasoning?: string;
  correctAnswer?: string;
  keyPoints?: string[];
}

export interface ResponseDetail {
  question: string;
  type: string;
  score: number;
  difficulty: number;
  bloomLevel: string;
  correct: boolean;
  conceptId?: string | null;
}

export interface Attempt {
  id: number;
  userId: number;
  bookId: number;
  knowledgeId: string;
  sessionId: string;
  settings: AttemptSettings;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  theta: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  competence: boolean | null;
  questionsAsked: number | null;
  concepts: ConceptOutcome[];
  responseDetail: ResponseDetail[];
  transcript: TranscriptItem[];
  disclaimers: Record<string, string>;
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toBook(r: any): Book {
  return {
    id: r.id,
    userId: r.user_id,
    knowledgeId: r.knowledge_id,
    title: r.title,
    author: r.author,
    sourceKind: r.source_kind,
    sourceUrl: r.source_url,
    fileName: r.file_name,
    status: r.status,
    error: r.error,
    conceptCount: r.concept_count,
    addedAt: r.added_at,
  };
}

function toAttempt(r: any): Attempt {
  const detail = parse<{ items?: ResponseDetail[]; disclaimers?: Record<string, string> }>(r.response_detail, {});
  return {
    id: r.id,
    userId: r.user_id,
    bookId: r.book_id,
    knowledgeId: r.knowledge_id,
    sessionId: r.session_id,
    settings: parse<AttemptSettings>(r.settings, { questions: 0, level: "standard", types: [] }),
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    score: r.score,
    theta: r.theta,
    ciLow: r.ci_low,
    ciHigh: r.ci_high,
    competence: r.competence === null || r.competence === undefined ? null : !!r.competence,
    questionsAsked: r.questions_asked,
    concepts: parse<ConceptOutcome[]>(r.concepts, []),
    responseDetail: detail.items ?? [],
    transcript: parse<TranscriptItem[]>(r.transcript, []),
    disclaimers: detail.disclaimers ?? {},
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Books ───────────────────────────────────────────────────────────────────

export function upsertBook(input: {
  userId: number;
  knowledgeId: string;
  title: string;
  sourceKind: "file" | "link";
  sourceUrl?: string | null;
  fileName?: string | null;
  status: string;
}): Book {
  const row = db()
    .prepare(
      `INSERT INTO books (user_id, knowledge_id, title, source_kind, source_url, file_name, status, added_at)
       VALUES (@userId, @knowledgeId, @title, @sourceKind, @sourceUrl, @fileName, @status, @t)
       ON CONFLICT(user_id, knowledge_id) DO UPDATE SET
         status = CASE WHEN books.status = 'ready' THEN books.status ELSE excluded.status END,
         error = CASE WHEN excluded.status = 'failed' THEN books.error ELSE NULL END
       RETURNING *`
    )
    .get({
      userId: input.userId,
      knowledgeId: input.knowledgeId,
      title: input.title.slice(0, 300) || "Untitled book",
      sourceKind: input.sourceKind,
      sourceUrl: input.sourceUrl?.slice(0, 2000) ?? null,
      fileName: input.fileName?.slice(0, 300) ?? null,
      status: normaliseStatus(input.status),
      t: now(),
    });
  return toBook(row);
}

function normaliseStatus(s: string): BookStatus {
  return s === "ready" || s === "failed" || s === "indexing" ? s : "pending";
}

export function bookForUser(userId: number, bookId: number): Book | null {
  const row = db().prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(bookId, userId);
  return row ? toBook(row) : null;
}

export function bookByKnowledgeId(userId: number, knowledgeId: string): Book | null {
  const row = db().prepare("SELECT * FROM books WHERE knowledge_id = ? AND user_id = ?").get(knowledgeId, userId);
  return row ? toBook(row) : null;
}

/** Applies an engine index status to every copy of this book the user has. */
export function updateBookStatus(
  bookId: number,
  status: { status: string; title?: unknown; author?: unknown; error?: unknown }
): void {
  const title = typeof status.title === "string" && status.title.trim() ? status.title.trim().slice(0, 300) : null;
  const author = typeof status.author === "string" && status.author.trim() ? status.author.trim().slice(0, 200) : null;
  const error = typeof status.error === "string" && status.error ? status.error.slice(0, 500) : null;
  db()
    .prepare(
      `UPDATE books SET
         status = @status,
         title = COALESCE(@title, title),
         author = COALESCE(@author, author),
         error = CASE WHEN @status = 'failed' THEN @error ELSE NULL END
       WHERE id = @id`
    )
    .run({ id: bookId, status: normaliseStatus(status.status), title, author, error });
}

export function setConceptCount(bookId: number, count: number): void {
  db().prepare("UPDATE books SET concept_count = ? WHERE id = ?").run(count, bookId);
}

export function deleteBook(userId: number, bookId: number): boolean {
  return db().prepare("DELETE FROM books WHERE id = ? AND user_id = ?").run(bookId, userId).changes > 0;
}

export function shelf(userId: number): ShelfBook[] {
  const rows = db()
    .prepare(
      `SELECT b.*,
              (SELECT COUNT(*) FROM attempts a WHERE a.book_id = b.id AND a.finished_at IS NOT NULL) AS n_attempts,
              (SELECT MAX(score) FROM attempts a WHERE a.book_id = b.id AND a.finished_at IS NOT NULL) AS best_score,
              (SELECT score FROM attempts a WHERE a.book_id = b.id AND a.finished_at IS NOT NULL
                ORDER BY a.finished_at DESC LIMIT 1) AS last_score,
              (SELECT MAX(finished_at) FROM attempts a WHERE a.book_id = b.id) AS last_tested_at
         FROM books b
        WHERE b.user_id = ?
        ORDER BY COALESCE(last_tested_at, b.added_at) DESC, b.id DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ...toBook(r),
    attempts: Number(r.n_attempts) || 0,
    bestScore: (r.best_score as number | null) ?? null,
    lastScore: (r.last_score as number | null) ?? null,
    lastTestedAt: (r.last_tested_at as string | null) ?? null,
  }));
}

// ─── Attempts ────────────────────────────────────────────────────────────────

export function createAttempt(input: {
  userId: number;
  bookId: number;
  knowledgeId: string;
  sessionId: string;
  settings: AttemptSettings;
  firstQuestion: unknown;
}): number {
  const res = db()
    .prepare(
      `INSERT INTO attempts (user_id, book_id, knowledge_id, session_id, settings, started_at, transcript, current_question)
       VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`
    )
    .run(
      input.userId,
      input.bookId,
      input.knowledgeId,
      input.sessionId,
      JSON.stringify(input.settings),
      now(),
      JSON.stringify(input.firstQuestion ?? null)
    );
  return Number(res.lastInsertRowid);
}

export function attemptBySession(userId: number, sessionId: string): Attempt | null {
  const row = db().prepare("SELECT * FROM attempts WHERE session_id = ? AND user_id = ?").get(sessionId, userId);
  return row ? toAttempt(row) : null;
}

export function attemptForUser(userId: number, attemptId: number): Attempt | null {
  const row = db().prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?").get(attemptId, userId);
  return row ? toAttempt(row) : null;
}

export function currentQuestionOf(attemptId: number): Record<string, unknown> | null {
  const row = db().prepare("SELECT current_question FROM attempts WHERE id = ?").get(attemptId) as
    | { current_question: string | null }
    | undefined;
  return parse<Record<string, unknown> | null>(row?.current_question, null);
}

/** Appends one graded answer to the attempt's transcript and moves on to the next question. */
export function recordAnswer(attemptId: number, item: TranscriptItem, nextQuestion: unknown): void {
  const conn = db();
  conn.transaction(() => {
    const row = conn.prepare("SELECT transcript FROM attempts WHERE id = ?").get(attemptId) as { transcript: string | null } | undefined;
    const list = parse<TranscriptItem[]>(row?.transcript, []);
    if (!list.some((x) => x.number === item.number)) list.push(item);
    conn
      .prepare("UPDATE attempts SET transcript = ?, current_question = ? WHERE id = ?")
      .run(JSON.stringify(list), JSON.stringify(nextQuestion ?? null), attemptId);
  })();
}

/** Stores the engine's final result (idempotent: the engine freezes it). */
export function finishAttempt(
  attemptId: number,
  result: {
    score?: unknown;
    theta?: unknown;
    confidence_interval?: unknown;
    competenceIndicator?: unknown;
    questions_asked?: unknown;
    concepts?: unknown;
    response_detail?: unknown;
    disclaimers?: unknown;
  }
): void {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const ci = Array.isArray(result.confidence_interval) ? result.confidence_interval : [];
  db()
    .prepare(
      `UPDATE attempts SET
         finished_at = COALESCE(finished_at, @t),
         score = @score, theta = @theta, ci_low = @lo, ci_high = @hi,
         competence = @competence, questions_asked = @asked,
         concepts = @concepts, response_detail = @detail, current_question = NULL
       WHERE id = @id`
    )
    .run({
      id: attemptId,
      t: now(),
      score: num(result.score),
      theta: num(result.theta),
      lo: num(ci[0]),
      hi: num(ci[1]),
      competence: typeof result.competenceIndicator === "boolean" ? (result.competenceIndicator ? 1 : 0) : null,
      asked: num(result.questions_asked),
      concepts: JSON.stringify(Array.isArray(result.concepts) ? result.concepts : []),
      detail: JSON.stringify({
        items: Array.isArray(result.response_detail) ? result.response_detail : [],
        disclaimers: result.disclaimers && typeof result.disclaimers === "object" ? result.disclaimers : {},
      }),
    });
}

export function attemptsForBook(userId: number, bookId: number): Attempt[] {
  return (
    db()
      .prepare(
        `SELECT * FROM attempts WHERE user_id = ? AND book_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC`
      )
      .all(userId, bookId) as unknown[]
  ).map(toAttempt);
}

// ─── Shares ──────────────────────────────────────────────────────────────────

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newSlug(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return out;
}

/** One public link per attempt; returns the existing one when there is one. */
export function shareAttempt(attemptId: number): string {
  const existing = db().prepare("SELECT slug FROM shares WHERE attempt_id = ?").get(attemptId) as { slug: string } | undefined;
  if (existing) return existing.slug;
  for (let i = 0; i < 5; i++) {
    const slug = newSlug();
    try {
      db().prepare("INSERT INTO shares (slug, attempt_id, created_at) VALUES (?, ?, ?)").run(slug, attemptId, now());
      return slug;
    } catch (err) {
      if (!(err instanceof Error) || !/UNIQUE/.test(err.message)) throw err;
      const again = db().prepare("SELECT slug FROM shares WHERE attempt_id = ?").get(attemptId) as { slug: string } | undefined;
      if (again) return again.slug;
    }
  }
  throw new Error("Could not create a share link");
}

export interface SharedResult {
  slug: string;
  name: string | null;
  bookTitle: string;
  bookAuthor: string | null;
  score: number;
  mastered: number;
  tested: number;
  conceptTotal: number;
  questions: number;
  concepts: ConceptOutcome[];
  finishedAt: string;
}

export function sharedResult(slug: string): SharedResult | null {
  if (!/^[A-Za-z0-9]{6,32}$/.test(slug)) return null;
  const row = db()
    .prepare(
      `SELECT s.slug, u.name, b.title, b.author, a.score, a.concepts, a.questions_asked, a.finished_at
         FROM shares s
         JOIN attempts a ON a.id = s.attempt_id
         JOIN books b ON b.id = a.book_id
         JOIN users u ON u.id = a.user_id
        WHERE s.slug = ? AND a.finished_at IS NOT NULL`
    )
    .get(slug) as
    | { slug: string; name: string | null; title: string; author: string | null; score: number; concepts: string; questions_asked: number; finished_at: string }
    | undefined;
  if (!row) return null;
  const concepts = parse<ConceptOutcome[]>(row.concepts, []);
  const tested = concepts.filter((c) => c.asked > 0);
  return {
    slug: row.slug,
    name: row.name,
    bookTitle: row.title,
    bookAuthor: row.author,
    score: Math.round(row.score ?? 0),
    mastered: tested.filter((c) => c.mastered).length,
    tested: tested.length,
    conceptTotal: concepts.length,
    questions: row.questions_asked ?? 0,
    concepts,
    finishedAt: row.finished_at,
  };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminOverview {
  totals: { users: number; books: number; attempts: number; avgScore: number | null };
  users: Array<{
    id: number;
    name: string | null;
    email: string;
    createdAt: string;
    lastSeenAt: string | null;
    books: number;
    attempts: number;
  }>;
  recent: Array<{
    id: number;
    userName: string | null;
    userEmail: string;
    bookTitle: string;
    score: number | null;
    questions: number | null;
    startedAt: string;
    finishedAt: string | null;
  }>;
}

export function adminOverview(): AdminOverview {
  const conn = db();
  const totals = conn
    .prepare(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM books) AS books,
              (SELECT COUNT(*) FROM attempts WHERE finished_at IS NOT NULL) AS attempts,
              (SELECT AVG(score) FROM attempts WHERE finished_at IS NOT NULL) AS avg_score`
    )
    .get() as { users: number; books: number; attempts: number; avg_score: number | null };
  const users = conn
    .prepare(
      `SELECT u.id, u.name, u.email, u.created_at, u.last_seen_at,
              (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id) AS books,
              (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) AS attempts
         FROM users u
        ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
        LIMIT 500`
    )
    .all() as Array<{ id: number; name: string | null; email: string; created_at: string; last_seen_at: string | null; books: number; attempts: number }>;
  const recent = conn
    .prepare(
      `SELECT a.id, u.name, u.email, b.title, a.score, a.questions_asked, a.started_at, a.finished_at
         FROM attempts a JOIN users u ON u.id = a.user_id JOIN books b ON b.id = a.book_id
        ORDER BY a.started_at DESC
        LIMIT 50`
    )
    .all() as Array<{ id: number; name: string | null; email: string; title: string; score: number | null; questions_asked: number | null; started_at: string; finished_at: string | null }>;
  return {
    totals: { users: totals.users, books: totals.books, attempts: totals.attempts, avgScore: totals.avg_score },
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.created_at,
      lastSeenAt: u.last_seen_at,
      books: u.books,
      attempts: u.attempts,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      userName: r.name,
      userEmail: r.email,
      bookTitle: r.title,
      score: r.score,
      questions: r.questions_asked,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    })),
  };
}
