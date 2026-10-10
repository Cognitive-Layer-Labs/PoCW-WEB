import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * SQLite store at ${DATA_DIR:-./data}/bookmap.db. Opened lazily on first use
 * (never at build time) and migrated forward with PRAGMA user_version.
 */

type DB = Database.Database;

const now = () => new Date().toISOString();
export { now };

const MIGRATIONS: string[] = [
  // v1: users, sessions, books, attempts, shares
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    google_sub    TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL,
    name          TEXT,
    avatar_url    TEXT,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT
  );

  CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,          -- HMAC of the cookie token, never the token itself
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE books (
    id             INTEGER PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    knowledge_id   TEXT NOT NULL,
    title          TEXT NOT NULL,
    author         TEXT,
    source_kind    TEXT NOT NULL CHECK (source_kind IN ('file', 'link')),
    source_url     TEXT,
    file_name      TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    error          TEXT,
    concept_count  INTEGER,
    added_at       TEXT NOT NULL,
    UNIQUE (user_id, knowledge_id)
  );

  CREATE TABLE attempts (
    id                INTEGER PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id           INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    knowledge_id      TEXT NOT NULL,
    session_id        TEXT NOT NULL UNIQUE,
    settings          TEXT NOT NULL,       -- { questions, level, types }
    started_at        TEXT NOT NULL,
    finished_at       TEXT,
    score             REAL,
    theta             REAL,
    ci_low            REAL,
    ci_high           REAL,
    competence        INTEGER,
    questions_asked   INTEGER,
    concepts          TEXT,                -- engine result.concepts
    response_detail   TEXT,                -- engine result.response_detail
    transcript        TEXT,                -- what was asked, answered and graded, recorded by the proxy
    current_question  TEXT                 -- the question waiting for an answer
  );
  CREATE INDEX attempts_user_book ON attempts(user_id, book_id);
  CREATE INDEX attempts_finished ON attempts(finished_at);

  CREATE TABLE shares (
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    attempt_id  INTEGER NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL
  );
  `,
  // v2: whether the reader wants product-update emails (NULL = not asked yet, 1 = yes, 0 = no)
  `
  ALTER TABLE users ADD COLUMN updates_opt_in INTEGER;
  ALTER TABLE users ADD COLUMN updates_opt_in_at TEXT;
  `,
  // v3: the original uploaded file, kept for the admin "Materials" downloads
  `
  ALTER TABLE books ADD COLUMN stored_file TEXT;   -- path relative to DATA_DIR, e.g. uploads/<knowledgeId>.pdf
  ALTER TABLE books ADD COLUMN file_size INTEGER;
  ALTER TABLE books ADD COLUMN file_type TEXT;
  `,
  // v4: indexes for the admin dashboard's per-day and per-book aggregates
  `
  CREATE INDEX IF NOT EXISTS users_created ON users(created_at);
  CREATE INDEX IF NOT EXISTS books_added ON books(added_at);
  CREATE INDEX IF NOT EXISTS attempts_book ON attempts(book_id);
  CREATE INDEX IF NOT EXISTS attempts_started ON attempts(started_at);
  `,
];

function migrate(db: DB): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

const globalForDb = globalThis as unknown as { __bookmapDb?: DB };

export function db(): DB {
  if (globalForDb.__bookmapDb) return globalForDb.__bookmapDb;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const conn = new Database(path.join(dir, "bookmap.db"));
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 5000");
  migrate(conn);
  globalForDb.__bookmapDb = conn;
  return conn;
}
