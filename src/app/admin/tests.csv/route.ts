import { adminNotFound, adminUser } from "@/lib/server/admin-gate";
import { attemptsForExport } from "@/lib/server/admin";
import { csvResponse } from "@/lib/server/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every test attempt as CSV, oldest first. ADMIN_EMAILS only; everyone else gets a 404. */
export async function GET(): Promise<Response> {
  if (!(await adminUser())) return adminNotFound();
  const header = [
    "attempt_id",
    "reader_name",
    "reader_email",
    "book_title",
    "level",
    "questions",
    "question_types",
    "started_at",
    "finished_at",
    "answered",
    "score",
    "passed",
    "shared",
  ];
  const rows = attemptsForExport().map((a) => [
    a.id,
    a.reader === a.readerEmail ? null : a.reader,
    a.readerEmail,
    a.bookTitle,
    a.level,
    a.questions,
    a.types.join(" "),
    a.startedAt,
    a.finishedAt,
    a.answered,
    a.score === null ? null : Math.round(a.score * 10) / 10,
    a.passed === null ? null : a.passed,
    a.shared,
  ]);
  return csvResponse("bookmap-tests", header, rows);
}
