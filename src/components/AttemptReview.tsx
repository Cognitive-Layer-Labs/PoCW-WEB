import { Check, X } from "lucide-react";
import { KeyPointList } from "@/components/KeyPointList";
import { duration } from "@/lib/admin-format";
import { summarizeKeyPoints } from "@/lib/keypoints";
import type { Attempt, TranscriptItem } from "@/lib/server/repo";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = { open: "Written", mcq: "Multiple choice", true_false: "True or false" };

const cleanOption = (o: string) => o.replace(/^\s*[A-Da-d][).:\]]\s+/, "");

/** Turns what was sent ("B", "true") back into what the reader saw. */
function shownAnswer(item: TranscriptItem): string {
  if (item.type === "mcq" && item.options && /^[A-Da-d]$/.test(item.answer.trim())) {
    const i = item.answer.trim().toUpperCase().charCodeAt(0) - 65;
    if (item.options[i]) return `${item.answer.trim().toUpperCase()}. ${cleanOption(item.options[i])}`;
  }
  if (item.type === "true_false") return item.answer.trim().toLowerCase() === "true" ? "True" : item.answer.trim().toLowerCase() === "false" ? "False" : item.answer;
  return item.answer;
}

function shownCorrect(item: TranscriptItem): string | null {
  const c = item.correctAnswer?.trim();
  if (!c) return null;
  if (item.type === "mcq" && item.options && /^[A-Da-d]$/.test(c)) {
    const i = c.toUpperCase().charCodeAt(0) - 65;
    if (item.options[i]) return `${c.toUpperCase()}. ${cleanOption(item.options[i])}`;
  }
  if (item.type === "true_false") return c.toLowerCase() === "true" ? "True" : c.toLowerCase() === "false" ? "False" : c;
  return c;
}

/** Seconds spent on each question, from answeredAt stamps (admin view). */
function secondsPerQuestion(attempt: Attempt, items: TranscriptItem[]): Map<number, number> {
  const out = new Map<number, number>();
  let prev: { n: number; t: number } | null = { n: 0, t: Date.parse(attempt.startedAt) };
  for (const it of items) {
    const t = it.answeredAt ? Date.parse(it.answeredAt) : NaN;
    if (Number.isFinite(t) && prev && prev.n === it.number - 1 && t > prev.t) out.set(it.number, (t - prev.t) / 1000);
    prev = Number.isFinite(t) ? { n: it.number, t } : null;
  }
  return out;
}

/** Question-by-question review of an attempt. `admin` adds grader and timing details. */
export function AttemptReview({ attempt, admin = false, heading = "Question by question" }: { attempt: Attempt; admin?: boolean; heading?: string | null }) {
  const items: TranscriptItem[] =
    attempt.transcript.length > 0
      ? [...attempt.transcript].sort((a, b) => a.number - b.number)
      : attempt.responseDetail.map((d, i) => ({ number: i + 1, question: d.question, type: d.type, answer: "", correct: d.correct, score: d.score }));
  if (items.length === 0) return null;
  const secs = admin ? secondsPerQuestion(attempt, items) : new Map<number, number>();
  return (
    <section aria-labelledby={heading ? "review-heading" : undefined} aria-label={heading ? undefined : "Answers"}>
      {heading && (
        <h2 id="review-heading" className="text-2xl font-semibold">
          {heading}
        </h2>
      )}
      <ol className={cn("flex flex-col divide-y divide-line", heading ? "mt-4 border-y border-line" : "-my-5")}>
        {items.map((it) => {
          const correct = shownCorrect(it);
          const summary = it.keyPoints && it.keyPoints.length > 0 ? summarizeKeyPoints(it.keyPoints, it.correct) : null;
          const meta = [
            admin && it.bloomLevel ? it.bloomLevel : null,
            admin && it.gradedBy ? `graded by ${it.gradedBy.toUpperCase()}` : null,
            admin && secs.has(it.number) ? duration(secs.get(it.number)!) : null,
          ].filter(Boolean);
          return (
            <li key={it.number} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-5">
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full",
                  it.correct ? "bg-outcome-mastered/15 text-outcome-mastered" : "bg-outcome-attempted/15 text-outcome-attempted"
                )}
              >
                {it.correct ? <Check className="h-4 w-4" aria-label="Correct" /> : <X className="h-4 w-4" aria-label="Not quite" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-mute">
                  {it.number}. {TYPE_LABEL[it.type] ?? it.type}
                  {it.type === "open" && summary && <span className="tabular-nums">, {summary.tally}</span>}
                  {it.type === "open" && !summary && <span className="tabular-nums">, graded {Math.round(it.score)}/100</span>}
                  {meta.length > 0 && <span>, {meta.join(", ")}</span>}
                </p>
                <p className="mt-1 font-serif text-lg leading-snug text-paper">{it.question}</p>
                {it.answer && (
                  <p className="mt-2 break-words text-paper/90">
                    <span className="text-mute">{admin ? "They answered: " : "You answered: "}</span>
                    {shownAnswer(it)}
                  </p>
                )}
                {!it.correct && correct && it.type !== "open" && (
                  <p className="mt-1 text-paper/90">
                    <span className="text-mute">Correct answer: </span>
                    {correct}
                  </p>
                )}
                {summary ? (
                  <KeyPointList points={it.keyPoints!} className="mt-3 text-[0.95rem]" />
                ) : (
                  it.reasoning && <p className="mt-2 text-sm text-mute">{it.reasoning}</p>
                )}
                {it.modelAnswer && (
                  <p className="mt-3 text-[0.95rem] text-paper/90">
                    <span className="font-semibold text-paper">A full answer: </span>
                    {it.modelAnswer}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
