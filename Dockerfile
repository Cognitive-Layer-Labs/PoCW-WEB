# syntax=docker/dockerfile:1

# ── deps: install exact lockfile dependencies ───────────────────────────────
# better-sqlite3 ships musl prebuilds (linuxmusl-x64/arm64), so no compiler is
# needed. python3/make/g++ are only a fallback for other platforms.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── build: produce the standalone Next.js server ────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && node -e "require('./.next/standalone/node_modules/better-sqlite3')(':memory:').close()" \
 || (echo 'better-sqlite3 missing from the standalone output' && exit 1)

# ── runtime: minimal image, non-root ────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
# SQLite database (bookmap.db + WAL files). Mount a volume here.
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
