import Link from "next/link";
import { BookPlus, CircleAlert, CircleCheck, Hourglass, Share2, UserPlus } from "lucide-react";
import { BarList } from "@/components/admin/BarList";
import { ColumnChart, type Column } from "@/components/admin/ColumnChart";
import { Delta, Empty, KpiGrid, KpiTile, PageHeader, Panel } from "@/components/admin/ui";
import { ago, dayLong, dayShort, int, pct, score, stamp, count } from "@/lib/admin-format";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import { attention, dailyActivity, funnel, overviewKpis, recentActivity, type FeedEvent } from "@/lib/server/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Overview");

function columns(days: string[], values: number[]): Column[] {
  return days.map((d, i) => ({ key: d, label: dayLong(d), tick: dayShort(d), value: values[i] }));
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function FeedItem({ e }: { e: FeedEvent }) {
  const who = (
    <Link href={`/admin/readers/${e.userId}`} className="font-semibold text-paper hover:text-ribbon-soft hover:underline">
      {e.who}
    </Link>
  );
  const book = e.title ? <span className="book-title text-paper">{e.title}</span> : null;
  let icon = <UserPlus aria-hidden="true" className="size-4 text-mute" />;
  let text: React.ReactNode = <>{who} signed up</>;
  if (e.kind === "book") {
    icon =
      e.status === "failed" ? (
        <CircleAlert aria-hidden="true" className="size-4 text-danger" />
      ) : (
        <BookPlus aria-hidden="true" className="size-4 text-mute" />
      );
    text = (
      <>
        {who} added {book}
        {e.status === "failed" ? <span className="text-danger"> (mapping failed)</span> : e.status !== "ready" ? <span className="text-mute"> (mapping)</span> : null}
      </>
    );
  } else if (e.kind === "test") {
    icon = <CircleCheck aria-hidden="true" className="size-4 text-mute" />;
    text = (
      <>
        {who} scored{" "}
        <Link href={`/admin/tests/${e.refId}`} className="font-semibold tabular-nums text-paper hover:text-ribbon-soft hover:underline">
          {score(e.score)}
        </Link>{" "}
        on {book}
      </>
    );
  } else if (e.kind === "share") {
    icon = <Share2 aria-hidden="true" className="size-4 text-mute" />;
    text = (
      <>
        {who} shared a result on {book}
      </>
    );
  }
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5">
      <span className="mt-0.5">{icon}</span>
      <p className="min-w-0 text-sm leading-snug text-mute">{text}</p>
      <time dateTime={e.at} title={`${stamp(e.at)} UTC`} className="whitespace-nowrap text-xs text-mute">
        {ago(e.at)}
      </time>
    </li>
  );
}

export default async function AdminOverview() {
  await requireAdmin();
  const k = overviewKpis();
  const activity = dailyActivity(30);
  const stages = funnel();
  const feed = recentActivity(12);
  const todo = attention();

  const signedUp = stages[0]?.readers ?? 0;
  // The step that loses the most readers, for one line of interpretation under the funnel.
  let worst: { from: string; to: string; lost: number } | null = null;
  for (let i = 1; i < stages.length - 1; i++) {
    const lost = stages[i - 1].readers - stages[i].readers;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { from: stages[i - 1].label, to: stages[i].label, lost };
  }

  const charts = [
    { key: "signups", title: "Sign-ups", unit: "sign-ups", values: activity.signups },
    { key: "books", title: "Books added", unit: "books", values: activity.books },
    { key: "tests", title: "Tests finished", unit: "tests", values: activity.tests },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        lede={
          <>
            The last 7 days against the 7 before. Times are UTC; as of {stamp(k.asOf)}.
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-label="Key numbers">
          <KpiGrid className="grid-cols-2 sm:grid-cols-3">
            <KpiTile label="Readers" value={int(k.readers.current)} hint="Everyone who has signed in">
              <Delta current={k.readers.current} previous={k.readers.previous} kind="count" period="a week ago" />
            </KpiTile>
            <KpiTile label="New readers" value={int(k.newReaders.current)}>
              <Delta current={k.newReaders.current} previous={k.newReaders.previous} kind="count" />
            </KpiTile>
            <KpiTile label="Active readers" value={int(k.activeReaders.current)} hint="Added a book or started a test">
              <Delta current={k.activeReaders.current} previous={k.activeReaders.previous} kind="count" />
            </KpiTile>
            <KpiTile label="Books added" value={int(k.booksAdded.current)}>
              <Delta current={k.booksAdded.current} previous={k.booksAdded.previous} kind="count" />
            </KpiTile>
            <KpiTile label="Tests finished" value={int(k.testsFinished.current)}>
              <Delta current={k.testsFinished.current} previous={k.testsFinished.previous} kind="count" />
            </KpiTile>
            <KpiTile label="Completion rate" value={pct(k.completionRate.current)} hint="Tests started this week that were finished">
              <Delta current={k.completionRate.current} previous={k.completionRate.previous} kind="rate" />
            </KpiTile>
            <KpiTile label="Average score" value={score(k.avgScore.current)} hint="Finished tests, out of 100">
              <Delta current={k.avgScore.current} previous={k.avgScore.previous} kind="score" />
            </KpiTile>
            <KpiTile label="Share rate" value={pct(k.shareRate.current)} hint="Finished tests with a public link">
              <Delta current={k.shareRate.current} previous={k.shareRate.previous} kind="rate" />
            </KpiTile>
            <KpiTile
              label="Update opt-in"
              value={pct(k.optInRate.current)}
              hint={`Readers who answered the update question this week and said yes. ${pct(k.optInOverall)} of all who answered.`}
              className="col-span-2 sm:col-span-1"
            >
              <Delta current={k.optInRate.current} previous={k.optInRate.previous} kind="rate" />
            </KpiTile>
          </KpiGrid>
          <p className="mt-2 text-xs text-mute">
            Active readers added a book or started a test. Update opt-in counts this week&apos;s answers; {pct(k.optInOverall)} of everyone who answered
            said yes.
          </p>
        </section>

        <Panel id="funnel-h" title="Reader funnel" meta="All readers, all time">
          {signedUp === 0 ? (
            <Empty>No readers yet.</Empty>
          ) : (
            <>
              <BarList
                label="Readers reaching each step"
                labelWidth="8.5rem"
                max={signedUp}
                rows={stages.map((s, i) => ({
                  key: s.key,
                  label: s.label,
                  value: s.readers,
                  display: int(s.readers),
                  sub: i === 0 ? "100%" : pct(s.readers / signedUp),
                }))}
              />
              {worst && (
                <p className="mt-4 border-t border-line pt-3 text-sm text-mute">
                  Biggest drop: <span className="text-paper">{worst.from.toLowerCase()}</span> to{" "}
                  <span className="text-paper">{worst.to.toLowerCase()}</span>, {count(worst.lost, "reader")}.
                </p>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel id="activity-h" title="Last 30 days" meta="Per UTC day" className="mt-5">
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
          {charts.map((c) => (
            <div key={c.key} className="min-w-0">
              <p className="mb-3 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-paper">{c.title}</span>
                <span className="tabular-nums text-mute">{int(sum(c.values))} in 30 days</span>
              </p>
              <ColumnChart columns={columns(activity.days, c.values)} label={`${c.title} per day, last 30 days`} unit={c.unit} height={112} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Panel id="feed-h" title="Recent activity" meta="Newest first">
          {feed.length === 0 ? (
            <Empty>Nothing has happened yet.</Empty>
          ) : (
            <ul className="-my-2.5 divide-y divide-line/60">
              {feed.map((e, i) => (
                <FeedItem key={`${e.kind}-${e.refId ?? e.userId}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="attention-h" title="Needs a look">
          <ul className="flex flex-col divide-y divide-line/60">
            <AttentionRow
              tone={todo.failed30d > 0 ? "bad" : "ok"}
              value={todo.failed30d}
              label="books failed to map in the last 30 days"
              href="/admin/books?status=failed"
            />
            <AttentionRow
              tone={todo.stuck > 0 ? "warn" : "ok"}
              value={todo.stuck}
              label="books still mapping after an hour"
              href="/admin/books?status=working"
            />
            <AttentionRow tone="info" value={todo.inProgress} label="tests started in the last 2 hours and not finished yet" href="/admin/tests?status=unfinished&range=7" />
          </ul>
          {todo.latestFailure && (
            <div className="mt-4 rounded-lg border border-line bg-ink px-3.5 py-3 text-sm">
              <p className="text-mute">
                Latest failure, {ago(todo.latestFailure.at)}: <span className="book-title text-paper">{todo.latestFailure.title}</span>
              </p>
              {todo.latestFailure.error && <p className="mt-1 text-paper/90">{todo.latestFailure.error}</p>}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function AttentionRow({ tone, value, label, href }: { tone: "ok" | "warn" | "bad" | "info"; value: number; label: string; href: string }) {
  const Icon = tone === "bad" ? CircleAlert : tone === "warn" ? Hourglass : tone === "ok" ? CircleCheck : Hourglass;
  return (
    <li>
      <Link href={href} className="group flex min-h-12 items-center gap-3 py-2 text-sm">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            tone === "bad" ? "text-danger" : tone === "warn" ? "text-outcome-attempted" : tone === "ok" ? "text-outcome-mastered" : "text-mute"
          )}
        />
        <span className="w-8 shrink-0 text-right text-base font-semibold tabular-nums text-paper">{int(value)}</span>
        <span className="text-mute group-hover:text-paper">{label}</span>
      </Link>
    </li>
  );
}
