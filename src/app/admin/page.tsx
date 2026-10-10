import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { currentUser, isAdmin } from "@/lib/server/auth";
import { adminOverview } from "@/lib/server/repo";
import { dateTime, relativeDay, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/** Read-only overview for ADMIN_EMAILS. Everyone else gets a 404. */
export default async function AdminPage() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) notFound();
  const { totals, users, recent } = adminOverview();

  const stats = [
    { label: "Readers", value: totals.users },
    { label: "Books", value: totals.books },
    { label: "Finished tests", value: totals.attempts },
    { label: "Average score", value: totals.avgScore === null ? "n/a" : Math.round(totals.avgScore) },
    { label: "Want updates", value: totals.optedIn },
  ];
  const updatesLabel = (v: boolean | null) => (v === null ? "not asked" : v ? "yes" : "no");

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader user={user} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
        <h1 className="text-[2.2rem] font-semibold leading-tight sm:text-5xl">Admin</h1>
        <p className="mt-2 text-mute">Read-only. Times are UTC.</p>

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-6 md:grid-cols-5" data-testid="admin-totals">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-mute">{s.label}</dt>
              <dd className="mt-1 font-serif text-4xl font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="users-heading" className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="users-heading" className="text-2xl font-semibold">
              Readers
            </h2>
            <a
              href="/admin/readers.csv"
              download
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:border-ribbon hover:text-ribbon-soft"
            >
              Export CSV
            </a>
          </div>
          {/* Phones: cards */}
          <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line md:hidden">
            {users.map((u) => (
              <li key={u.id} className="py-4">
                <p className="font-semibold">{u.name || "No name"}</p>
                <p className="break-all text-sm text-mute">{u.email}</p>
                <p className="mt-1 text-sm text-mute">
                  Joined {shortDate(u.createdAt)}, last seen {relativeDay(u.lastSeenAt) || "never"}.{" "}
                  <span className="text-paper">
                    {u.books} books, {u.attempts} tests
                  </span>
                  . Updates: {updatesLabel(u.updatesOptIn)}
                </p>
              </li>
            ))}
          </ul>
          {/* Wider screens: table */}
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-mute">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Joined</th>
                  <th className="py-2 pr-4 font-semibold">Last seen</th>
                  <th className="py-2 pr-4 text-right font-semibold">Books</th>
                  <th className="py-2 pr-4 text-right font-semibold">Tests</th>
                  <th className="py-2 font-semibold">Updates</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line/60">
                    <td className="py-2.5 pr-4">{u.name || "No name"}</td>
                    <td className="py-2.5 pr-4 text-mute">{u.email}</td>
                    <td className="py-2.5 pr-4 text-mute">{shortDate(u.createdAt)}</td>
                    <td className="py-2.5 pr-4 text-mute">{dateTime(u.lastSeenAt) || "never"}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{u.books}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{u.attempts}</td>
                    <td className="py-2.5 text-mute">{updatesLabel(u.updatesOptIn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="recent-heading" className="mt-12">
          <h2 id="recent-heading" className="text-2xl font-semibold">
            Recent tests
          </h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-mute">No tests yet.</p>
          ) : (
            <>
              <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line md:hidden">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start gap-4 py-4">
                    <span className="w-12 shrink-0 font-serif text-3xl font-semibold tabular-nums leading-none">
                      {r.score === null ? "–" : Math.round(r.score)}
                    </span>
                    <span className="min-w-0">
                      <span className="book-title block truncate">{r.bookTitle}</span>
                      <span className="block truncate text-sm text-mute">{r.userName || r.userEmail}</span>
                      <span className="block text-sm text-mute">
                        {r.finishedAt ? `${r.questions ?? "?"} questions, ${dateTime(r.finishedAt)}` : `Not finished, started ${dateTime(r.startedAt)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-mute">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-4 font-semibold">Reader</th>
                      <th className="py-2 pr-4 font-semibold">Book</th>
                      <th className="py-2 pr-4 text-right font-semibold">Score</th>
                      <th className="py-2 pr-4 text-right font-semibold">Questions</th>
                      <th className="py-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="py-2.5 pr-4">
                          {r.userName || "No name"} <span className="text-mute">{r.userEmail}</span>
                        </td>
                        <td className="book-title max-w-[18rem] truncate py-2.5 pr-4">{r.bookTitle}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{r.score === null ? "–" : Math.round(r.score)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{r.finishedAt ? (r.questions ?? "?") : "–"}</td>
                        <td className="py-2.5 text-mute">{r.finishedAt ? dateTime(r.finishedAt) : `Not finished (${dateTime(r.startedAt)})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
