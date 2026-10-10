"use client";

import { useEffect, useRef } from "react";
import { Check, RotateCcw, Upload, Waypoints, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOOM_COLORS, BLOOM_LEVELS, bloomColor, toBloom } from "@/lib/bloom";
import type { ConceptOutcome, PoCWResult, ResponseDetail } from "@/lib/engine";
import { cn } from "@/lib/utils";

export interface AnsweredItem {
  number: number;
  text: string;
  type: ResponseDetail["type"];
  bloomLevel: string;
  difficulty: number;
  answer: string;
  correct: boolean;
  score: number;
}

interface Props {
  result: PoCWResult;
  answers: AnsweredItem[];
  /** 0-100, the bar the learner chose */
  threshold: number | null;
  outcomes: ConceptOutcome[] | null;
  onViewGraph: () => void;
  onRetake: () => void;
  onReset: () => void;
}

const TYPE_LABEL: Record<string, string> = { open: "Written", mcq: "Multiple choice", true_false: "True or false" };

const DISCLAIMER_TITLES: Record<string, string> = {
  irtCalibration: "About the ability estimate",
  bloomMapping: "About Bloom levels",
  thresholdSemantics: "About the pass bar",
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

export function ResultsView({ result, answers, threshold, outcomes, onViewGraph, onRetake, onReset }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const score = clamp(Math.round(result.score));
  const [lo, hi] = (result.confidence_interval ?? [score, score]).map((v) => clamp(Math.round(v)));

  // Prefer the engine's breakdown; fall back to what we recorded during the test.
  const rows =
    result.response_detail && result.response_detail.length > 0
      ? result.response_detail.map((d, i) => ({
          number: i + 1,
          text: d.question,
          type: d.type,
          bloomLevel: d.bloomLevel,
          correct: d.correct,
          score: d.score,
          answer: answers[i]?.text === d.question ? answers[i].answer : undefined,
        }))
      : answers.map((a) => ({ ...a }));

  const bloomStats = BLOOM_LEVELS.map((level) => {
    const asked = rows.filter((r) => toBloom(r.bloomLevel) === level);
    return { level, asked: asked.length, correct: asked.filter((r) => r.correct).length };
  });
  const highestPassed = [...bloomStats].reverse().find((b) => b.correct > 0)?.level ?? null;

  const tested = outcomes?.filter((c) => c.asked > 0) ?? [];
  const mastered = tested.filter((c) => c.mastered);

  const disclaimers = Object.entries(result.disclaimers ?? {}).filter(([, v]) => typeof v === "string" && v);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="result-heading" className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <h2 ref={headingRef} tabIndex={-1} id="result-heading" className="text-[2rem] font-semibold leading-[1.1] outline-none sm:text-5xl">
            {result.competenceIndicator ? "You cleared the bar you set." : "Not over the bar yet."}
          </h2>
          <p className="mt-3 max-w-prose text-mute">
            {result.competenceIndicator
              ? "Your answers put your estimated grasp of this material above the threshold for the difficulty you picked."
              : "Your estimated grasp of this material sits below the threshold for the difficulty you picked. The graph shows where to look next."}
          </p>
        </div>

        <div className="flex items-end gap-5">
          <p className="font-display text-[5.5rem] font-bold leading-[0.8] tracking-tight tabular-nums text-paper sm:text-[7rem]" aria-label={`Score ${score} out of 100`}>
            {score}
          </p>
          <div className="pb-1 text-sm text-mute">
            <p>out of 100</p>
            <p>
              likely between <span className="tabular-nums text-paper">{lo}</span> and <span className="tabular-nums text-paper">{hi}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Score scale with the 95% interval and the pass bar */}
      <figure className="flex flex-col gap-2">
        <div className="relative h-10" aria-hidden="true">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
          <div className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-magenta/35" style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }} />
          {threshold !== null && (
            <div className="absolute top-0 h-full w-0.5 bg-paper/70" style={{ left: `${clamp(threshold)}%` }}>
              <span className="absolute -top-0.5 left-1.5 whitespace-nowrap text-xs text-paper/80">bar {Math.round(threshold)}</span>
            </div>
          )}
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-magenta"
            style={{ left: `${score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-mute" aria-hidden="true">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
        <figcaption className="text-sm text-mute">
          The shaded band is the 95% interval: the estimate gets narrower the more consistently you answer.
        </figcaption>
      </figure>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-mute">Ability (θ)</dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {fmt(result.theta)} <span className="text-base font-normal text-mute">± {fmt(result.se)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-mute">Questions answered</dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{result.questions_asked}</dd>
        </div>
        <div>
          <dt className="text-sm text-mute">Estimate settled</dt>
          <dd className="mt-1 font-display text-2xl font-semibold">{result.converged ? "Yes" : "Not fully"}</dd>
        </div>
        <div>
          <dt className="text-sm text-mute">{tested.length > 0 ? "Concepts mastered" : "Highest level passed"}</dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {tested.length > 0 ? (
              <>
                {mastered.length} <span className="text-base font-normal text-mute">of {tested.length} tested</span>
              </>
            ) : (
              (highestPassed ?? "None")
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button size="lg" onClick={onViewGraph}>
          <Waypoints aria-hidden="true" /> View knowledge graph
        </Button>
        <p className="text-sm text-mute">See which concepts you mastered, missed or were never asked about.</p>
      </div>

      <section aria-labelledby="bloom-heading">
        <h3 id="bloom-heading" className="text-xl font-semibold">
          Bloom levels reached
        </h3>
        <p className="mt-1 text-sm text-mute">From recalling facts up to creating something new with them. Filled steps are levels where you got at least one question right.</p>
        <ol className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {bloomStats.map((b) => (
            <li
              key={b.level}
              className={cn("rounded-2xl border px-3 py-3", b.correct > 0 ? "border-transparent" : "border-line")}
              style={b.correct > 0 ? { background: `${BLOOM_COLORS[b.level]}26`, borderColor: `${BLOOM_COLORS[b.level]}80` } : undefined}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.asked > 0 ? BLOOM_COLORS[b.level] : "transparent", border: `1.5px solid ${BLOOM_COLORS[b.level]}` }} aria-hidden="true" />
                {b.level}
              </span>
              <span className="mt-1 block text-xs tabular-nums text-mute">{b.asked === 0 ? "Not asked" : `${b.correct} of ${b.asked} right`}</span>
            </li>
          ))}
        </ol>
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="breakdown-heading">
          <h3 id="breakdown-heading" className="text-xl font-semibold">
            Question by question
          </h3>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {rows.map((r) => (
              <li key={r.number} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-4">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full",
                    r.correct ? "bg-outcome-mastered/15 text-outcome-mastered" : "bg-outcome-attempted/15 text-outcome-attempted"
                  )}
                >
                  {r.correct ? <Check className="h-3.5 w-3.5" aria-label="Correct" /> : <X className="h-3.5 w-3.5" aria-label="Incorrect" />}
                </span>
                <div className="min-w-0">
                  <p className="text-paper">{r.text}</p>
                  {r.answer && <p className="mt-1 line-clamp-2 text-sm text-mute">You answered: {r.answer}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                    <span>{TYPE_LABEL[r.type] ?? r.type}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: bloomColor(r.bloomLevel) }} aria-hidden="true" />
                      {toBloom(r.bloomLevel) ?? r.bloomLevel}
                    </span>
                  </p>
                </div>
                <span className="text-sm tabular-nums text-mute">{Math.round(r.score)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {disclaimers.length > 0 && (
        <details className="group rounded-2xl border border-line px-5 py-4">
          <summary className="cursor-pointer font-semibold text-paper">How to read these numbers</summary>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            {disclaimers.map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-paper/90">{DISCLAIMER_TITLES[k] ?? k}</dt>
                <dd className="mt-0.5 text-mute">{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
        <Button size="lg" onClick={onReset}>
          <Upload aria-hidden="true" /> Try another document
        </Button>
        <Button size="lg" variant="outline" onClick={onRetake}>
          <RotateCcw aria-hidden="true" /> Test this one again
        </Button>
      </div>
    </div>
  );
}
