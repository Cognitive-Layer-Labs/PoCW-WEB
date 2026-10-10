# PoCW landing

Public landing for **PoCW (Proof of Cognitive Work)**, served at <https://pocw.baghici.com>.
Anyone can drop a document, watch the engine turn it into a knowledge graph, take an adaptive
test on it and explore the graph with their results highlighted. No account, nothing to install.

Next.js 15 (App Router) · Tailwind 3 · Radix Dialog · `react-force-graph-2d` (bundled, no CDN).

## How it fits together

```
browser ──► /api/engine/<path>  (this app, route handler)
                 │  adds Authorization: Bearer $ENGINE_API_KEY
                 │  forwards X-Forwarded-For (first IP), body ≤ 10 MB, 120 s timeout
                 ▼
            $ENGINE_URL/api/<path>  (PoCW engine, never exposed publicly)
```

The proxy (`src/app/api/engine/[...path]/route.ts`) only forwards these routes; everything
else gets a 404 and paths with `..`, encoded slashes or empty segments get a 400:

| Method | Path                               | Used for                          |
| ------ | ---------------------------------- | --------------------------------- |
| POST   | `upload`                           | raw PDF / text / Markdown upload  |
| POST   | `index`                            | index an http(s) URL (incl. YouTube) |
| GET    | `index/:knowledgeId`               | indexing status (202 + Retry-After while working) |
| GET    | `graph/:knowledgeId`               | nodes + edges for the graph view  |
| POST   | `verify`                           | start a test session              |
| POST   | `verify/:sessionId/answer`         | submit an answer                  |
| GET    | `verify/:sessionId/result`         | final result (fetched once)       |

Status, `Retry-After` and `Content-Type` are passed through. Listing every indexed document
(`GET /api/index`) is deliberately not exposed.

## Flow

1. **Drop** a PDF, `.txt` or `.md` (≤ 10 MB, checked client-side), paste text, or paste a link.
2. **Indexing**: the page polls `index/:id`, honouring `Retry-After`, and handles `failed`.
3. **Ready**: title, concept/connection count, *View knowledge graph*, and a short test setup
   (up to 5/10/15/20 questions, Gentle/Standard/Demanding, question types).
4. **Test**: one question at a time (written, multiple choice, true/false) with feedback after each.
5. **Results**: 0–100 score with its 95 % interval, θ ± SE, pass bar, Bloom levels reached,
   per-question breakdown, the engine's disclaimers, and the graph colored by outcome
   (mastered / asked but not mastered / not tested).

Progress is kept in `sessionStorage`, so a refresh resumes where you were (expired sessions
and missing documents fall back gracefully).

## Configuration

Server-only environment variables (see `.env.example`):

| Variable         | Default               | Meaning                                  |
| ---------------- | --------------------- | ---------------------------------------- |
| `ENGINE_URL`     | `http://engine:3000`  | Engine base URL, without `/api`          |
| `ENGINE_API_KEY` | (required)            | Bearer token the engine expects on `/api/*` |

## Develop

```bash
npm install
cp .env.example .env.local   # point ENGINE_URL at a running engine
npm run dev                  # http://localhost:3001
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploy

`next.config.ts` builds a standalone server and sets security headers (CSP, `nosniff`,
`Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`).

```bash
docker build -t pocw-web .
docker run -p 3000:3000 -e ENGINE_URL=http://engine:3000 -e ENGINE_API_KEY=... pocw-web
```

The image runs `node server.js` as a non-root user on `0.0.0.0:3000`. Put it behind the
reverse proxy (Caddy) that terminates TLS for `pocw.baghici.com` and sets `X-Forwarded-For`.
