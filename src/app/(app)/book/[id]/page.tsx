import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Waypoints } from "lucide-react";
import { BookStatus } from "@/components/BookStatus";
import { Cover } from "@/components/Cover";
import { RemoveBook } from "@/components/RemoveBook";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/server/auth";
import { attemptsForBook, bookForUser } from "@/lib/server/repo";
import { LEVEL_LABELS, band, plural, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const user = await requireUser(`/book/${id}`);
  const book = /^\d{1,12}$/.test(id) ? bookForUser(user.id, Number(id)) : null;
  if (!book) notFound();
  return { user, book };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { book } = await load(id);
  return { title: book.title };
}

export default async function BookPage({ params }: Props) {
  const { id } = await params;
  const { user, book } = await load(id);
  const attempts = attemptsForBook(user.id, book.id);
  const ready = book.status === "ready";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <Link href="/shelf" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-mute hover:text-paper">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your shelf
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
        <div className="flex items-start gap-5 sm:block">
          <Cover title={book.title} author={book.author} size="lg" ribbon={attempts.length > 0} className="max-sm:hidden" />
          <Cover title={book.title} author={book.author} size="md" ribbon={attempts.length > 0} className="sm:hidden" />
          <div className="min-w-0 sm:hidden">
            <h1 className="break-words text-[1.75rem] font-semibold leading-tight">{book.title}</h1>
            {book.author && <p className="mt-1 text-mute">{book.author}</p>}
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="hidden break-words text-[2.6rem] font-semibold leading-[1.08] sm:block">{book.title}</h1>
          {book.author && <p className="mt-1 hidden text-lg text-mute sm:block">{book.author}</p>}
          <p className="text-mute sm:mt-3">
            {ready && book.conceptCount !== null && <span className="text-paper">{plural(book.conceptCount, "idea")} mapped, </span>}
            added {relativeDay(book.addedAt)}
            {book.sourceKind === "link" && book.sourceUrl ? (
              <>
                {" "}from <span className="break-all">{new URL(book.sourceUrl).hostname.replace(/^www\./, "")}</span>
              </>
            ) : book.fileName ? (
              <> from {book.fileName}</>
            ) : null}
            .
          </p>

          <div className="mt-6">
            {ready ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={`/book/${book.id}/test`} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
                  Test yourself
                </Link>
                <Link href={`/book/${book.id}/map`} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}>
                  <Waypoints aria-hidden="true" /> Explore the map
                </Link>
              </div>
            ) : book.status === "failed" ? (
              <div role="alert" className="rounded-2xl border border-danger/50 bg-danger/[0.07] px-5 py-4">
                <p className="font-semibold">This book couldn&apos;t be mapped.</p>
                <p className="mt-1 text-mute">
                  {book.error ? `The mapper said: ${book.error}. ` : ""}Scanned PDFs without a text layer don&apos;t work. Try an EPUB or a different file.
                </p>
                <Link href="/add" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
                  Add a different file
                </Link>
              </div>
            ) : (
              <BookStatus knowledgeId={book.knowledgeId} />
            )}
          </div>

          {ready && (
            <section aria-labelledby="tests-heading" className="mt-12">
              <h2 id="tests-heading" className="text-2xl font-semibold">
                Your tests
              </h2>
              {attempts.length === 0 ? (
                <p className="mt-2 text-mute">No tests yet. Your first one takes about five minutes with five questions.</p>
              ) : (
                <ol className="mt-4 divide-y divide-line border-y border-line">
                  {attempts.map((a) => {
                    const score = Math.round(a.score ?? 0);
                    return (
                      <li key={a.id}>
                        <Link href={`/attempt/${a.id}`} className="group flex items-center gap-4 py-4 hover:bg-ink-raised/50 sm:px-2">
                          <span className="w-14 shrink-0 font-serif text-4xl font-semibold tabular-nums leading-none text-paper">{score}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold group-hover:text-ribbon-soft">{band(score).label}</span>
                            <span className="block text-sm text-mute">
                              {plural(a.questionsAsked ?? a.settings.questions, "question")}, {LEVEL_LABELS[a.settings.level] ?? "Standard"}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm text-mute">{relativeDay(a.finishedAt)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          <div className="mt-12">
            <RemoveBook bookId={book.id} attempts={attempts.length} />
          </div>
        </div>
      </div>
    </div>
  );
}
