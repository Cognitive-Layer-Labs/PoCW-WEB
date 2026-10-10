import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TestRunner } from "@/components/TestRunner";
import { requireUser } from "@/lib/server/auth";
import { bookForUser } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test yourself" };

type Props = { params: Promise<{ id: string }> };

export default async function TestPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/book/${id}/test`);
  const book = /^\d{1,12}$/.test(id) ? bookForUser(user.id, Number(id)) : null;
  if (!book) notFound();
  if (book.status !== "ready") redirect(`/book/${book.id}`);
  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 pb-6 pt-6 sm:px-8 sm:pb-16 sm:pt-10">
      <TestRunner bookId={book.id} knowledgeId={book.knowledgeId} title={book.title} />
    </div>
  );
}
