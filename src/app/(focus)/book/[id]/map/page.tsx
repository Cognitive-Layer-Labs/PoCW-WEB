import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MapView } from "@/components/graph/MapView";
import { requireUser } from "@/lib/server/auth";
import { attemptsForBook, bookForUser } from "@/lib/server/repo";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Map" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ attempt?: string }> };

export default async function MapPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { attempt: attemptParam } = await searchParams;
  const user = await requireUser(`/book/${id}/map`);
  const book = /^\d{1,12}$/.test(id) ? bookForUser(user.id, Number(id)) : null;
  if (!book) notFound();
  if (book.status !== "ready") redirect(`/book/${book.id}`);

  // Color by the chosen test, or by the latest one.
  const attempts = attemptsForBook(user.id, book.id);
  const chosen = (attemptParam && attempts.find((a) => String(a.id) === attemptParam)) || attempts[0] || null;

  return (
    <main id="main">
      <MapView
        bookId={book.id}
        knowledgeId={book.knowledgeId}
        title={book.title}
        outcomes={chosen ? chosen.concepts : null}
        outcomeSource={chosen ? `your test of ${shortDate(chosen.finishedAt)} (${Math.round(chosen.score ?? 0)})` : null}
      />
    </main>
  );
}
