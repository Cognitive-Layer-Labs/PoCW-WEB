import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser, isAdmin, type User } from "./auth";

/**
 * Admin access. Pages call requireAdmin() (everyone else sees the ordinary 404);
 * route handlers call adminUser() and answer 404 themselves when it is null.
 */
export async function requireAdmin(): Promise<User> {
  const user = await currentUser();
  if (!user || !isAdmin(user)) notFound();
  return user;
}

export async function adminUser(): Promise<User | null> {
  const user = await currentUser();
  return user && isAdmin(user) ? user : null;
}

export const adminNotFound = () =>
  new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * Page metadata only for admins, so the 404 everyone else gets carries the
 * same title as any other missing page. Use: `export const generateMetadata = adminMetadata("Books")`.
 */
export function adminMetadata(title: string): () => Promise<Metadata> {
  return async () => ((await adminUser()) ? { title: `Admin: ${title}`, robots: { index: false, follow: false } } : {});
}
