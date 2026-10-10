import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { buttonVariants } from "@/components/ui/button";
import { firstName } from "@/lib/server/auth";
import { sharedResult } from "@/lib/server/repo";
import { band } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = sharedResult(slug);
  if (!r) return { title: "Result not found", robots: { index: false } };
  const who = firstName({ name: r.name });
  const title = `${who} scored ${r.score} on ${r.bookTitle}`;
  const description =
    r.tested > 0 ? `Mastered ${r.mastered} of ${r.tested} ideas from the book. Map your own book with Bookmap.` : "Map your own book with Bookmap.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "article", url: `/s/${r.slug}`, siteName: "Bookmap" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Public, no sign-in: first name, book, score. Nothing else about the reader. */
export default async function SharePage({ params }: Props) {
  const { slug } = await params;
  const r = sharedResult(slug);
  if (!r) notFound();
  const who = firstName({ name: r.name });
  const masteredIdeas = r.concepts.filter((c) => c.asked > 0 && c.mastered).slice(0, 8);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header>
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-8">
          <Link href="/" aria-label="Bookmap home" className="flex min-h-11 items-center">
            <Logo />
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1">
        <div className="mx-auto grid max-w-4xl gap-10 px-4 pb-16 pt-6 sm:px-8 sm:pt-12 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14">
          <Cover title={r.bookTitle} author={r.bookAuthor} size="lg" ribbon className="mx-auto md:mx-0" />
          <div>
            <p className="text-lg text-mute">{who} tested themselves on</p>
            <h1 className="book-title mt-1 break-words text-[2.2rem] font-semibold leading-tight sm:text-5xl">{r.bookTitle}</h1>
            {r.bookAuthor && <p className="mt-1 text-mute">{r.bookAuthor}</p>}
            <div className="mt-8 flex items-end gap-5">
              <p className="font-serif text-[6.5rem] font-semibold leading-[0.8] tabular-nums sm:text-[8rem]" data-testid="shared-score">
                {r.score}
              </p>
              <div className="pb-1">
                <p className="font-serif text-2xl font-semibold">{band(r.score).label}</p>
                <p className="text-mute">out of 100, {r.questions} questions</p>
              </div>
            </div>
            {r.tested > 0 && (
              <div className="mt-8">
                <p className="text-lg">
                  Mastered <span className="font-semibold tabular-nums">{r.mastered}</span> of <span className="tabular-nums">{r.tested}</span> ideas from the book.
                </p>
                {masteredIdeas.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {masteredIdeas.map((c) => (
                      <li key={c.id} className="flex min-h-9 items-center gap-2 rounded-full border border-outcome-mastered/50 px-3 py-1 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-outcome-mastered" aria-hidden="true" />
                        {c.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-10 border-t border-line pt-8">
              <p className="font-serif text-2xl font-semibold">What stayed with you from your last book?</p>
              <p className="mt-2 text-mute">Bookmap turns a book you&apos;ve read into a map of its ideas, then tests you on it.</p>
              <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-5 w-full sm:w-auto")}>
                Map your own book
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
