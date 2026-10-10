import type { Metadata } from "next";
import { AddBook } from "@/components/AddBook";
import { requireUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a book" };

export default async function AddPage() {
  await requireUser("/add");
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-8 sm:pt-14">
      <h1 className="text-[2.2rem] font-semibold leading-tight sm:text-5xl">Add a book</h1>
      <p className="mt-3 max-w-[36rem] text-lg text-mute">Bring a book you&apos;ve read, as a file or a link. Bookmap maps its ideas, then you can test yourself on it.</p>
      <div className="mt-8">
        <AddBook />
      </div>
    </div>
  );
}
