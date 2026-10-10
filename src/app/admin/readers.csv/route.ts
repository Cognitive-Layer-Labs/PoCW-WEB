import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/server/auth";
import { readersForExport } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Quote a CSV cell; neutralise spreadsheet formulas (=, +, -, @) in user-supplied text. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All readers as CSV, for ADMIN_EMAILS only (everyone else gets a 404). */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user || !isAdmin(user)) return new NextResponse("Not found", { status: 404 });

  const header = ["name", "email", "joined_at", "last_seen_at", "books", "tests", "wants_updates", "wants_updates_changed_at"];
  const lines = readersForExport().map((r) =>
    [
      cell(r.name),
      cell(r.email),
      cell(r.joinedAt),
      cell(r.lastSeenAt),
      cell(r.books),
      cell(r.tests),
      cell(r.updatesOptIn === null ? "not asked" : r.updatesOptIn ? "yes" : "no"),
      cell(r.updatesOptInAt),
    ].join(",")
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse([header.join(","), ...lines].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bookmap-readers-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
