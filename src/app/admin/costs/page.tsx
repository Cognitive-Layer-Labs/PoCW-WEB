import { CircleAlert, PlugZap } from "lucide-react";
import { BarList, Meter } from "@/components/admin/BarList";
import { ColumnChart } from "@/components/admin/ColumnChart";
import { KpiGrid, KpiTile, PageHeader, Panel, Segmented, hrefWith, numClass, oneOf, param, tableClass, tdClass, thClass, type Params } from "@/components/admin/ui";
import { dayLong, dayShort, int, latency, pct, usd, count } from "@/lib/admin-format";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import { fetchUsage, type UsageResult } from "@/lib/server/usage";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Costs");

const BASE = "/admin/costs";
const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const TASK_LABELS: Record<string, string> = {
  kg: "Mapping books",
  question: "Writing questions",
  question_check: "Checking questions",
  grade: "Grading answers",
  grade_escalation: "Second-opinion grading",
  title: "Naming books",
};

function Unavailable({ result }: { result: Exclude<UsageResult, { state: "ok" }> }) {
  const copy = {
    unsupported: {
      title: "Cost data needs the updated engine",
      body: "The engine this server talks to has no usage endpoint yet. Spend, calls and per-book costs appear here once it is updated.",
    },
    unconfigured: { title: "The engine isn't configured", body: "Set ENGINE_URL and ENGINE_API_KEY on this server to load cost data." },
    unreachable: { title: "Couldn't reach the engine", body: "Cost data loads straight from the engine. Reload this page in a minute." },
    error: { title: "The engine couldn't return cost data", body: `It answered with HTTP ${"status" in result ? result.status : ""}. Reload this page in a minute.` },
  }[result.state];
  return (
    <div className="flex items-start gap-4 rounded-xl border border-line bg-ink-sunk/40 px-5 py-6">
      <PlugZap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-mute" />
      <div>
        <h2 className="font-sans text-base font-semibold text-paper">{copy.title}</h2>
        <p className="mt-1 max-w-[40rem] text-mute">{copy.body}</p>
      </div>
    </div>
  );
}

export default async function CostsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const days = oneOf(param(params, "days"), ["7", "30", "90"] as const, "30");
  const result = await fetchUsage(Number(days));

  const header = (
    <PageHeader
      title="Costs"
      lede={<>Language-model spend reported by the engine, over the last {days} days (UTC). The key balance is live from OpenRouter.</>}
      actions={
        result.state === "ok" ? <Segmented label="Time range" options={RANGES} value={days} hrefFor={(v) => hrefWith(BASE, params, { days: v })} /> : undefined
      }
    />
  );

  if (result.state !== "ok") {
    return (
      <>
        {header}
        <Unavailable result={result} />
      </>
    );
  }

  const u = result.usage;
  const tasks = [...u.byTask].sort((a, b) => b.costUsd - a.costUsd);
  const taskCost = tasks.reduce((s, t) => s + t.costUsd, 0);
  const errorRate = u.totals.calls > 0 ? u.totals.errors / u.totals.calls : null;
  const perDay = u.byDay.length > 0 ? u.totals.costUsd / u.byDay.length : null;
  const key = u.key;
  const used = key ? key.usageUsd : null;
  const limit = key?.limitUsd ?? null;
  const remaining = key ? (key.remainingUsd ?? (limit !== null ? Math.max(0, limit - key.usageUsd) : null)) : null;
  const daysLeft = remaining !== null && perDay && perDay > 0 ? remaining / perDay : null;
  const usedShare = used !== null && limit ? used / limit : null;

  return (
    <>
      {header}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel id="key-h" title="OpenRouter key" meta={limit !== null ? "Credit limit" : undefined}>
          {!key ? (
            <p className="text-sm text-mute">The engine couldn&apos;t read the key&apos;s balance from OpenRouter just now.</p>
          ) : limit === null ? (
            <>
              <p className="text-[1.7rem] font-semibold leading-none text-paper">{usd(used)}</p>
              <p className="mt-2 text-sm text-mute">used so far. This key has no credit limit, so nothing stops spend except the account balance.</p>
            </>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[1.7rem] font-semibold leading-none text-paper">{usd(remaining)}</span>
                <span className="text-mute">left of {usd(limit)}</span>
              </p>
              <div className="mt-4">
                <Meter value={used ?? 0} max={limit} label={`${usd(used)} used of a ${usd(limit)} limit`} />
              </div>
              <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm text-mute">
                <span>
                  <span className="text-paper">{usd(used)}</span> used ({pct(usedShare)})
                </span>
                {daysLeft !== null && <span>About {int(Math.floor(daysLeft))} days left at this pace</span>}
              </p>
              {usedShare !== null && usedShare >= 0.8 && (
                <p className="mt-3 flex items-start gap-2 text-sm text-paper">
                  <CircleAlert aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", usedShare >= 0.95 ? "text-danger" : "text-outcome-attempted")} />
                  {usedShare >= 0.95 ? "Almost out of credit. Raise the limit or top up soon." : "Running low on credit."}
                </p>
              )}
            </>
          )}
        </Panel>

        <section aria-label="Spend summary">
          <KpiGrid className="h-full grid-cols-2 sm:grid-cols-3">
            <KpiTile label={`Spend, ${days} days`} value={usd(u.totals.costUsd)}>
              <span className="text-mute">{usd(perDay)} a day</span>
            </KpiTile>
            <KpiTile label="Model calls" value={int(u.totals.calls)}>
              <span className="text-mute">{u.totals.calls ? usd(u.totals.costUsd / u.totals.calls) : "–"} a call</span>
            </KpiTile>
            <KpiTile label="Failed calls" value={int(u.totals.errors)}>
              <span className="text-mute">{pct(errorRate, 1)} of calls</span>
            </KpiTile>
            <KpiTile label="Cost per book" value={usd(u.perBook.avgCostUsd)}>
              <span className="text-mute">mapping, {count(u.perBook.count, "book")}</span>
            </KpiTile>
            <KpiTile label="Cost per test" value={usd(u.perSession.avgCostUsd)}>
              <span className="text-mute">questions and grading, {count(u.perSession.count, "test")}</span>
            </KpiTile>
            <KpiTile label="Per 100 tests" value={u.perSession.avgCostUsd === null ? "–" : usd(u.perSession.avgCostUsd * 100)}>
              <span className="text-mute">at the current cost per test</span>
            </KpiTile>
          </KpiGrid>
        </section>
      </div>

      <Panel id="spend-h" title="Spend per day" meta={`${usd(u.totals.costUsd)} over ${int(u.byDay.length)} days`} className="mt-5">
        {u.byDay.length === 0 ? (
          <p className="text-sm text-mute">No model calls in this range.</p>
        ) : (
          <ColumnChart
            label={`Spend per day, last ${days} days`}
            format="usd"
            height={160}
            columns={u.byDay.map((d) => ({ key: d.date, label: `${dayLong(d.date)}, ${count(d.calls, "call")}`, tick: dayShort(d.date), value: d.costUsd }))}
          />
        )}
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel id="share-h" title="Where the money goes">
          {tasks.length === 0 ? (
            <p className="text-sm text-mute">No model calls in this range.</p>
          ) : (
            <BarList
              label="Share of spend by task"
              labelWidth="min(10rem, 40%)"
              valueWidth="6.5rem"
              max={taskCost || 1}
              track
              rows={tasks.map((t, i) => ({
                key: `${t.task}-${t.model}-${i}`,
                label: TASK_LABELS[t.task] ?? t.task,
                value: t.costUsd,
                display: pct(taskCost ? t.costUsd / taskCost : null),
                sub: usd(t.costUsd),
              }))}
            />
          )}
        </Panel>

        <Panel id="tasks-h" title="By task and model" flush>
          {tasks.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-mute">No model calls in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>
                      Task
                    </th>
                    <th scope="col" className={thClass}>
                      Model
                    </th>
                    <th scope="col" className={cn(thClass, "text-right")}>
                      Calls
                    </th>
                    <th scope="col" className={cn(thClass, "text-right")}>
                      Spend
                    </th>
                    <th scope="col" className={cn(thClass, "text-right")}>
                      Per call
                    </th>
                    <th scope="col" className={cn(thClass, "text-right")}>
                      Latency
                    </th>
                    <th scope="col" className={cn(thClass, "text-right")}>
                      Failed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, i) => (
                    <tr key={`${t.task}-${t.model}-${i}`} className="hover:bg-ink-raised/40">
                      <td className={cn(tdClass, "whitespace-nowrap text-paper")}>{TASK_LABELS[t.task] ?? t.task}</td>
                      <td className={cn(tdClass, "max-w-[14rem] truncate text-mute")} title={t.model}>
                        {t.model}
                      </td>
                      <td className={cn(tdClass, numClass)}>{int(t.calls)}</td>
                      <td className={cn(tdClass, numClass, "text-paper")}>{usd(t.costUsd)}</td>
                      <td className={cn(tdClass, numClass, "text-mute")}>{t.calls ? usd(t.costUsd / t.calls) : "–"}</td>
                      <td className={cn(tdClass, numClass, "text-mute")}>{latency(t.avgLatencyMs)}</td>
                      <td className={cn(tdClass, numClass, t.errors > 0 ? "text-paper" : "text-mute")}>
                        {int(t.errors)}
                        {t.calls > 0 && t.errors > 0 && <span className="ml-1 text-mute">({pct(t.errors / t.calls, 1)})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
