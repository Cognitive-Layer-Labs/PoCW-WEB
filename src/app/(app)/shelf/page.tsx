import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AddBook } from "@/components/AddBook";
import { UpdatesPrompt } from "@/components/UpdatesPrompt";
import { Cover } from "@/components/Cover";
import { buttonVariants } from "@/components/ui/button";
import { firstName, requireUser } from "@/lib/server/auth";
import { shelf, updatesOptIn, type ShelfBook } from "@/lib/server/repo";
import { plural, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your shelf" };

function BookStats({ book }: { book: ShelfBook }) {
  if (book.status === "failed") return <p className="text-sm font-semibold text-danger">Couldn&apos;t be mapped</p>;
  if (book.status !== "ready") return <p className="text-sm font-semibold text-outcome-attempted">Mapping the ideas…</p>;
  if (book.attempts === 0) return <p className="text-sm text-mute">Not tested yet</p>;
  return (
    <p className="text-sm text-mute">
      <span className="font-semibold tabular-nums text-paper">Best {Math.round(book.bestScore ?? 0)}</span>
      {book.attempts > 1 && <span className="tabular-nums">, last {Math.round(book.lastScore ?? 0)}</span>}
      <span>, {plural(book.attempts, "test")}</span>
    </p>
  );
}

export default async function ShelfPage() {
  const user = await requireUser("/shelf");
  const books = shelf(user.id);
  const askUpdates = updatesOptIn(user.id) === null;

  if (books.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-8 sm:pt-14">
        {askUpdates && <UpdatesPrompt />}
        <h1 className="text-[2.2rem] font-semibold leading-tight sm:text-5xl">Welcome, {firstName(user)}.</h1>
        <p className="mt-3 max-w-[36rem] text-lg text-mute">
          Your shelf is empty. Add a book you&apos;ve read, and Bookmap will map its ideas so you can test yourself on it.
        </p>
        <div className="mt-8">
          <AddBook />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      {askUpdates && <UpdatesPrompt />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.2rem] font-semibold leading-tight sm:text-5xl">Your shelf</h1>
          <p className="mt-2 text-mute">{plural(books.length, "book")}. The ribbon marks the ones you&apos;ve tested yourself on.</p>
        </div>
        <Link href="/add" className={cn(buttonVariants({ variant: "outline" }), "hidden sm:inline-flex")}>
          <Plus aria-hidden="true" /> Add a book
        </Link>
      </div>

      <ul className="mt-8 grid gap-x-8 gap-y-2 md:grid-cols-2">
        {books.map((book) => (
          <li key={book.id}>
            <Link
              href={`/book/${book.id}`}
              className="group flex items-start gap-5 rounded-2xl px-2 py-4 transition-colors hover:bg-ink-raised sm:px-3"
            >
              <Cover title={book.title} author={book.author} size="md" ribbon={book.attempts > 0} />
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="line-clamp-3 break-words text-xl font-semibold leading-snug group-hover:text-ribbon-soft">{book.title}</h2>
                {book.author && <p className="mt-0.5 truncate text-mute">{book.author}</p>}
                <div className="mt-3">
                  <BookStats book={book} />
                </div>
                <p className="mt-1 text-sm text-mute">Added {relativeDay(book.addedAt)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
