import Link from "next/link";
import { BookmapMark } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-start justify-center gap-5 px-4 py-16">
      <BookmapMark className="h-12 w-12" />
      <h1 className="text-4xl font-semibold">This page isn&apos;t on any shelf</h1>
      <p className="text-mute">The link may be mistyped, or the book or result was removed.</p>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        Go to Bookmap
      </Link>
    </main>
  );
}
