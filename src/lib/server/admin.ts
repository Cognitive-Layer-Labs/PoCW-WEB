import { db } from "./db";
import type { BookStatus } from "./repo";

/**
 * Read-only queries for the admin dashboard. Every aggregate is computed in
 * SQLite; callers must have checked isAdmin first. Times are ISO-8601 UTC
 * strings, so they compare and group (substr 1..10 = the UTC day) as text.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** LIKE pattern for a free-text search, with %, _ and \ escaped (use ESCAPE '\'). */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The last `days` UTC days, oldest first, as YYYY-MM-DD. */
export function lastDays(days: number, nowMs = Date.now()): string[] {
  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => iso(today.getTime() - (days - 1 - i) * DAY_MS).slice(0, 10));
}

function fill(days: string[], rows: Row[]): number[] {
  const by = new Map(rows.map((r) => [r.d as string, num(r.n)]));
  return days.map((d) => by.get(d) ?? 0);
}

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

function clampPage(page: number, total: number, pageSize: number): number {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, Math.floor(page) || 1), last);
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface WindowStats {
  readersAtEnd: number;
  newReaders: number;
  activeReaders: number;
  booksAdded: number;
  testsStarted: number;
  startedAndFinished: number;
  testsFinished: number;
  avgScore: number | null;
  shared: number;
  optInAnswered: number;
  optInYes: number;
}

/** Activity between two instants: [from, to). */
export function windowStats(from: string, to: string): WindowStats {
  const r = db()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE created_at < @to) AS readers_at_end,
         (SELECT COUNT(*) FROM users WHERE created_at >= @from AND created_at < @to) AS new_readers,
         (SELECT COUNT(DISTINCT user_id) FROM (
             SELECT user_id, added_at AS t FROM books
             UNION ALL
             SELECT user_id, started_at AS t FROM attempts
           ) WHERE t >= @from AND t < @to) AS active_readers,
         (SELECT COUNT(*) FROM books WHERE added_at >= @from AND added_at < @to) AS books_added,
         (SELECT COUNT(*) FROM attempts WHERE started_at >= @from AND started_at < @to) AS tests_started,
         (SELECT COUNT(*) FROM attempts WHERE started_at >= @from AND started_at < @to AND finished_at IS NOT NULL) AS started_finished,
         (SELECT COUNT(*) FROM attempts WHERE finished_at >= @from AND finished_at < @to) AS tests_finished,
         (SELECT AVG(score) FROM attempts WHERE finished_at >= @from AND finished_at < @to) AS avg_score,
         (SELECT COUNT(*) FROM attempts a JOIN shares s ON s.attempt_id = a.id
           WHERE a.finished_at >= @from AND a.finished_at < @to) AS shared,
         (SELECT COUNT(*) FROM users WHERE updates_opt_in IS NOT NULL
           AND updates_opt_in_at >= @from AND updates_opt_in_at < @to) AS opt_answered,
         (SELECT COUNT(*) FROM users WHERE updates_opt_in = 1
           AND updates_opt_in_at >= @from AND updates_opt_in_at < @to) AS opt_yes`
    )
    .get({ from, to }) as Row;
  return {
    readersAtEnd: num(r.readers_at_end),
    newReaders: num(r.new_readers),
    activeReaders: num(r.active_readers),
    booksAdded: num(r.books_added),
    testsStarted: num(r.tests_started),
    startedAndFinished: num(r.started_finished),
    testsFinished: num(r.tests_finished),
    avgScore: numOrNull(r.avg_score),
    shared: num(r.shared),
    optInAnswered: num(r.opt_answered),
    optInYes: num(r.opt_yes),
  };
}

export interface Kpi {
  current: number | null;
  previous: number | null;
}

export interface OverviewKpis {
  readers: Kpi;
  newReaders: Kpi;
  activeReaders: Kpi;
  booksAdded: Kpi;
  testsFinished: Kpi;
  completionRate: Kpi;
  avgScore: Kpi;
  shareRate: Kpi;
  optInRate: Kpi;
  optInOverall: number | null;
  asOf: string;
}

/** The last 7 days against the 7 before them. */
export function overviewKpis(nowMs = Date.now()): OverviewKpis {
  const to = iso(nowMs);
  const mid = iso(nowMs - 7 * DAY_MS);
  const from = iso(nowMs - 14 * DAY_MS);
  const cur = windowStats(mid, to);
  const prev = windowStats(from, mid);
  const overall = db()
    .prepare("SELECT SUM(updates_opt_in = 1) AS yes, SUM(updates_opt_in IS NOT NULL) AS answered FROM users")
    .get() as Row;
  const pair = (c: number | null, p: number | null): Kpi => ({ current: c, previous: p });
  return {
    readers: pair(cur.readersAtEnd, prev.readersAtEnd),
    newReaders: pair(cur.newReaders, prev.newReaders),
    activeReaders: pair(cur.activeReaders, prev.activeReaders),
    booksAdded: pair(cur.booksAdded, prev.booksAdded),
    testsFinished: pair(cur.testsFinished, prev.testsFinished),
    completionRate: pair(ratio(cur.startedAndFinished, cur.testsStarted), ratio(prev.startedAndFinished, prev.testsStarted)),
    avgScore: pair(cur.avgScore, prev.avgScore),
    shareRate: pair(ratio(cur.shared, cur.testsFinished), ratio(prev.shared, prev.testsFinished)),
    optInRate: pair(ratio(cur.optInYes, cur.optInAnswered), ratio(prev.optInYes, prev.optInAnswered)),
    optInOverall: ratio(num(overall.yes), num(overall.answered)),
    asOf: to,
  };
}

export interface DailyActivity {
  days: string[];
  signups: number[];
  books: number[];
  tests: number[];
}

/** Sign-ups, books added and tests finished per UTC day. */
export function dailyActivity(days = 30, nowMs = Date.now()): DailyActivity {
  const keys = lastDays(days, nowMs);
  const start = `${keys[0]}T00:00:00.000Z`;
  const q = (sql: string) => db().prepare(sql).all({ start }) as Row[];
  return {
    days: keys,
    signups: fill(keys, q("SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM users WHERE created_at >= @start GROUP BY d")),
    books: fill(keys, q("SELECT substr(added_at, 1, 10) AS d, COUNT(*) AS n FROM books WHERE added_at >= @start GROUP BY d")),
    tests: fill(keys, q("SELECT substr(finished_at, 1, 10) AS d, COUNT(*) AS n FROM attempts WHERE finished_at >= @start GROUP BY d")),
  };
}

export interface FunnelStage {
  key: string;
  label: string;
  readers: number;
}

/** Readers who reached each step at least once, all time. */
export function funnel(): FunnelStage[] {
  const r = db()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS signed_up,
         (SELECT COUNT(DISTINCT user_id) FROM books) AS added_book,
         (SELECT COUNT(DISTINCT user_id) FROM books WHERE status = 'ready') AS book_ready,
         (SELECT COUNT(DISTINCT user_id) FROM attempts) AS started_test,
         (SELECT COUNT(DISTINCT user_id) FROM attempts WHERE finished_at IS NOT NULL) AS finished_test,
         (SELECT COUNT(DISTINCT a.user_id) FROM shares s JOIN attempts a ON a.id = s.attempt_id) AS shared`
    )
    .get() as Row;
  return [
    { key: "signed_up", label: "Signed up", readers: num(r.signed_up) },
    { key: "added_book", label: "Added a book", readers: num(r.added_book) },
    { key: "book_ready", label: "Book ready", readers: num(r.book_ready) },
    { key: "started_test", label: "Started a test", readers: num(r.started_test) },
    { key: "finished_test", label: "Finished a test", readers: num(r.finished_test) },
    { key: "shared", label: "Shared a result", readers: num(r.shared) },
  ];
}

export type FeedEvent = {
  kind: "signup" | "book" | "test" | "share";
  at: string;
  userId: number;
  who: string;
  refId: number | null;
  title: string | null;
  status: string | null;
  score: number | null;
};

/** The latest sign-ups, books, finished tests and shares, newest first. */
export function recentActivity(limit = 14): FeedEvent[] {
  const rows = db()
    .prepare(
      `SELECT * FROM (
         SELECT 'signup' AS kind, u.created_at AS at, u.id AS user_id, u.name, u.email,
                NULL AS ref_id, NULL AS title, NULL AS status, NULL AS score
           FROM users u
         UNION ALL
         SELECT 'book', b.added_at, u.id, u.name, u.email, b.id, b.title, b.status, NULL
           FROM books b JOIN users u ON u.id = b.user_id
         UNION ALL
         SELECT 'test', a.finished_at, u.id, u.name, u.email, a.id, b.title, NULL, a.score
           FROM attempts a JOIN users u ON u.id = a.user_id JOIN books b ON b.id = a.book_id
          WHERE a.finished_at IS NOT NULL
         UNION ALL
         SELECT 'share', s.created_at, u.id, u.name, u.email, a.id, b.title, NULL, a.score
           FROM shares s JOIN attempts a ON a.id = s.attempt_id
           JOIN users u ON u.id = a.user_id JOIN books b ON b.id = a.book_id
       ) ORDER BY at DESC LIMIT ?`
    )
    .all(limit) as Row[];
  return rows.map((r) => ({
    kind: r.kind,
    at: r.at,
    userId: r.user_id,
    who: (r.name as string | null)?.trim() || r.email,
    refId: r.ref_id ?? null,
    title: r.title ?? null,
    status: r.status ?? null,
    score: numOrNull(r.score),
  }));
}

export interface Attention {
  failed30d: number;
  stuck: number;
  inProgress: number;
  latestFailure: { bookId: number; title: string; error: string | null; at: string } | null;
}

/** Things an operator may want to act on. */
export function attention(nowMs = Date.now()): Attention {
  const r = db()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM books WHERE status = 'failed' AND added_at >= @d30) AS failed,
         (SELECT COUNT(*) FROM books WHERE status IN ('pending', 'indexing') AND added_at < @h1) AS stuck,
         (SELECT COUNT(*) FROM attempts WHERE finished_at IS NULL AND started_at >= @h2) AS in_progress`
    )
    .get({ d30: iso(nowMs - 30 * DAY_MS), h1: iso(nowMs - 3600_000), h2: iso(nowMs - 2 * 3600_000) }) as Row;
  const latest = db()
    .prepare("SELECT id, title, error, added_at FROM books WHERE status = 'failed' ORDER BY added_at DESC LIMIT 1")
    .get() as Row | undefined;
  return {
    failed30d: num(r.failed),
    stuck: num(r.stuck),
    inProgress: num(r.in_progress),
    latestFailure: latest ? { bookId: latest.id, title: latest.title, error: latest.error, at: latest.added_at } : null,
  };
}

// ─── Readers ─────────────────────────────────────────────────────────────────

export type ReaderSort = "name" | "joined" | "seen" | "books" | "tests" | "score";
export type UpdatesFilter = "all" | "yes" | "no" | "unasked";

export interface ReaderRow {
  id: number;
  name: string | null;
  email: string;
  joinedAt: string;
  lastSeenAt: string | null;
  books: number;
  tests: number;
  avgScore: number | null;
  updatesOptIn: boolean | null;
  updatesOptInAt: string | null;
}

const READER_ORDER: Record<ReaderSort, string> = {
  name: "COALESCE(NULLIF(TRIM(u.name), ''), u.email) COLLATE NOCASE",
  joined: "u.created_at",
  seen: "u.last_seen_at",
  books: "books",
  tests: "tests",
  score: "avg_score",
};

const READER_SELECT = `
  WITH b AS (SELECT user_id, COUNT(*) AS n FROM books GROUP BY user_id),
       a AS (SELECT user_id, SUM(finished_at IS NOT NULL) AS finished, AVG(score) AS avg_score FROM attempts GROUP BY user_id)
  SELECT u.id, u.name, u.email, u.created_at, u.last_seen_at, u.updates_opt_in, u.updates_opt_in_at,
         COALESCE(b.n, 0) AS books, COALESCE(a.finished, 0) AS tests, a.avg_score
    FROM users u
    LEFT JOIN b ON b.user_id = u.id
    LEFT JOIN a ON a.user_id = u.id`;

const READER_WHERE = `
  (@q = '' OR u.name LIKE @like ESCAPE '\\' OR u.email LIKE @like ESCAPE '\\')
  AND (@updates = 'all'
       OR (@updates = 'yes' AND u.updates_opt_in = 1)
       OR (@updates = 'no' AND u.updates_opt_in = 0)
       OR (@updates = 'unasked' AND u.updates_opt_in IS NULL))`;

const toReader = (r: Row): ReaderRow => ({
  id: r.id,
  name: r.name,
  email: r.email,
  joinedAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  books: num(r.books),
  tests: num(r.tests),
  avgScore: numOrNull(r.avg_score),
  updatesOptIn: r.updates_opt_in == null ? null : r.updates_opt_in === 1,
  updatesOptInAt: r.updates_opt_in_at ?? null,
});

export function readerList(opts: {
  q: string;
  updates: UpdatesFilter;
  sort: ReaderSort;
  dir: "asc" | "desc";
  page: number;
  pageSize?: number;
}): Page<ReaderRow> {
  const pageSize = opts.pageSize ?? 50;
  const params = { q: opts.q, like: like(opts.q), updates: opts.updates };
  const total = num((db().prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${READER_WHERE}`).get(params) as Row).n);
  const page = clampPage(opts.page, total, pageSize);
  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const rows = db()
    .prepare(`${READER_SELECT} WHERE ${READER_WHERE} ORDER BY ${READER_ORDER[opts.sort]} ${dir} NULLS LAST, u.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];
  return { rows: rows.map(toReader), total, page, pageSize };
}

export interface ReaderTotals {
  readers: number;
  joined7d: number;
  optedIn: number;
  answered: number;
  withBook: number;
}

export function readerTotals(nowMs = Date.now()): ReaderTotals {
  const r = db()
    .prepare(
      `SELECT COUNT(*) AS readers,
              SUM(created_at >= @d7) AS joined,
              SUM(updates_opt_in = 1) AS yes,
              SUM(updates_opt_in IS NOT NULL) AS answered,
              (SELECT COUNT(DISTINCT user_id) FROM books) AS with_book
         FROM users`
    )
    .get({ d7: iso(nowMs - 7 * DAY_MS) }) as Row;
  return { readers: num(r.readers), joined7d: num(r.joined), optedIn: num(r.yes), answered: num(r.answered), withBook: num(r.with_book) };
}

/** Every reader, oldest first, for the CSV export. */
export function readersForExport(): ReaderRow[] {
  return (db().prepare(`${READER_SELECT} ORDER BY u.created_at ASC, u.id ASC`).all() as Row[]).map(toReader);
}

export function readerById(id: number): ReaderRow | null {
  const row = db().prepare(`${READER_SELECT} WHERE u.id = ?`).get(id) as Row | undefined;
  return row ? toReader(row) : null;
}

// ─── Books ───────────────────────────────────────────────────────────────────

export interface Material {
  bookId: number;
  knowledgeId: string;
  title: string;
  author: string | null;
  readerId: number;
  readerName: string | null;
  readerEmail: string;
  sourceKind: "file" | "link";
  sourceUrl: string | null;
  fileName: string | null;
  storedFile: string | null;
  fileSize: number | null;
  fileType: string | null;
  status: BookStatus;
  error: string | null;
  conceptCount: number | null;
  tests: number;
  avgScore: number | null;
  bestScore: number | null;
  addedAt: string;
}

const toMaterial = (r: Row): Material => ({
  bookId: r.id,
  knowledgeId: r.knowledge_id,
  title: r.title,
  author: r.author,
  readerId: r.user_id,
  readerName: r.reader_name,
  readerEmail: r.reader_email,
  sourceKind: r.source_kind,
  sourceUrl: r.source_url,
  fileName: r.file_name,
  storedFile: r.stored_file ?? null,
  fileSize: r.file_size ?? null,
  fileType: r.file_type ?? null,
  status: r.status,
  error: r.error ?? null,
  conceptCount: numOrNull(r.concept_count),
  tests: num(r.tests),
  avgScore: numOrNull(r.avg_score),
  bestScore: numOrNull(r.best_score),
  addedAt: r.added_at,
});

const MATERIAL_SELECT = `
  SELECT b.*, u.name AS reader_name, u.email AS reader_email,
         COALESCE(t.n, 0) AS tests, t.avg_score, t.best_score
    FROM books b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN (SELECT book_id, COUNT(*) AS n, AVG(score) AS avg_score, MAX(score) AS best_score
                 FROM attempts WHERE finished_at IS NOT NULL GROUP BY book_id) t ON t.book_id = b.id`;

export function adminMaterial(bookId: number): Material | null {
  const row = db()
    .prepare(
      `SELECT b.*, u.name AS reader_name, u.email AS reader_email,
              (SELECT COUNT(*) FROM attempts a WHERE a.book_id = b.id AND a.finished_at IS NOT NULL) AS tests
         FROM books b JOIN users u ON u.id = b.user_id WHERE b.id = ?`
    )
    .get(bookId) as Row | undefined;
  return row ? toMaterial(row) : null;
}

export type BookSort = "added" | "title" | "tests" | "concepts" | "score";
export type BookStatusFilter = "all" | "ready" | "working" | "failed";
export type SourceFilter = "all" | "file" | "link";
export const FILE_TYPES = ["pdf", "epub", "txt", "md"] as const;

const BOOK_ORDER: Record<BookSort, string> = {
  added: "b.added_at",
  title: "b.title COLLATE NOCASE",
  tests: "tests",
  concepts: "b.concept_count",
  score: "t.avg_score",
};

const BOOK_WHERE = `
  (@q = '' OR b.title LIKE @like ESCAPE '\\' OR b.author LIKE @like ESCAPE '\\' OR b.file_name LIKE @like ESCAPE '\\'
           OR b.source_url LIKE @like ESCAPE '\\' OR u.name LIKE @like ESCAPE '\\' OR u.email LIKE @like ESCAPE '\\')
  AND (@status = 'all' OR (@status = 'working' AND b.status IN ('pending', 'indexing')) OR b.status = @status)
  AND (@source = 'all' OR b.source_kind = @source)
  AND (@type = 'all' OR b.file_type = @type)`;

export function bookList(opts: {
  q: string;
  status: BookStatusFilter;
  source: SourceFilter;
  type: string;
  sort: BookSort;
  dir: "asc" | "desc";
  page: number;
  pageSize?: number;
}): Page<Material> {
  const pageSize = opts.pageSize ?? 40;
  const params = { q: opts.q, like: like(opts.q), status: opts.status, source: opts.source, type: opts.type };
  const total = num(
    (db().prepare(`SELECT COUNT(*) AS n FROM books b JOIN users u ON u.id = b.user_id WHERE ${BOOK_WHERE}`).get(params) as Row).n
  );
  const page = clampPage(opts.page, total, pageSize);
  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const rows = db()
    .prepare(`${MATERIAL_SELECT} WHERE ${BOOK_WHERE} ORDER BY ${BOOK_ORDER[opts.sort]} ${dir} NULLS LAST, b.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];
  return { rows: rows.map(toMaterial), total, page, pageSize };
}

export function booksForReader(userId: number): Material[] {
  return (db().prepare(`${MATERIAL_SELECT} WHERE b.user_id = ? ORDER BY b.added_at DESC, b.id DESC`).all(userId) as Row[]).map(toMaterial);
}

export interface BookFacets {
  total: number;
  readers: number;
  status: Record<"ready" | "working" | "failed", number>;
  source: Record<"file" | "link", number>;
  fileType: Record<string, number>;
}

export function bookFacets(): BookFacets {
  const r = db()
    .prepare(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT user_id) AS readers,
              SUM(status = 'ready') AS ready,
              SUM(status IN ('pending', 'indexing')) AS working,
              SUM(status = 'failed') AS failed,
              SUM(source_kind = 'file') AS file,
              SUM(source_kind = 'link') AS link
         FROM books`
    )
    .get() as Row;
  const types = db()
    .prepare("SELECT file_type AS k, COUNT(*) AS n FROM books WHERE file_type IS NOT NULL GROUP BY file_type")
    .all() as Row[];
  return {
    total: num(r.total),
    readers: num(r.readers),
    status: { ready: num(r.ready), working: num(r.working), failed: num(r.failed) },
    source: { file: num(r.file), link: num(r.link) },
    fileType: Object.fromEntries(types.map((t) => [String(t.k), num(t.n)])),
  };
}

export interface MostTested {
  title: string;
  author: string | null;
  tests: number;
  readers: number;
  avgScore: number | null;
}

/** Books by finished tests, grouped by title across readers' copies. */
export function mostTestedBooks(limit = 8): MostTested[] {
  return (
    db()
      .prepare(
        `SELECT MIN(b.title) AS title, MAX(b.author) AS author, COUNT(*) AS tests,
                COUNT(DISTINCT a.user_id) AS readers, AVG(a.score) AS avg_score
           FROM attempts a JOIN books b ON b.id = a.book_id
          WHERE a.finished_at IS NOT NULL
          GROUP BY lower(trim(b.title))
          ORDER BY tests DESC, readers DESC, title
          LIMIT ?`
      )
      .all(limit) as Row[]
  ).map((r) => ({ title: r.title, author: r.author ?? null, tests: num(r.tests), readers: num(r.readers), avgScore: numOrNull(r.avg_score) }));
}

export interface ConceptDistribution {
  bins: Array<{ from: number; to: number | null; books: number }>;
  median: number | null;
  mapped: number;
}

/** Ready books by concept count, in bins of 10 (80 and up in the last bin). */
export function conceptDistribution(): ConceptDistribution {
  const rows = db()
    .prepare("SELECT MIN(concept_count / 10, 8) AS bin, COUNT(*) AS n FROM books WHERE concept_count IS NOT NULL GROUP BY bin")
    .all() as Row[];
  const by = new Map(rows.map((r) => [num(r.bin), num(r.n)]));
  const med = db()
    .prepare(
      `SELECT AVG(concept_count) AS median, MAX(c) AS mapped FROM (
         SELECT concept_count, ROW_NUMBER() OVER (ORDER BY concept_count) AS rn, COUNT(*) OVER () AS c
           FROM books WHERE concept_count IS NOT NULL
       ) WHERE rn IN ((c + 1) / 2, (c + 2) / 2)`
    )
    .get() as Row;
  return {
    bins: Array.from({ length: 9 }, (_, i) => ({ from: i * 10, to: i === 8 ? null : i * 10 + 9, books: by.get(i) ?? 0 })),
    median: numOrNull(med.median),
    mapped: num(med.mapped),
  };
}

export interface Failure {
  bookId: number;
  title: string;
  error: string | null;
  addedAt: string;
  readerId: number;
  reader: string;
  source: string;
}

export function indexingFailures(limit = 10): Failure[] {
  return (
    db()
      .prepare(
        `SELECT b.id, b.title, b.error, b.added_at, b.source_kind, b.source_url, b.file_name, u.id AS user_id, u.name, u.email
           FROM books b JOIN users u ON u.id = b.user_id
          WHERE b.status = 'failed'
          ORDER BY b.added_at DESC LIMIT ?`
      )
      .all(limit) as Row[]
  ).map((r) => ({
    bookId: r.id,
    title: r.title,
    error: r.error ?? null,
    addedAt: r.added_at,
    readerId: r.user_id,
    reader: (r.name as string | null)?.trim() || r.email,
    source: r.source_kind === "link" ? (r.source_url ?? "link") : (r.file_name ?? "file"),
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

export type Range = "7" | "30" | "90" | "all";
export const RANGES: Array<{ value: Range; label: string }> = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

/** Start of a range as an ISO instant ('' = the beginning of time, which every ISO string sorts after). */
export function rangeStart(range: Range, nowMs = Date.now()): string {
  return range === "all" ? "" : iso(nowMs - Number(range) * DAY_MS);
}

export interface AttemptRow {
  id: number;
  userId: number;
  reader: string;
  readerEmail: string;
  bookId: number;
  bookTitle: string;
  level: string | null;
  questions: number | null;
  types: string[];
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  passed: boolean | null;
  questionsAsked: number | null;
  answered: number;
  shared: boolean;
}

const ATTEMPT_SELECT = `
  SELECT a.id, a.user_id, u.name, u.email, a.book_id, b.title,
         json_extract(a.settings, '$.level') AS level,
         json_extract(a.settings, '$.questions') AS questions,
         json_extract(a.settings, '$.types') AS types,
         a.started_at, a.finished_at, a.score, a.competence, a.questions_asked,
         CASE WHEN json_valid(a.transcript) THEN json_array_length(a.transcript) ELSE 0 END AS answered,
         EXISTS (SELECT 1 FROM shares s WHERE s.attempt_id = a.id) AS shared
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN books b ON b.id = a.book_id`;

const toAttemptRow = (r: Row): AttemptRow => {
  let types: string[] = [];
  try {
    const parsed = JSON.parse(r.types ?? "[]");
    if (Array.isArray(parsed)) types = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    /* ignore */
  }
  return {
    id: r.id,
    userId: r.user_id,
    reader: (r.name as string | null)?.trim() || r.email,
    readerEmail: r.email,
    bookId: r.book_id,
    bookTitle: r.title,
    level: typeof r.level === "string" ? r.level : null,
    questions: numOrNull(r.questions),
    types,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
    score: numOrNull(r.score),
    passed: r.competence == null ? null : r.competence === 1,
    questionsAsked: numOrNull(r.questions_asked),
    answered: num(r.answered),
    shared: r.shared === 1,
  };
};

export type AttemptStatusFilter = "all" | "finished" | "unfinished";

export function attemptList(opts: { from: string; status: AttemptStatusFilter; page: number; pageSize?: number }): Page<AttemptRow> {
  const pageSize = opts.pageSize ?? 25;
  const where = `a.started_at >= @from AND (@status = 'all'
      OR (@status = 'finished' AND a.finished_at IS NOT NULL)
      OR (@status = 'unfinished' AND a.finished_at IS NULL))`;
  const params = { from: opts.from, status: opts.status };
  const total = num((db().prepare(`SELECT COUNT(*) AS n FROM attempts a WHERE ${where}`).get(params) as Row).n);
  const page = clampPage(opts.page, total, pageSize);
  const rows = db()
    .prepare(`${ATTEMPT_SELECT} WHERE ${where} ORDER BY a.started_at DESC, a.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];
  return { rows: rows.map(toAttemptRow), total, page, pageSize };
}

export function attemptsForReader(userId: number): AttemptRow[] {
  return (db().prepare(`${ATTEMPT_SELECT} WHERE a.user_id = ? ORDER BY a.started_at DESC, a.id DESC LIMIT 300`).all(userId) as Row[]).map(
    toAttemptRow
  );
}

export function attemptRow(id: number): AttemptRow | null {
  const row = db().prepare(`${ATTEMPT_SELECT} WHERE a.id = ?`).get(id) as Row | undefined;
  return row ? toAttemptRow(row) : null;
}

export function attemptsForExport(): AttemptRow[] {
  return (db().prepare(`${ATTEMPT_SELECT} ORDER BY a.started_at ASC, a.id ASC`).all() as Row[]).map(toAttemptRow);
}

export function shareSlugFor(attemptId: number): string | null {
  const row = db().prepare("SELECT slug FROM shares WHERE attempt_id = ?").get(attemptId) as Row | undefined;
  return row?.slug ?? null;
}

export interface TestKpis {
  started: number;
  finished: number;
  completionRate: number | null;
  avgScore: number | null;
  medianScore: number | null;
  passRate: number | null;
  avgQuestions: number | null;
  shareRate: number | null;
}

export function testKpis(from: string): TestKpis {
  const r = db()
    .prepare(
      `SELECT COUNT(*) AS started,
              SUM(finished_at IS NOT NULL) AS finished,
              AVG(score) AS avg_score,
              AVG(questions_asked) AS avg_q,
              SUM(competence = 1) AS passed,
              SUM(finished_at IS NOT NULL AND EXISTS (SELECT 1 FROM shares s WHERE s.attempt_id = a.id)) AS shared
         FROM attempts a WHERE a.started_at >= @from`
    )
    .get({ from }) as Row;
  const med = db()
    .prepare(
      `SELECT AVG(score) AS median FROM (
         SELECT score, ROW_NUMBER() OVER (ORDER BY score) AS rn, COUNT(*) OVER () AS c
           FROM attempts WHERE finished_at IS NOT NULL AND score IS NOT NULL AND started_at >= @from
       ) WHERE rn IN ((c + 1) / 2, (c + 2) / 2)`
    )
    .get({ from }) as Row;
  const finished = num(r.finished);
  return {
    started: num(r.started),
    finished,
    completionRate: ratio(finished, num(r.started)),
    avgScore: numOrNull(r.avg_score),
    medianScore: numOrNull(med.median),
    passRate: ratio(num(r.passed), finished),
    avgQuestions: numOrNull(r.avg_q),
    shareRate: ratio(num(r.shared), finished),
  };
}

/** Finished tests by score, in bins of 10 (100 joins the 90s). */
export function scoreHistogram(from: string): number[] {
  const rows = db()
    .prepare(
      `SELECT MIN(CAST(score / 10 AS INTEGER), 9) AS bin, COUNT(*) AS n
         FROM attempts WHERE finished_at IS NOT NULL AND score IS NOT NULL AND started_at >= @from
        GROUP BY bin`
    )
    .all({ from }) as Row[];
  const by = new Map(rows.map((r) => [num(r.bin), num(r.n)]));
  return Array.from({ length: 10 }, (_, i) => by.get(Math.max(0, i)) ?? 0);
}

export interface MixRow {
  key: string;
  tests: number;
  finished: number;
  avgScore: number | null;
}

export interface SettingsMix {
  level: MixRow[];
  questions: MixRow[];
  /** Tests that included each question type (a test can include several). */
  types: MixRow[];
}

export function settingsMix(from: string): SettingsMix {
  const group = (expr: string) =>
    (
      db()
        .prepare(
          `SELECT ${expr} AS k, COUNT(*) AS n, SUM(finished_at IS NOT NULL) AS fin, AVG(score) AS avg_score
             FROM attempts WHERE started_at >= @from GROUP BY k ORDER BY k`
        )
        .all({ from }) as Row[]
    ).map((r) => ({ key: String(r.k ?? "unknown"), tests: num(r.n), finished: num(r.fin), avgScore: numOrNull(r.avg_score) }));
  const types = (
    db()
      .prepare(
        `SELECT j.value AS k, COUNT(*) AS n, SUM(a.finished_at IS NOT NULL) AS fin, AVG(a.score) AS avg_score
           FROM attempts a, json_each(a.settings, '$.types') j
          WHERE a.started_at >= @from AND json_valid(a.settings)
          GROUP BY k`
      )
      .all({ from }) as Row[]
  ).map((r) => ({ key: String(r.k), tests: num(r.n), finished: num(r.fin), avgScore: numOrNull(r.avg_score) }));
  return {
    level: group("json_extract(settings, '$.level')"),
    questions: group("json_extract(settings, '$.questions')"),
    types,
  };
}

export interface AccuracyRow {
  key: string;
  answers: number;
  correctRate: number | null;
  avgScore: number | null;
}

export interface Accuracy {
  byType: AccuracyRow[];
  byBloom: AccuracyRow[];
  byDifficulty: AccuracyRow[];
}

/** Per-question results from the engine's response_detail of finished tests. */
export function accuracy(from: string): Accuracy {
  const group = (expr: string) =>
    (
      db()
        .prepare(
          `SELECT ${expr} AS k, COUNT(*) AS n,
                  AVG(json_extract(j.value, '$.correct')) AS acc,
                  AVG(json_extract(j.value, '$.score')) AS avg_score
             FROM attempts a, json_each(a.response_detail, '$.items') j
            WHERE a.finished_at IS NOT NULL AND a.started_at >= @from AND json_valid(a.response_detail)
            GROUP BY k`
        )
        .all({ from }) as Row[]
    ).map((r) => ({ key: String(r.k ?? "unknown"), answers: num(r.n), correctRate: numOrNull(r.acc), avgScore: numOrNull(r.avg_score) }));
  return {
    byType: group("json_extract(j.value, '$.type')"),
    byBloom: group("replace(lower(json_extract(j.value, '$.bloomLevel')), 'analyse', 'analyze')"),
    // The engine's item difficulty b, on the IRT scale (about -2 to 2).
    byDifficulty: group(
      `CASE WHEN json_extract(j.value, '$.difficulty') IS NULL THEN 'unknown'
            WHEN json_extract(j.value, '$.difficulty') < -0.5 THEN 'easier'
            WHEN json_extract(j.value, '$.difficulty') <= 0.5 THEN 'middle'
            ELSE 'harder' END`
    ),
  };
}

export interface Timing {
  answers: number;
  avgSecs: number | null;
  medianSecs: number | null;
  byType: Array<{ key: string; answers: number; avgSecs: number | null }>;
}

/**
 * Seconds per question from the transcript's answeredAt stamps (recorded from
 * October 2026): the gap since the previous answer, or since the test started
 * for question 1. Gaps over 30 minutes count as breaks and are left out.
 */
export function timing(from: string): Timing {
  const cte = `
    WITH items AS (
      SELECT a.id AS attempt_id, a.started_at,
             json_extract(j.value, '$.type') AS type,
             CAST(json_extract(j.value, '$.number') AS INTEGER) AS n,
             json_extract(j.value, '$.answeredAt') AS at
        FROM attempts a, json_each(a.transcript) j
       WHERE a.started_at >= @from AND json_valid(a.transcript)
         AND json_extract(j.value, '$.answeredAt') IS NOT NULL
    ), ordered AS (
      SELECT type, n, at, started_at,
             LAG(at) OVER (PARTITION BY attempt_id ORDER BY n) AS prev_at,
             LAG(n) OVER (PARTITION BY attempt_id ORDER BY n) AS prev_n
        FROM items
    ), timed AS (
      SELECT type, (julianday(at) - julianday(COALESCE(prev_at, started_at))) * 86400.0 AS secs
        FROM ordered
       WHERE (prev_n IS NULL AND n = 1) OR prev_n = n - 1
    ), valid AS (SELECT * FROM timed WHERE secs > 0 AND secs <= 1800)`;
  const all = db().prepare(`${cte} SELECT COUNT(*) AS n, AVG(secs) AS avg FROM valid`).get({ from }) as Row;
  const med = db()
    .prepare(
      `${cte} SELECT AVG(secs) AS median FROM (
         SELECT secs, ROW_NUMBER() OVER (ORDER BY secs) AS rn, COUNT(*) OVER () AS c FROM valid
       ) WHERE rn IN ((c + 1) / 2, (c + 2) / 2)`
    )
    .get({ from }) as Row;
  const byType = (db().prepare(`${cte} SELECT type AS k, COUNT(*) AS n, AVG(secs) AS avg FROM valid GROUP BY type`).all({ from }) as Row[]).map(
    (r) => ({ key: String(r.k ?? "unknown"), answers: num(r.n), avgSecs: numOrNull(r.avg) })
  );
  return { answers: num(all.n), avgSecs: numOrNull(all.avg), medianSecs: numOrNull(med.median), byType };
}

export interface WrittenAnswers {
  points: Record<"covered" | "partial" | "missing", number>;
  graded: Array<{ key: string; answers: number; avgScore: number | null }>;
}

/** Key-point coverage and which grader decided, for written answers (newer engines only). */
export function writtenAnswers(from: string): WrittenAnswers {
  const points = db()
    .prepare(
      `SELECT json_extract(k.value, '$.status') AS s, COUNT(*) AS n
         FROM attempts a, json_each(a.transcript) j, json_each(j.value, '$.keyPoints') k
        WHERE a.started_at >= @from AND json_valid(a.transcript) AND k.type = 'object'
        GROUP BY s`
    )
    .all({ from }) as Row[];
  const by = new Map(points.map((r) => [String(r.s), num(r.n)]));
  const graded = (
    db()
      .prepare(
        `SELECT json_extract(j.value, '$.gradedBy') AS g, COUNT(*) AS n, AVG(json_extract(j.value, '$.score')) AS avg_score
           FROM attempts a, json_each(a.transcript) j
          WHERE a.started_at >= @from AND json_valid(a.transcript)
            AND json_extract(j.value, '$.type') = 'open' AND json_extract(j.value, '$.gradedBy') IS NOT NULL
          GROUP BY g ORDER BY n DESC`
      )
      .all({ from }) as Row[]
  ).map((r) => ({ key: String(r.g), answers: num(r.n), avgScore: numOrNull(r.avg_score) }));
  return { points: { covered: by.get("covered") ?? 0, partial: by.get("partial") ?? 0, missing: by.get("missing") ?? 0 }, graded };
}
