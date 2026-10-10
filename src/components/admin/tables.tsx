import Link from "next/link";
import { Share2 } from "lucide-react";
import { MaterialLinks, sourceLabel, sourceShort } from "@/components/MaterialLinks";
import { BookStatusBadge, Who, numClass, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { LEVEL_NAMES, TYPE_SHORT, day, dayCompact, duration, int, score, stamp, count } from "@/lib/admin-format";
import type { AttemptRow, Material } from "@/lib/server/admin";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

export function attemptState(a: AttemptRow, nowMs = Date.now()): "finished" | "in progress" | "not finished" {
  if (a.finishedAt) return "finished";
  return nowMs - Date.parse(a.startedAt) < DAY_MS ? "in progress" : "not finished";
}

export function settingsLabel(a: Pick<AttemptRow, "level" | "questions" | "types">): string {
  const parts = [a.level ? (LEVEL_NAMES[a.level] ?? a.level) : null, a.questions ? `${a.questions} q` : null, a.types.map((t) => TYPE_SHORT[t] ?? t).join("+")];
  return parts.filter(Boolean).join(", ");
}

function Score({ a }: { a: AttemptRow }) {
  const state = attemptState(a);
  if (state !== "finished") {
    return (
      <span className="text-mute">
        {state === "in progress" ? "In progress" : "Not finished"}
        <span className="tabular-nums">
          {" "}
          ({a.answered}/{a.questions ?? "?"})
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {a.shared && <Share2 aria-label="Shared" className="size-3.5 text-mute" />}
      <span className="font-semibold tabular-nums text-paper">{score(a.score)}</span>
    </span>
  );
}

/** Test attempts, newest first. Rows link to the admin review of that attempt. */
export function AttemptsTable({ rows, showReader = true }: { rows: AttemptRow[]; showReader?: boolean }) {
  return (
    <>
      <ul className="divide-y divide-line/60 md:hidden">
        {rows.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/tests/${a.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 hover:bg-ink-raised/40">
              <span className="min-w-0">
                <span className="book-title block truncate text-paper">{a.bookTitle}</span>
                {showReader && <span className="block truncate text-[0.8125rem] text-mute">{a.reader}</span>}
                <span className="block text-[0.8125rem] text-mute">
                  {settingsLabel(a)}, {stamp(a.startedAt)}
                </span>
              </span>
              <span className="text-right text-sm">
                <Score a={a} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className={tableClass}>
          <thead>
            <tr>
              {showReader && (
                <th scope="col" className={thClass}>
                  Reader
                </th>
              )}
              <th scope="col" className={thClass}>
                Book
              </th>
              <th scope="col" className={thClass}>
                Settings
              </th>
              <th scope="col" className={thClass}>
                Started (UTC)
              </th>
              <th scope="col" className={cn(thClass, "text-right")}>
                Took
              </th>
              <th scope="col" className={cn(thClass, "text-right")}>
                Score
              </th>
              <th scope="col" className={thClass}>
                <span className="sr-only">Review</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-ink-raised/40">
                {showReader && (
                  <td className={cn(tdClass, "max-w-[14rem]")}>
                    <Who name={a.reader === a.readerEmail ? null : a.reader} email={a.readerEmail} href={`/admin/readers/${a.userId}`} />
                  </td>
                )}
                <td className={cn(tdClass, "max-w-[18rem]")}>
                  <span className="book-title block truncate text-paper">{a.bookTitle}</span>
                </td>
                <td className={cn(tdClass, "whitespace-nowrap text-mute")}>{settingsLabel(a)}</td>
                <td className={cn(tdClass, "whitespace-nowrap text-mute")}>{stamp(a.startedAt)}</td>
                <td className={cn(tdClass, numClass, "whitespace-nowrap text-mute")}>
                  {a.finishedAt ? duration((Date.parse(a.finishedAt) - Date.parse(a.startedAt)) / 1000) : "–"}
                </td>
                <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                  <Score a={a} />
                </td>
                <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                  <Link href={`/admin/tests/${a.id}`} className="rounded px-1 text-[0.8125rem] font-semibold text-mute hover:text-ribbon-soft hover:underline">
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Books with status, source and downloads. */
export function BooksTable({ rows, showReader = true }: { rows: Material[]; showReader?: boolean }) {
  return (
    <>
      <ul className="divide-y divide-line/60 md:hidden">
        {rows.map((m) => (
          <li key={m.bookId} className="px-4 py-3">
            <p className="book-title break-words leading-snug text-paper">{m.title}</p>
            {m.author && <p className="text-[0.8125rem] text-mute">{m.author}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-mute">
              <BookStatusBadge status={m.status} />
              <span className="break-all">{sourceLabel(m)}</span>
            </p>
            {m.status === "failed" && m.error && <p className="mt-1 text-[0.8125rem] text-danger">{m.error}</p>}
            <p className="mt-1 text-[0.8125rem] text-mute">
              {showReader && (
                <>
                  <Link href={`/admin/readers/${m.readerId}`} className="text-paper hover:underline">
                    {m.readerName?.trim() || m.readerEmail}
                  </Link>
                  ,{" "}
                </>
              )}
              added {day(m.addedAt)}.{m.conceptCount !== null && ` ${count(m.conceptCount, "concept")}, ${count(m.tests, "test")}.`}
            </p>
            <MaterialLinks m={m} className="mt-1.5" hideEmpty />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col" className={thClass}>
                Book
              </th>
              {showReader && (
                <th scope="col" className={thClass}>
                  Reader
                </th>
              )}
              <th scope="col" className={thClass}>
                Status
              </th>
              <th scope="col" className={cn(thClass, "text-right")}>
                Concepts
              </th>
              <th scope="col" className={cn(thClass, "text-right")}>
                Tests
              </th>
              <th scope="col" className={cn(thClass, "text-right")}>
                Avg
              </th>
              <th scope="col" className={thClass}>
                Added
              </th>
              <th scope="col" className={thClass}>
                Download
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.bookId} className="hover:bg-ink-raised/40">
                <td className={cn(tdClass, "max-w-[20rem]")}>
                  <span className="book-title block truncate text-paper" title={m.title}>
                    {m.title}
                  </span>
                  <span className="block truncate text-[0.8125rem] text-mute" title={sourceLabel(m)}>
                    {[m.author, sourceShort(m)].filter(Boolean).join(", ")}
                  </span>
                </td>
                {showReader && (
                  <td className={cn(tdClass, "max-w-[12rem]")}>
                    <Link href={`/admin/readers/${m.readerId}`} className="block truncate text-paper/90 hover:text-ribbon-soft hover:underline">
                      {m.readerName?.trim() || m.readerEmail}
                    </Link>
                  </td>
                )}
                <td className={tdClass}>
                  <BookStatusBadge status={m.status} />
                </td>
                <td className={cn(tdClass, numClass)}>{int(m.conceptCount)}</td>
                <td className={cn(tdClass, numClass)}>{int(m.tests)}</td>
                <td className={cn(tdClass, numClass)}>{score(m.avgScore)}</td>
                <td className={cn(tdClass, "whitespace-nowrap text-mute")}>{dayCompact(m.addedAt)}</td>
                <td className={cn(tdClass, "whitespace-nowrap py-1")}>
                  <MaterialLinks m={m} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
