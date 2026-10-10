import type { Metadata } from "next";
import { FindBook } from "@/components/find/FindBook";
import { requireUser } from "@/lib/server/auth";
import { initialLists } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a book" };

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function AddPage({ searchParams }: Props) {
  const user = await requireUser("/add");
  const { q } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pt-14">
      <h1 className="text-[2.2rem] font-semibold leading-tight sm:text-5xl">Add a book</h1>
      <p className="mb-8 mt-3 max-w-[38rem] text-lg text-mute">
        Find the book you&apos;ve read. Classics from Project Gutenberg are mapped straight away; for any other book, you upload your own copy.
      </p>
      <FindBook initialQuery={typeof q === "string" ? q.slice(0, 120) : ""} lists={initialLists(user.id)} />
    </div>
  );
}
