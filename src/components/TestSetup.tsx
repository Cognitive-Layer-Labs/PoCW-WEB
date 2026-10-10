"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Level, QuestionType, TestSettings } from "@/lib/engine";
import { cn } from "@/lib/utils";

const COUNTS: Array<TestSettings["questions"]> = [5, 10, 15];
const LEVELS: Array<{ value: Level; label: string; hint: string }> = [
  { value: "gentle", label: "Gentle", hint: "Mostly recall questions. The pass bar is 35 out of 100." },
  { value: "standard", label: "Standard", hint: "Recall and understanding. The pass bar is 50 out of 100." },
  { value: "challenging", label: "Challenging", hint: "More questions that ask you to apply and weigh ideas. The pass bar is 65 out of 100." },
];
const TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "mcq", label: "Multiple choice" },
  { value: "true_false", label: "True or false" },
  { value: "open", label: "Written answers" },
];

export const DEFAULT_SETTINGS: TestSettings = { questions: 5, level: "standard", types: ["mcq", "true_false", "open"] };

/** Rough time: about 20 s for a choice, a minute for a written answer. */
function estimate(s: TestSettings): string {
  const perQuestion = s.types.length === 1 && s.types[0] === "open" ? 60 : s.types.includes("open") ? 40 : 20;
  const minutes = Math.max(1, Math.round((s.questions * perQuestion) / 60));
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line p-1">
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = (i + step + options.length) % options.length;
            onChange(options[next].value);
            (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
          }}
          className={cn(
            "min-h-11 rounded-xl px-2 text-[0.95rem] font-semibold transition-colors",
            value === o.value ? "bg-paper text-ink" : "text-mute hover:bg-ink-raised hover:text-paper"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TestSetup({
  title,
  initial,
  busy,
  problem,
  onStart,
}: {
  title: string;
  initial: TestSettings;
  busy: boolean;
  problem: React.ReactNode;
  onStart: (s: TestSettings) => void;
}) {
  const [settings, setSettings] = useState<TestSettings>(initial);
  const toggleType = (t: QuestionType) =>
    setSettings((s) => {
      const has = s.types.includes(t);
      if (has && s.types.length === 1) return s; // keep at least one type
      return { ...s, types: has ? s.types.filter((x) => x !== t) : [...s.types, t] };
    });
  const level = LEVELS.find((l) => l.value === settings.level) ?? LEVELS[1];

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(settings);
      }}
    >
      <div>
        <h1 className="text-[2rem] font-semibold leading-tight sm:text-[2.6rem]">
          Test yourself on <span className="book-title">{title}</span>
        </h1>
        <p className="mt-3 text-mute">One question at a time. Each answer is graded right away, with the reason.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Questions</legend>
        <Segmented
          label="Number of questions"
          options={COUNTS.map((c) => ({ value: c, label: String(c) }))}
          value={settings.questions}
          onChange={(questions) => setSettings((s) => ({ ...s, questions }))}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Difficulty</legend>
        <Segmented label="Difficulty" options={LEVELS} value={settings.level} onChange={(lvl) => setSettings((s) => ({ ...s, level: lvl }))} />
        <p className="text-sm text-mute">{level.hint}</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-semibold">Question types</legend>
        <p className="mb-3 text-sm text-mute">Pick at least one.</p>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const on = settings.types.includes(t.value);
            return (
              <label
                key={t.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border px-4 text-[0.95rem] font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ribbon",
                  on ? "border-ribbon bg-ribbon/10 text-paper" : "border-line-strong text-mute hover:text-paper"
                )}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleType(t.value)} />
                <span
                  className={cn("flex h-4 w-4 items-center justify-center rounded-[5px] border", on ? "border-ribbon bg-ribbon" : "border-mute")}
                  aria-hidden="true"
                >
                  {on && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="#1B1026" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                    </svg>
                  )}
                </span>
                {t.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        {problem}
        <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto sm:self-start">
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? "Writing your first question…" : `Start ${settings.questions} questions`}
        </Button>
        <p className="text-sm text-mute">
          {settings.questions} questions, {level.label.toLowerCase()}, {estimate(settings)}.
        </p>
      </div>
    </form>
  );
}
