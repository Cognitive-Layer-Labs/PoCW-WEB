import { Download } from "lucide-react";
import { BarList } from "@/components/admin/BarList";
import { ColumnChart } from "@/components/admin/ColumnChart";
import { AttemptsTable } from "@/components/admin/tables";
import { Empty, KpiGrid, KpiTile, PageHeader, Pagination, Panel, Segmented, actionClass, hrefWith, oneOf, param, type Params } from "@/components/admin/ui";
import { LEVEL_NAMES, TYPE_NAMES, duration, int, pct, score, count } from "@/lib/admin-format";
import { BLOOM_LEVELS } from "@/lib/bloom";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import {
  RANGES,
  accuracy,
  attemptList,
  rangeStart,
  scoreHistogram,
  settingsMix,
  testKpis,
  timing,
  writtenAnswers,
  type AccuracyRow,
  type AttemptStatusFilter,
  type Range,
} from "@/lib/server/admin";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Tests");

const BASE = "/admin/tests";
const LEVEL_ORDER = ["gentle", "standard", "challenging"];
const TYPE_ORDER = ["open", "mcq", "true_false"];
const DIFFICULTY_LABELS: Record<string, string> = { easier: "Easier items", middle: "Middle items", harder: "Harder items", unknown: "Unrated" };
const GRADER_LABELS: Record<string, string> = { jev: "JEV grader", llm: "LLM grader" };

function ordered<T extends { key: string }>(rows: T[], order: string[]): T[] {
  const rank = (k: string) => (order.indexOf(k) === -1 ? order.length : order.indexOf(k));
  return [...rows].sort((a, b) => rank(a.key) - rank(b.key));
}

function AccuracyBars({ rows, labels, label }: { rows: AccuracyRow[]; labels: (k: string) => string; label: string }) {
  if (rows.length === 0) return <Empty>No finished tests in this range.</Empty>;
  return (
    <BarList
      label={label}
      max={1}
      track
      labelWidth="8.5rem"
      rows={rows.map((r) => ({
        key: r.key,
        label: labels(r.key),
        value: r.correctRate ?? 0,
        display: pct(r.correctRate),
        sub: `of ${int(r.answers)}`,
      }))}
    />
  );
}

export default async function TestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const range = oneOf(param(params, "range"), ["7", "30", "90", "all"] as const, "30") as Range;
  const status = oneOf(param(params, "status"), ["all", "finished", "unfinished"] as const, "all") as AttemptStatusFilter;
  const from = rangeStart(range);
  const k = testKpis(from);
  const hist = scoreHistogram(from);
  const mix = settingsMix(from);
  const acc = accuracy(from);
  const time = timing(from);
  const written = writtenAnswers(from);
  const list = attemptList({ from, status, page: Number(param(params, "page")) || 1 });
  const rangeLabel = range === "all" ? "all time" : `the last ${range} days`;

  const bloomOrder = BLOOM_LEVELS.map((b) => b.toLowerCase());
  const pointsTotal = written.points.covered + written.points.partial + written.points.missing;
  const gradedTotal = written.graded.reduce((s, g) => s + g.answers, 0);

  return (
    <>
      <PageHeader
        title="Tests"
        lede={<>Tests started in {rangeLabel}. Per-question numbers come from finished tests. Times are UTC.</>}
        actions={
          <>
            <Segmented label="Time range" options={RANGES} value={range} hrefFor={(v) => hrefWith(BASE, params, { range: v })} />
            <a href="/admin/tests.csv" download className={actionClass}>
              <Download aria-hidden="true" /> Export CSV
            </a>
          </>
        }
      />

      <KpiGrid className="grid-cols-2 sm:grid-cols-4">
        <KpiTile label="Started" value={int(k.started)} />
        <KpiTile label="Finished" value={int(k.finished)}>
          <span className="text-mute">{pct(k.completionRate)} completion</span>
        </KpiTile>
        <KpiTile label="Average score" value={score(k.avgScore)}>
          <span className="text-mute">median {score(k.medianScore)}</span>
        </KpiTile>
        <KpiTile label="Cleared the bar" value={pct(k.passRate)}>
          <span className="text-mute">of finished tests</span>
        </KpiTile>
        <KpiTile label="Questions per test" value={k.avgQuestions === null ? "–" : k.avgQuestions.toFixed(1)}>
          <span className="text-mute">finished tests</span>
        </KpiTile>
        <KpiTile label="Time per question" value={duration(time.medianSecs)}>
          <span className="text-mute">{time.answers ? `median of ${count(time.answers, "answer")}` : "recorded from Oct 2026"}</span>
        </KpiTile>
        <KpiTile label="Shared" value={pct(k.shareRate)}>
          <span className="text-mute">of finished tests</span>
        </KpiTile>
        <KpiTile label="Unfinished" value={int(k.started - k.finished)}>
          <span className="text-mute">started, no result</span>
        </KpiTile>
      </KpiGrid>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel id="scores-h" title="Score distribution" meta={`${int(k.finished)} finished tests`} className="lg:[--chart-h:21rem]">
          {k.finished === 0 ? (
            <Empty>No finished tests in this range.</Empty>
          ) : (
            <ColumnChart
              label="Finished tests by score"
              unit="tests"
              height={180}
              columns={hist.map((n, i) => ({
                key: String(i),
                label: i === 9 ? "Scores 90–100" : `Scores ${i * 10}–${i * 10 + 9}`,
                tick: i === 9 ? "90+" : String(i * 10),
                value: n,
              }))}
            />
          )}
        </Panel>

        <Panel id="settings-h" title="Settings readers choose" meta={`${count(k.started, "test")}`}>
          {k.started === 0 ? (
            <Empty>No tests in this range.</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="mb-2.5 font-sans text-[0.8125rem] font-semibold text-mute">Difficulty</h3>
                <BarList
                  label="Tests by difficulty"
                  labelWidth="min(9rem, 32%)"
                  valueWidth="8.5rem"
                  max={k.started}
                  track
                  rows={ordered(mix.level, LEVEL_ORDER).map((r) => ({
                    key: r.key,
                    label: LEVEL_NAMES[r.key] ?? r.key,
                    value: r.tests,
                    display: pct(r.tests / k.started),
                    sub: `${count(r.tests, "test")}`,
                  }))}
                />
              </div>
              <div>
                <h3 className="mb-2.5 font-sans text-[0.8125rem] font-semibold text-mute">Length</h3>
                <BarList
                  label="Tests by number of questions"
                  labelWidth="min(9rem, 32%)"
                  valueWidth="8.5rem"
                  max={k.started}
                  track
                  rows={mix.questions.map((r) => ({
                    key: r.key,
                    label: `${r.key} questions`,
                    value: r.tests,
                    display: pct(r.tests / k.started),
                    sub: `${pct(r.tests ? r.finished / r.tests : null)} finished`,
                  }))}
                />
              </div>
              <div>
                <h3 className="mb-2.5 font-sans text-[0.8125rem] font-semibold text-mute">Question types included</h3>
                <BarList
                  label="Tests that include each question type"
                  labelWidth="min(9rem, 32%)"
                  valueWidth="8.5rem"
                  max={k.started}
                  track
                  rows={ordered(mix.types, TYPE_ORDER).map((r) => ({
                    key: r.key,
                    label: TYPE_NAMES[r.key] ?? r.key,
                    value: r.tests,
                    display: pct(r.tests / k.started),
                    sub: `${count(r.tests, "test")}`,
                  }))}
                />
                <p className="mt-2 text-xs text-mute">A test can include more than one type, so these add up to more than 100%.</p>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <h2 className="mb-3 mt-8 font-sans text-[0.95rem] font-semibold text-paper">Answered correctly</h2>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel id="acc-type-h" title="By question type">
          <AccuracyBars rows={ordered(acc.byType, TYPE_ORDER)} labels={(k) => TYPE_NAMES[k] ?? k} label="Share answered correctly, by question type" />
        </Panel>
        <Panel id="acc-bloom-h" title="By thinking level" meta="Bloom's levels, low to high">
          <AccuracyBars
            rows={ordered(acc.byBloom, bloomOrder)}
            labels={(k) => BLOOM_LEVELS.find((b) => b.toLowerCase() === k) ?? (k === "unknown" ? "Unrated" : k)}
            label="Share answered correctly, by Bloom level"
          />
        </Panel>
        <Panel id="acc-diff-h" title="By item difficulty" meta="Engine rating, easier to harder">
          <AccuracyBars
            rows={ordered(acc.byDifficulty, ["easier", "middle", "harder", "unknown"])}
            labels={(k) => DIFFICULTY_LABELS[k] ?? k}
            label="Share answered correctly, by item difficulty"
          />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel id="level-h" title="Average score by difficulty">
          {mix.level.length === 0 ? (
            <Empty>No tests in this range.</Empty>
          ) : (
            <BarList
              label="Average score by test difficulty"
              max={100}
              track
              labelWidth="7rem"
              rows={ordered(mix.level, LEVEL_ORDER).map((r) => ({
                key: r.key,
                label: LEVEL_NAMES[r.key] ?? r.key,
                value: r.avgScore ?? 0,
                display: score(r.avgScore),
                sub: `${count(r.finished, "test")}`,
              }))}
            />
          )}
        </Panel>
        <Panel id="time-h" title="Time per question" meta={time.answers ? `Average, ${count(time.answers, "answer")}` : undefined}>
          {time.answers === 0 ? (
            <Empty>Answer times are recorded for tests taken from October 2026 on.</Empty>
          ) : (
            <>
              <BarList
                label="Average seconds per question, by type"
                labelWidth="8.5rem"
                rows={ordered(time.byType, TYPE_ORDER).map((r) => ({
                  key: r.key,
                  label: TYPE_NAMES[r.key] ?? r.key,
                  value: r.avgSecs ?? 0,
                  display: duration(r.avgSecs),
                  sub: `of ${int(r.answers)}`,
                }))}
              />
              <p className="mt-3 text-xs text-mute">From one answer to the next, so it includes reading the feedback. Gaps over 30 minutes are left out.</p>
            </>
          )}
        </Panel>
        <Panel id="written-h" title="Written answers" meta={pointsTotal ? `${int(pointsTotal)} key points graded` : undefined}>
          {pointsTotal === 0 && gradedTotal === 0 ? (
            <Empty>Key-point grading appears once the updated engine grades written answers.</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {pointsTotal > 0 && (
                <BarList
                  label="Key points by verdict"
                  labelWidth="7rem"
                  max={pointsTotal}
                  track
                  rows={(["covered", "partial", "missing"] as const).map((s) => ({
                    key: s,
                    label: s === "covered" ? "Covered" : s === "partial" ? "Partly covered" : "Missing",
                    value: written.points[s],
                    display: pct(written.points[s] / pointsTotal),
                    sub: int(written.points[s]),
                  }))}
                />
              )}
              {gradedTotal > 0 && (
                <div>
                  <h3 className="mb-2.5 font-sans text-[0.8125rem] font-semibold text-mute">Decided by</h3>
                  <BarList
                    label="Written answers by grader"
                    labelWidth="7rem"
                    max={gradedTotal}
                    track
                    rows={written.graded.map((g) => ({
                      key: g.key,
                      label: GRADER_LABELS[g.key] ?? g.key,
                      value: g.answers,
                      display: pct(g.answers / gradedTotal),
                      sub: `avg ${score(g.avgScore)}`,
                    }))}
                  />
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <section aria-labelledby="attempts-h" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="attempts-h" className="font-sans text-[0.95rem] font-semibold text-paper">
            Attempts
          </h2>
          <Segmented
            label="Attempt status"
            value={status}
            options={[
              { value: "all", label: "All" },
              { value: "finished", label: "Finished" },
              { value: "unfinished", label: "Unfinished" },
            ]}
            hrefFor={(v) => hrefWith(BASE, params, { status: v === "all" ? null : v })}
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-ink-sunk/40">
          {list.rows.length === 0 ? (
            <div className="p-4">
              <Empty>No attempts in this range.</Empty>
            </div>
          ) : (
            <AttemptsTable rows={list.rows} />
          )}
          <Pagination base={BASE} params={params} page={list.page} pageSize={list.pageSize} total={list.total} noun="attempts" />
        </div>
      </section>
    </>
  );
}
