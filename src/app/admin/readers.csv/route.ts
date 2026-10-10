import { adminNotFound, adminUser } from "@/lib/server/admin-gate";
import { readersForExport } from "@/lib/server/admin";
import { csvResponse } from "@/lib/server/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** All readers as CSV, for ADMIN_EMAILS only (everyone else gets a 404). */
export async function GET(): Promise<Response> {
  if (!(await adminUser())) return adminNotFound();
  const header = ["name", "email", "joined_at", "last_seen_at", "books", "tests", "wants_updates", "wants_updates_changed_at", "avg_score"];
  const rows = readersForExport().map((r) => [
    r.name,
    r.email,
    r.joinedAt,
    r.lastSeenAt,
    r.books,
    r.tests,
    r.updatesOptIn === null ? "not asked" : r.updatesOptIn ? "yes" : "no",
    r.updatesOptInAt,
    r.avgScore === null ? null : Math.round(r.avgScore * 10) / 10,
  ]);
  return csvResponse("bookmap-readers", header, rows);
}
