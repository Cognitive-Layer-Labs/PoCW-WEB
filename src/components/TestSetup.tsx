"use client";

import { useState } from "react";
import { Loader2, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Difficulty, QuestionType, TestSettings } from "@/lib/engine";
import { cn } from "@/lib/utils";

const COUNTS = [5, 10, 15, 20];
const DIFFICULTIES: Array<{ value: Difficulty; label: string; hint: string }> = [
  { value: "easy", label: "Gentle", hint: "Starts easy, lower bar" },
  { value: "medium", label: "Standard", hint: "Balanced start and bar" },
  { value: "hard", label: "Demanding", hint: "Starts hard, higher bar" },
];
const TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "open", label: "Written answers" },
  { value: "mcq", label: "Multiple choice" },
  { value: "true_false", label: "True or false" },
];

export const DEFAULT_SETTINGS: TestSettings = { questions: 10, difficulty: "medium", types: ["open", "mcq", "true_false"] };

interface Props {
  title: string;
  source?: string;
  graphSummary: string | null;
  initial: TestSettings;
  busy: boolean;
  onViewGraph: () => void;
  onStart: (settings: TestSettings) => void;
  onReset: () => void;
}

function Segmented<T extends string | number>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value);
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = (i + step + options.length) % options.length;
            onChange(options[next].value);
            (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
          }}
          tabIndex={value === o.value ? 0 : -1}
          className={cn(
            "min-h-10 rounded-xl px-2 py-1.5 text-sm font-semibold transition-colors",
            value === o.value ? "bg-paper text-ink" : "text-mute hover:bg-ink-raised hover:text-paper"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TestSetup({ title, source, graphSummary, initial, busy, onViewGraph, onStart, onReset }: Props) {
  const [settings, setSettings] = useState<TestSettings>(initial);
  const toggleType = (t: QuestionType) =>
    setSettings((s) => {
      const has = s.types.includes(t);
      if (has && s.types.length === 1) return s; // keep at least one type
      return { ...s, types: has ? s.types.filter((x) => x !== t) : [...s.types, t] };
    });

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="text-sm font-semibold text-outcome-mastered">Mapped and ready</p>
        <h2 className="mt-1 break-words text-[1.75rem] font-semibold leading-tight sm:text-3xl">{title}</h2>
        {source && /^https?:\/\//.test(source) && <p className="mt-1 truncate text-sm text-mute">{source}</p>}
        <p className="mt-2 text-mute">{graphSummary ?? "Counting concepts…"}</p>
        <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={onViewGraph}>
          <Waypoints aria-hidden="true" /> View knowledge graph
        </Button>
      </div>

      <form
        className="flex flex-col gap-5 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(settings);
        }}
      >
        <h3 className="text-xl font-semibold">Set up your test</h3>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-mute">Up to how many questions</legend>
          <Segmented
            name="Number of questions"
            options={COUNTS.map((c) => ({ value: c, label: String(c) }))}
            value={settings.questions}
            onChange={(questions) => setSettings((s) => ({ ...s, questions }))}
          />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-mute">Difficulty</legend>
          <Segmented
            name="Difficulty"
            options={DIFFICULTIES}
            value={settings.difficulty}
            onChange={(difficulty) => setSettings((s) => ({ ...s, difficulty }))}
          />
          <p className="text-sm text-mute">{DIFFICULTIES.find((d) => d.value === settings.difficulty)?.hint}. Questions adapt to your answers either way.</p>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm text-mute">Question types</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const on = settings.types.includes(t.value);
              return (
                <label
                  key={t.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-magenta",
                    on ? "border-magenta bg-magenta/10 text-paper" : "border-line-strong text-mute hover:text-paper"
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleType(t.value)} />
                  <span
                    className={cn("h-3 w-3 rounded-[4px] border", on ? "border-magenta bg-magenta" : "border-mute")}
                    aria-hidden="true"
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onReset} className="px-0">
            Use a different document
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? "Writing the first question…" : "Start the test"}
          </Button>
        </div>
      </form>
    </div>
  );
}
