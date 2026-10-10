import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, now } from "./db";

/**
 * Google sign-in (OpenID Connect authorization-code flow with PKCE) and
 * database-backed sessions. No auth library: the flow is a redirect, one token
 * exchange and a cookie.
 *
 *   GET  /api/auth/signin/google    -> accounts.google.com (state + PKCE in a signed cookie)
 *   GET  /api/auth/callback/google  -> exchanges the code, upserts the user, sets the session cookie
 *   POST /api/auth/signout          -> deletes the session
 *   POST /api/auth/dev              -> dev-only sign-in (AUTH_DEV_LOGIN=1)
 */

export interface User {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Public origin of the app, e.g. https://bookmap.baghici.com (no trailing slash). */
export function appUrl(): string {
  return (process.env.AUTH_URL || "http://localhost:3001").replace(/\/+$/, "");
}

export function appOrigin(): string {
  return new URL(appUrl()).origin;
}

/** Cookies are Secure whenever the public URL is https. */
export function secureCookies(): boolean {
  return appUrl().startsWith("https://");
}

export const SESSION_COOKIE = () => (secureCookies() ? "__Host-bookmap_session" : "bookmap_session");
export const OAUTH_COOKIE = () => (secureCookies() ? "__Host-bookmap_oauth" : "bookmap_oauth");

const SESSION_DAYS = 30;
const SESSION_TOUCH_MS = 5 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("AUTH_SECRET must be set (at least 16 characters).");
  }
  return "bookmap-development-secret-not-for-production";
}

export function googleConfigured(): boolean {
  return !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export function googleRedirectUri(): string {
  return `${appUrl()}/api/auth/callback/google`;
}

/**
 * Dev-only sign-in for automated tests. On only when AUTH_DEV_LOGIN is exactly
 * "1"; never set it in production. Every use is logged loudly.
 */
export function devLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "1";
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: User | null): boolean {
  return !!user && adminEmails().includes(user.email.toLowerCase());
}

// ─── Small crypto helpers ────────────────────────────────────────────────────

const hmac = (value: string) => crypto.createHmac("sha256", secret()).update(value).digest("base64url");

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Signs a small JSON payload for a short-lived cookie. */
export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function unsign<T>(value: string | undefined): T | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = hmac(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/shelf";
  if (value.startsWith("/api/")) return "/shelf";
  return value.slice(0, 300);
}

// ─── Users & sessions ────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, avatarUrl: r.avatar_url });

export function upsertUser(input: { sub: string; email: string; name?: string | null; avatarUrl?: string | null }): User {
  const t = now();
  const row = db()
    .prepare(
      `INSERT INTO users (google_sub, email, name, avatar_url, created_at, last_seen_at)
       VALUES (@sub, @email, @name, @avatar, @t, @t)
       ON CONFLICT(google_sub) DO UPDATE SET
         email = excluded.email,
         name = COALESCE(excluded.name, users.name),
         avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
         last_seen_at = excluded.last_seen_at
       RETURNING id, email, name, avatar_url`
    )
    .get({
      sub: input.sub,
      email: input.email.slice(0, 320),
      name: input.name?.slice(0, 200) || null,
      avatar: input.avatarUrl?.slice(0, 1000) || null,
      t,
    }) as UserRow;
  return toUser(row);
}

/** Creates a session and returns the cookie token (only its HMAC is stored). */
export function createSession(userId: number): { token: string; expires: Date } {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  db()
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(hmac(token), userId, now(), expires.toISOString());
  // Opportunistic cleanup of expired sessions.
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  return { token, expires };
}

export function deleteSession(token: string | undefined): void {
  if (token) db().prepare("DELETE FROM sessions WHERE id = ?").run(hmac(token));
}

export function sessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

function userForToken(token: string | undefined): User | null {
  if (!token || token.length > 200) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`
    )
    .get(hmac(token), now()) as (UserRow & { last_seen_at: string | null }) | undefined;
  if (!row) return null;
  const seen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (Date.now() - seen > SESSION_TOUCH_MS) {
    db().prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(now(), row.id);
  }
  return toUser(row);
}

/** The signed-in user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  return userForToken(store.get(SESSION_COOKIE())?.value);
});

/** For pages: the signed-in user, or a redirect to the landing page. */
export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(next ? `/?next=${encodeURIComponent(next)}` : "/");
  return user;
}

export function firstName(user: { name: string | null } | null | undefined): string {
  const first = user?.name?.trim().split(/\s+/)[0];
  return first || "A reader";
}

// ─── Google ──────────────────────────────────────────────────────────────────

export interface OAuthState {
  state: string;
  verifier: string;
  next: string;
  /** issued at, ms */
  iat: number;
}

export function googleAuthorizationUrl(state: string, verifier: string): string {
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID || "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

interface GoogleClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Exchanges the authorization code. The ID token comes straight from Google's
 * token endpoint over TLS, so its claims can be read without verifying the
 * signature (OpenID Connect Core 3.1.3.7); issuer, audience and expiry are
 * still checked.
 */
export async function exchangeGoogleCode(code: string, verifier: string): Promise<GoogleClaims> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: process.env.AUTH_GOOGLE_ID || "",
      client_secret: process.env.AUTH_GOOGLE_SECRET || "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (HTTP ${res.status})`);
  const body = (await res.json()) as { id_token?: string };
  const payload = body.id_token?.split(".")[1];
  if (!payload) throw new Error("Google returned no ID token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleClaims;
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("Unexpected issuer");
  if (claims.aud !== process.env.AUTH_GOOGLE_ID) throw new Error("Unexpected audience");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Expired ID token");
  if (!claims.sub || !claims.email || claims.email_verified !== true) throw new Error("Google account has no verified email");
  return claims;
}
