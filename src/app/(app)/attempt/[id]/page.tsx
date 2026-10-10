import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RotateCcw, Waypoints } from "lucide-react";
import { AttemptReview } from "@/components/AttemptReview";
import { Cover } from "@/components/Cover";
import { ScoreScale } from "@/components/ScoreScale";
import { ShareButton } from "@/components/ShareButton";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/server/auth";
import { attemptForUser, bookForUser } from "@/lib/server/repo";
import { LEVEL_BARS, LEVEL_LABELS, band, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your result" };

type Props = { params: Promise<{ id: string }> };

const DISCLAIMER_TITLES: Record<string, string> = {
  irtCalibration: "About the score",
  bloomMapping: "About question levels",
  thresholdSemantics: "About the pass bar",
};

export default async function AttemptPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/attempt/${id}`);
  const attempt = /^\d{1,12}$/.test(id) ? attemptForUser(user.id, Number(id)) : null;
  const book = attempt ? bookForUser(user.id, attempt.bookId) : null;
  if (!attempt || !book) notFound();

  const back = (
    <Link href={`/book/${book.id}`} className="group -ml-1 inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-lg px-1 py-1 text-mute hover:text-paper">
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <Cover title={book.title} author={book.author} src={book.coverUrl} size="xs" />
      <span className="truncate book-title">{book.title}</span>
    </Link>
  );

  if (!attempt.finishedAt || attempt.score === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        {back}
        <h1 className="mt-6 text-3xl font-semibold">This test wasn&apos;t finished</h1>
        <p className="mt-2 text-mute">Start a new one from the book page whenever you like.</p>
        <Link href={`/book/${book.id}/test`} className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
          Test yourself
        </Link>
      </div>
    );
  }

  const score = Math.max(0, Math.min(100, Math.round(attempt.score)));
  const { label, line } = band(score);
  const level = attempt.settings.level;
  const bar = LEVEL_BARS[level] ?? null;
  const tested = attempt.concepts.filter((c) => c.asked > 0);
  const mastered = tested.filter((c) => c.mastered);
  const disclaimers = Object.entries(attempt.disclaimers).filter(([, v]) => typeof v === "string" && v);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      {back}

      <section aria-labelledby="result-heading" className="mt-6">
        <p className="text-mute">{dateTime(attempt.finishedAt)}</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="font-serif text-[6rem] font-semibold leading-[0.8] tracking-tight tabular-nums sm:text-[8rem]" data-testid="score">
            <span className="sr-only">Score </span>
            {score}
          </p>
          <div className="pb-1">
            <h1 id="result-heading" className="text-[2rem] font-semibold leading-tight sm:text-[2.6rem]">
              {label}
            </h1>
            <p className="text-mute">
              out of 100, likely between <span className="tabular-nums text-paper">{Math.round(attempt.ciLow ?? score)}</span> and{" "}
              <span className="tabular-nums text-paper">{Math.round(attempt.ciHigh ?? score)}</span>
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-[36rem] text-lg">{line}</p>
        <p className="mt-2 text-mute">
          {attempt.competence
            ? `You cleared the ${LEVEL_LABELS[level] ?? "Standard"} bar of ${bar}.`
            : `The ${LEVEL_LABELS[level] ?? "Standard"} bar is ${bar}; you're below it this time.`}{" "}
          {attempt.questionsAsked ?? attempt.settings.questions} questions.
        </p>
        <div className="mt-6">
          <ScoreScale score={score} low={attempt.ciLow ?? score} high={attempt.ciHigh ?? score} bar={bar} />
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <ShareButton attemptId={attempt.id} bookTitle={book.title} score={score} className="sm:min-w-[16rem]" />
        <Link href={`/book/${book.id}/map?attempt=${attempt.id}`} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}>
          <Waypoints aria-hidden="true" /> See it on the map
        </Link>
        <Link href={`/book/${book.id}/test`} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}>
          <RotateCcw aria-hidden="true" /> Test again
        </Link>
      </div>

      {tested.length > 0 && (
        <section aria-labelledby="ideas-heading" className="mt-12">
          <h2 id="ideas-heading" className="text-2xl font-semibold">
            Ideas mastered: <span className="tabular-nums">{mastered.length}</span> of <span className="tabular-nums">{tested.length}</span>
          </h2>
          <p className="mt-1 text-mute">The ideas your questions were about.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {[...tested]
              .sort((a, b) => Number(b.mastered) - Number(a.mastered))
              .map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 text-sm",
                    c.mastered ? "border-outcome-mastered/50 text-paper" : "border-outcome-attempted/50 text-paper"
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", c.mastered ? "bg-outcome-mastered" : "bg-outcome-attempted")} aria-hidden="true" />
                  {c.label}
                  <span className="sr-only">{c.mastered ? "(mastered)" : "(not yet)"}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="mt-12">
        <AttemptReview attempt={attempt} />
      </div>

      {disclaimers.length > 0 && (
        <details className="mt-10 rounded-2xl border border-line px-5 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-paper">How to read this score</summary>
          <dl className="mb-3 mt-2 flex flex-col gap-3 text-sm">
            {disclaimers.map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-paper/90">{DISCLAIMER_TITLES[k] ?? k}</dt>
                <dd className="mt-0.5 text-mute">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold text-paper/90">About the grading</dt>
              <dd className="mt-0.5 text-mute">
                A language model writes the questions from the book and grades written answers against key points from it. It can be wrong, so
                read the reasons.
              </dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  );
}
