"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
export const cleanOption = (o: string) => o.replace(/^\s*[A-Da-d][).:\]]\s+/, "");

/**
 * Keeps the bottom action bar above the on-screen keyboard. Chrome on Android
 * resizes the layout (interactive-widget=resizes-content); iOS Safari doesn't,
 * so the keyboard height is read from the visual viewport.
 */
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--kb");
    };
  }, []);
}

interface Props {
  question: VerifyQuestion;
  total: number;
  feedback: AnswerFeedback | null;
  submittedAnswer: string | null;
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (answer: string, display: string) => void;
  onContinue: () => void;
}

export function QuestionView({ question, total, feedback, submittedAnswer, busy, draft, onDraft, onSubmit, onContinue }: Props) {
  const [choice, setChoice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const groupId = useId();
  useKeyboardInset();

  // Move focus to the new question so keyboard and screen-reader users follow along.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [question.number]);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
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
  const canSubmit = !locked && (question.type === "open" ? draft.trim().length >= MIN_OPEN_CHARS : choice !== null);

  function submit() {
    if (!canSubmit) return;
    if (question.type === "open") {
      const value = draft.trim().slice(0, MAX_ANSWER_CHARS);
      onSubmit(value, value);
    } else {
      const picked = options.find((o) => o.value === choice);
      onSubmit(choice!, picked ? (question.type === "mcq" ? `${picked.value}. ${picked.label}` : picked.label) : choice!);
    }
  }

  const done = Math.min(question.number - (feedback ? 0 : 1), total);
  const formId = `${groupId}-form`;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress: one segment per question */}
      <div>
        <p className="mb-2 text-sm text-mute" aria-live="polite">
          Question <span className="font-semibold tabular-nums text-paper">{question.number}</span> of{" "}
          <span className="tabular-nums" data-testid="question-total">
            {total}
          </span>
        </p>
        <div className="flex gap-1" role="progressbar" aria-label="Test progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < done ? "bg-ribbon" : i === question.number - 1 ? "bg-ribbon/40" : "bg-line"
              )}
            />
          ))}
        </div>
      </div>

      <p className="text-sm font-semibold text-mute">{TYPE_LABEL[question.type] ?? question.type}</p>

      <h2
        ref={headingRef}
        tabIndex={-1}
        id={`${groupId}-q`}
        data-testid="question-text"
        className="-mt-3 max-w-[38rem] text-[1.35rem] font-medium leading-snug text-paper outline-none sm:text-[1.6rem]"
      >
        {question.text}
      </h2>

      <form
        id={formId}
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
              value={feedback ? (submittedAnswer ?? draft) : draft}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={locked}
              maxLength={MAX_ANSWER_CHARS}
              rows={5}
              className="w-full scroll-mb-28 resize-y rounded-2xl border border-line-strong bg-ink-sunk px-4 py-3 text-paper placeholder:text-mute/70 focus:border-ribbon focus:outline-none disabled:opacity-70"
              placeholder="Explain it as you would to a friend."
            />
          </div>
        ) : (
          <div role="radiogroup" aria-labelledby={`${groupId}-q`} className="flex flex-col gap-2">
            {options.map((o) => {
              const picked = feedback
                ? submittedAnswer === (question.type === "mcq" ? `${o.value}. ${o.label}` : o.label)
                : choice === o.value;
              return (
                <label
                  key={o.value}
                  className={cn(
                    "flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ribbon",
                    picked ? "border-ribbon bg-ribbon/10" : "border-line-strong hover:border-mute",
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
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                      picked ? "border-ribbon bg-ribbon text-ink" : "border-line-strong text-mute"
                    )}
                    aria-hidden="true"
                  >
                    {question.type === "mcq" ? o.value : o.value === "true" ? "T" : "F"}
                  </span>
                  <span className="text-paper">{o.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </form>

      <div aria-live="polite">
        {feedback && (
          <div
            data-testid="feedback"
            className={cn(
              "rounded-2xl border p-5",
              feedback.correct ? "border-outcome-mastered/50 bg-outcome-mastered/[0.06]" : "border-outcome-attempted/50 bg-outcome-attempted/[0.06]"
            )}
          >
            <h3 ref={feedbackRef} tabIndex={-1} className="flex items-center gap-2 font-serif text-xl font-semibold outline-none">
              {feedback.correct ? (
                <Check className="h-5 w-5 text-outcome-mastered" aria-hidden="true" />
              ) : (
                <X className="h-5 w-5 text-outcome-attempted" aria-hidden="true" />
              )}
              {feedback.correct ? "Correct" : "Not quite"}
              {question.type === "open" && (
                <span className="ml-auto font-sans text-sm font-normal tabular-nums text-mute">Graded {Math.round(feedback.score)}/100</span>
              )}
            </h3>
            {feedback.reasoning && <p className="mt-2 text-paper/90">{feedback.reasoning}</p>}
            {!feedback.correct && feedback.correctAnswer && question.type !== "open" && (
              <p className="mt-2 text-sm text-mute">
                Correct answer: <span className="font-semibold text-paper">{feedback.correctAnswer}</span>
              </p>
            )}
            {feedback.referenceKeyPoints && feedback.referenceKeyPoints.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ribbon-soft">What a full answer covers</summary>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-paper/85">
                  {feedback.referenceKeyPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Action bar: sticks to the bottom of the screen (above the keyboard) on phones. */}
      <div
        className="sticky z-20 -mx-4 mt-auto border-t border-line bg-ink/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        style={{ bottom: "var(--kb, 0px)" }}
      >
        {feedback ? (
          <Button size="lg" onClick={onContinue} disabled={busy} className="w-full sm:w-auto" data-testid="continue">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {feedback.isComplete ? (busy ? "Scoring your test…" : "See my results") : "Next question"}
          </Button>
        ) : (
          <Button type="submit" form={formId} size="lg" disabled={!canSubmit} className="w-full sm:w-auto" data-testid="send-answer">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? (question.type === "open" ? "Grading your answer…" : "Checking…") : "Send answer"}
          </Button>
        )}
      </div>
    </div>
  );
}
