# Bookmap

**Bookmap** (<https://bookmap.baghici.com>) is for people who read books. A reader signs in with Google,
finds a classic they've read in the search (or brings a book: a PDF, EPUB, TXT or Markdown file up to
40 MB, or a link), and Bookmap draws a map of the book's ideas. The reader can then test themselves on it and share the result. It runs on the
PoCW engine.

Next.js 15 (App Router), Tailwind 3, SQLite (`better-sqlite3`), `react-force-graph-2d`. Standalone
Docker build.

## Pages

| Route | Who | What |
| --- | --- | --- |
| `/` | logged out | Landing page: hero, how it works, "Continue with Google". Signed-in readers are sent to `/shelf` |
| `/shelf` | signed in | The reader's books (real covers when picked from the catalog) with best/last score and number of tests. Empty state shows the book search |
| `/add` | signed in | Find a classic: search as you type (`?q=` keeps the query), "Most read classics", "Popular on Bookmap". Only books with free full text are shown, each with "Map & test" (one click) or "Open the book" when it's already on the shelf. Below: drop a file or paste a link |
| `/book/:id` | owner | Title, idea count, "Test yourself", "Explore the map", past tests, remove. Shows mapping progress (polls the status, honouring `Retry-After`) and failures |
| `/book/:id/test` | owner | Setup (5/10/15 questions; Gentle/Standard/Challenging; question types), then one question at a time with grading after each answer. A refresh resumes the test (sessionStorage) |
| `/attempt/:id` | owner | Score, band, likely range, ideas mastered, per-question review, collapsed disclaimers, share, map |
| `/book/:id/map` | owner | Full-screen map. Phones get a bottom sheet for idea details; the map re-fits after resize/rotation. Colored by the latest (or `?attempt=`) test |
| `/s/:slug` | public | Shared result: first name, book, score, ideas mastered, "Map your own book". Dynamic Open Graph image at `/s/:slug/opengraph-image` (1200x630 PNG) |
| `/admin` | `ADMIN_EMAILS` | Read-only operator dashboard, 404 for everyone else. Overview (7-day KPIs against the 7 before, 30-day activity, reader funnel, recent activity), `/admin/readers` (search, sort, per-reader page, CSV at `/admin/readers.csv`), `/admin/books` (filters, downloads, mapping failures), `/admin/tests` (scores, settings, accuracy by type/Bloom/difficulty, time per question, per-attempt review, CSV at `/admin/tests.csv`), `/admin/costs` (LLM spend from the engine's `GET /api/usage`, fetched server-side) |
| `/privacy`, `/terms` | public | Plain-language privacy policy and terms (needed for Google's "In production" consent screen) |
| `/dev-login` | tests only | Exists only when `AUTH_DEV_LOGIN=1` |

## How it fits together

```
browser ──► /api/engine/<path>   (route handler, requires a session)
                 │  checks the book / test session belongs to the reader (404 otherwise)
                 │  rebuilds the test config from validated settings
                 │  adds Authorization: Bearer $ENGINE_API_KEY
                 │  forwards X-Forwarded-For (right-most entry), body ≤ 40 MB, timeouts
                 │  records books, tests and results in SQLite from the engine's answers
                 ▼
            $ENGINE_URL/api/<path>  (PoCW engine, never exposed publicly)
```

Only these engine routes are forwarded; everything else is a 404, and paths with `..`, encoded
slashes or empty segments get a 400. Signed-out requests get a 401. Cross-origin POSTs get a 403.

| Method | Path | Used for |
| --- | --- | --- |
| POST | `upload` | raw file upload: `application/pdf`, `application/epub+zip`, `text/plain`, `text/markdown` (≤ 40 MB, else 413) |
| POST | `index` | add a book from an http(s) link |
| GET | `index/:knowledgeId` | mapping status (202 + Retry-After while working) |
| GET | `graph/:knowledgeId` | nodes + edges for the map |
| POST | `verify` | start a test: `{ knowledgeId, settings: { questions: 5\|10\|15, level, types } }` |
| POST | `verify/:sessionId/answer` | submit an answer |
| GET | `verify/:sessionId/result` | final result (stored as the test's outcome) |

Levels map to the engine's values: Gentle 0.2 / threshold 0.35, Standard 0.4 / 0.5,
Challenging 0.65 / 0.65. `max_questions` is sent as chosen; the engine asks exactly that many.

Other route handlers: `/api/auth/signin/google`, `/api/auth/callback/google`, `/api/auth/signout`
(POST), `/api/auth/dev` (POST, dev only), `/api/share` (POST, owner only), `/api/books/:id` (DELETE,
owner only), and the catalog routes below.

## Finding a book (catalog)

Readers can find a classic instead of uploading it. Search and lists only show books Bookmap can
map: their full text is free on **Project Gutenberg** (public domain). Bookmap never fetches
in-copyright text from anywhere; a reader can still upload a file they have.

| Method | Route | What |
| --- | --- | --- |
| GET | `/api/catalog/search?q=` | Up to 12 books with free full text matching the query (see below). Signed in, 30 searches a minute per reader (429 + `Retry-After`), query cut to 120 characters. Open Library's part is cached 10 minutes per normalised query, a stale copy (up to a day) if Open Library is down; with nothing cached, Gutenberg's own matches are still shown, and only when there are none either: 503 "Search is unavailable right now" |
| GET | `/api/catalog/browse` | The two lists below; waits only when nothing is cached yet |
| POST | `/api/catalog/add` `{ key }` | "Map & test": the engine indexes `https://www.gutenberg.org/ebooks/<id>.epub.noimages` (same link for every reader, so a book someone already mapped is ready at once), recorded like the proxy's `index`. 409 for a key without free full text, 10 a minute per reader, same-origin only |

- **Project Gutenberg's catalog** (`pg_catalog.csv.gz`, rebuilt daily by Gutenberg) is loaded into
  the `gutenberg_books` table every 3 days, English texts only. It decides what can be mapped.
  (Gutendex answered in 37-42 s per request when this was built, too slow to ask per search.)
- **Search** combines, one card per book (same title before any subtitle, same first author):
  1. Open Library `search.json` (`q=<query> language:eng`, 20 works) for its ranking, keeping only
     works that are on Gutenberg, with Open Library's cover and year. A match needs the same title
     (before any subtitle) and a first author with the same surname, or a Gutenberg id Open Library
     links to the work with the same title. Works titled in another language ("Преступление и
     наказание") show their English edition's title.
  2. Gutenberg's catalog searched directly, so classics Open Library ranks poorly are still found:
     the exact title ("war and peace"); if there is none, titles with those words in that order
     ("sherlock holmes"); and books whose first author has that name ("dickens", "jane austen").

  Among several editions of a book: one already mapped on Bookmap, else the most downloaded, else
  the oldest.
- **Most read classics**: Gutendex `?languages=en&sort=popular` (Gutenberg's OPDS "most
  downloaded" feed if Gutendex doesn't answer in 6 s), without dictionaries and collected works,
  top 15, numbered, covers from Open Library when its record matches. Cached 24 hours.
- **Popular on Bookmap**: Gutenberg books readers have mapped, by distinct readers then finished
  tests. Only public Gutenberg sources, described by the catalog, never a reader's upload, name or score.
- Lists are cached in SQLite and served stale while they refresh in the background; a few seconds
  after start the server fills whatever is missing (`CATALOG_WARMUP=0` turns that off). Every
  upstream request sends `User-Agent: Bookmap/1.0 (+https://bookmap.baghici.com)`; interactive ones
  time out after 6 s, daily background ones after 15 s (the Gutenberg catalog download, 120 s).
- The browser only ever sends a catalog key (`OL…W` or `pg<id>`); title, author, cover and Gutenberg
  id come from the server's `catalog_entries`.

## Sign-in

Google OpenID Connect (authorization code + PKCE), implemented directly in `src/lib/server/auth.ts`
(no auth library). The OAuth state and PKCE verifier sit in a short-lived signed cookie. After the
code exchange the user is upserted, and a random session token is set as an `HttpOnly`, `Secure`
(when `AUTH_URL` is https), `SameSite=Lax`, `__Host-` cookie. Only an HMAC of the token is stored
in the `sessions` table (30 days).

All public URLs (the OAuth callback, redirects, share links) come from `AUTH_URL`, so it works behind
Cloudflare and Caddy without trusting `Host` headers.

### Google Cloud Console setup

1. Create (or pick) a project at <https://console.cloud.google.com/>.
2. **APIs & Services → OAuth consent screen**: User type **External**. App name *Bookmap*, support
   email, authorized domain `baghici.com`. Scopes: `openid`, `email`, `profile` (all non-sensitive).
   While the app is in **Testing**, add every tester's Google address under **Test users** (max 100),
   or click **Publish app** to let anyone sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**:
   - Authorized JavaScript origins: `https://bookmap.baghici.com`
   - Authorized redirect URIs: `https://bookmap.baghici.com/api/auth/callback/google`
4. Put the client ID and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

### Dev sign-in (tests only)

`AUTH_DEV_LOGIN=1` enables `/dev-login`, which signs in as any email without Google, for automated
tests. It is off unless the variable is exactly `1`, the server prints a loud warning at startup
and on every use, and it must **never** be set in production.

## Data

SQLite at `${DATA_DIR:-./data}/bookmap.db` (WAL mode). The schema is created and migrated on first
use (`PRAGMA user_version`, `src/lib/server/db.ts`):

- `users`: `google_sub` (unique), email, name, avatar URL, created / last seen
- `sessions`: HMAC of the cookie token, user, expiry
- `books`: user, `knowledge_id` (unique per user), title, author (optional), `source_kind` file|link,
  URL or file name, status, error, idea count, added at, `cover_url` and `catalog_key` (the catalog
  book the reader picked; its title and author are kept over the engine's)
- `attempts`: user, book, `session_id` (unique), settings, started / finished, score, θ, interval,
  competence, questions asked, concepts, response detail + disclaimers, a transcript of every question,
  answer and grading (recorded by the proxy)
- `shares`: random slug (unique), one per attempt
- `catalog_cache` (upstream answers with their fetch time), `catalog_entries` (every catalog book the
  server has shown), `gutenberg_books` (Project Gutenberg's English texts, about 62,000 rows, ~16 MB)

Removing a book from the shelf deletes its tests and share links.

## Configuration

See `.env.example`. All variables are server-only.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENGINE_URL` | `http://engine:3000` | Engine base URL, without `/api` |
| `ENGINE_API_KEY` | (required) | Bearer token the engine expects |
| `AUTH_URL` | `http://localhost:3001` | Public URL, e.g. `https://bookmap.baghici.com` |
| `AUTH_SECRET` | (required in production) | Long random string (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | (required) | OAuth web client |
| `ADMIN_EMAILS` | (none) | Comma-separated emails allowed on `/admin` |
| `CONTACT_EMAIL` | first `ADMIN_EMAILS` entry | Contact shown on `/privacy` and `/terms` |
| `DATA_DIR` | `./data` (`/app/data` in Docker) | Where `bookmap.db` lives |
| `AUTH_DEV_LOGIN` | unset | `1` enables `/dev-login`. Tests only |
| `CATALOG_WARMUP` | on | `0` stops the server from filling the book-search caches a few seconds after start |

## Develop

```bash
npm install
cp .env.example .env.local   # ENGINE_URL, AUTH_URL=http://localhost:3001, AUTH_DEV_LOGIN=1 for local work
npm run dev                  # http://localhost:3001
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploy

```bash
docker build -t bookmap-web .
docker run -p 3000:3000 -v bookmap-data:/app/data \
  -e ENGINE_URL=http://engine:3000 -e ENGINE_API_KEY=... \
  -e AUTH_URL=https://bookmap.baghici.com -e AUTH_SECRET=... \
  -e AUTH_GOOGLE_ID=... -e AUTH_GOOGLE_SECRET=... \
  -e ADMIN_EMAILS=gabibaghici1@gmail.com bookmap-web
```

The image runs `node server.js` as a non-root user (uid 1001) on `0.0.0.0:3000`. `/app/data` is a
volume owned by that user; keep it on a named volume so the database survives redeploys.
`better-sqlite3` loads its bundled musl prebuild, and the build stage fails if it can't.

`next.config.ts` sets security headers: CSP (`img-src` allows `lh3.googleusercontent.com` for Google
profile photos, and `covers.openlibrary.org`, `archive.org`, `*.us.archive.org` (where Open Library's
covers redirect) and `www.gutenberg.org` for book covers; sign-in is a top-level navigation, so
`form-action` and `connect-src` stay `'self'`),
`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy`.

Put it behind Caddy, which terminates TLS for `bookmap.baghici.com` and sets `X-Forwarded-For`, and
redirect `pocw.baghici.com` to it.
