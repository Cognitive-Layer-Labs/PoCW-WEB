"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bloomColor, toBloom } from "@/lib/bloom";
import type { AnswerFeedback, VerifyQuestion } from "@/lib/engine";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  open: "Written answer",
  mcq: "Multiple choice",
  true_false: "True or false",
};

const MIN_OPEN_CHARS = 5;
const MAX_ANSWER_CHARS = 4000;

/** Strip "A) " / "B. " style prefixes the model sometimes adds to options. */
const cleanOption = (o: string) => o.replace(/^\s*[A-Da-d][).:\]]\s+/, "");

interface Props {
  question: VerifyQuestion;
  total: number;
  feedback: AnswerFeedback | null;
  submittedAnswer: string | null;
  busy: boolean;
  onSubmit: (answer: string, display: string) => void;
  onContinue: () => void;
}

export function QuestionView({ question, total, feedback, submittedAnswer, busy, onSubmit, onContinue }: Props) {
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const groupId = useId();

  // Move focus to the new question so keyboard and screen-reader users follow along.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, [question.number]);
  useEffect(() => {
    if (feedback) continueRef.current?.focus();
  }, [feedback]);

  const options =
    question.type === "true_false"
      ? [
          { value: "true", label: "True" },
          { value: "false", label: "False" },
        ]
      : question.type === "mcq"
        ? (question.options ?? []).map((o, i) => ({ value: String.fromCharCode(65 + i), label: cleanOption(o) }))
        : [];

  const locked = busy || !!feedback;
  const canSubmit = !locked && (question.type === "open" ? text.trim().length >= MIN_OPEN_CHARS : choice !== null);

  function submit() {
    if (!canSubmit) return;
    if (question.type === "open") {
      const value = text.trim().slice(0, MAX_ANSWER_CHARS);
      onSubmit(value, value);
    } else {
      const picked = options.find((o) => o.value === choice);
      onSubmit(choice!, picked ? (question.type === "mcq" ? `${picked.value}. ${picked.label}` : picked.label) : choice!);
    }
  }

  const done = Math.min(question.number - (feedback ? 0 : 1), total);
  const bloom = toBloom(question.bloomLevel) ?? question.bloomLevel;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress: one segment per question */}
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm text-mute">
          <span>
            Question <span className="font-semibold tabular-nums text-paper">{question.number}</span> of up to{" "}
            <span className="tabular-nums">{total}</span>
          </span>
          <span>{done} answered</span>
        </div>
        <div
          className="flex gap-1"
          role="progressbar"
          aria-label="Test progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < done ? "bg-magenta" : i === question.number - 1 ? "bg-magenta/40" : "bg-line"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-line-strong px-3 py-1 text-mute">{TYPE_LABEL[question.type] ?? question.type}</span>
        <span className="flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-mute">
          <span className="h-2 w-2 rounded-full" style={{ background: bloomColor(question.bloomLevel) }} aria-hidden="true" />
          {bloom}
        </span>
      </div>

      <h2
        ref={headingRef}
        tabIndex={-1}
        id={`${groupId}-q`}
        className="font-sans text-xl font-semibold leading-snug text-paper outline-none sm:text-[1.4rem]"
      >
        {question.text}
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        {question.type === "open" ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${groupId}-answer`} className="text-sm text-mute">
              Your answer, in your own words
            </label>
            <textarea
              id={`${groupId}-answer`}
              value={feedback ? (submittedAnswer ?? text) : text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={locked}
              maxLength={MAX_ANSWER_CHARS}
              rows={6}
              className="w-full resize-y rounded-2xl border border-line-strong bg-ink-sunk px-4 py-3 text-paper placeholder:text-mute/70 focus:border-magenta focus:outline-none disabled:opacity-70"
              placeholder="Explain it as you would to a classmate."
            />
            {!feedback && <p className="text-xs text-mute">Ctrl+Enter sends your answer.</p>}
          </div>
        ) : (
          <div role="radiogroup" aria-labelledby={`${groupId}-q`} className="flex flex-col gap-2">
            {options.map((o) => {
              const picked = feedback ? submittedAnswer?.startsWith(question.type === "mcq" ? `${o.value}.` : o.label) : choice === o.value;
              return (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-magenta",
                    picked ? "border-magenta bg-magenta/10" : "border-line-strong hover:border-mute",
                    locked && "cursor-default"
                  )}
                >
                  <input
                    type="radio"
                    name={`${groupId}-choice`}
                    value={o.value}
                    checked={!!picked}
                    disabled={locked}
                    onChange={() => setChoice(o.value)}
                    className="sr-only"
                  />
                  {question.type === "mcq" && (
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        picked ? "border-magenta bg-magenta text-ink" : "border-line-strong text-mute"
                      )}
                      aria-hidden="true"
                    >
                      {o.value}
                    </span>
                  )}
                  <span className="text-paper">{o.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {!feedback && (
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={!canSubmit}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {busy ? (question.type === "open" ? "Grading your answer…" : "Checking…") : "Send answer"}
            </Button>
          </div>
        )}
      </form>

      <div aria-live="polite">
        {feedback && (
          <div
            className={cn(
              "rounded-2xl border p-5",
              feedback.correct ? "border-outcome-mastered/50 bg-outcome-mastered/[0.06]" : "border-outcome-attempted/50 bg-outcome-attempted/[0.06]"
            )}
          >
            <p className="flex items-center gap-2 font-display text-lg font-semibold">
              {feedback.correct ? (
                <Check className="h-5 w-5 text-outcome-mastered" aria-hidden="true" />
              ) : (
                <X className="h-5 w-5 text-outcome-attempted" aria-hidden="true" />
              )}
              {feedback.correct ? "Correct" : "Not quite"}
              {question.type === "open" && (
                <span className="ml-auto font-sans text-sm font-normal tabular-nums text-mute">Graded {Math.round(feedback.score)}/100</span>
              )}
            </p>
            {feedback.reasoning && <p className="mt-2 text-paper/90">{feedback.reasoning}</p>}
            {!feedback.correct && feedback.correctAnswer && question.type !== "open" && (
              <p className="mt-2 text-sm text-mute">
                Correct answer: <span className="font-semibold text-paper">{feedback.correctAnswer}</span>
              </p>
            )}
            {feedback.referenceKeyPoints && feedback.referenceKeyPoints.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-magenta-soft">What a full answer covers</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-paper/85">
                  {feedback.referenceKeyPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-4 flex justify-end">
              <Button ref={continueRef} size="lg" onClick={onContinue} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {feedback.isComplete ? (busy ? "Scoring your test…" : "See my results") : "Next question"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
