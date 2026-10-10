import Link from "next/link";
import { redirect } from "next/navigation";
import { BookMapArt } from "@/components/BookMapArt";
import { GoogleButton } from "@/components/GoogleButton";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { currentUser, devLoginEnabled, safeNext } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Bring your book",
    body: "Drop in a PDF, EPUB or text file up to 40 MB, or paste a link to one.",
  },
  {
    title: "See its map",
    body: "Bookmap finds the book's key ideas and draws how they connect. A long book takes a few minutes.",
  },
  {
    title: "Test yourself",
    body: "Answer 5, 10 or 15 questions. Each answer is graded with a short reason, and your map shows what stuck.",
  },
];

const ERRORS: Record<string, string> = {
  signin: "Google sign-in didn't complete. Try again.",
  cancelled: "Sign-in was cancelled. Continue with Google when you're ready.",
  config: "Google sign-in isn't set up on this server yet.",
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function Landing({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = rawNext ? safeNext(rawNext) : undefined;
  if (await currentUser()) redirect(next ?? "/shelf");
  const problem = error ? ERRORS[error] : null;

  return (
    <>
      <header>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Logo />
          <a href={`/api/auth/signin/google${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="flex min-h-11 items-center rounded-full px-3 font-semibold text-mute hover:text-paper">
            Sign in
          </a>
        </div>
      </header>

      <main id="main">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14 lg:pb-24 lg:pt-16"
        >
          <div>
            <h1
              id="hero-heading"
              className="text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.015em] sm:text-[3.6rem] lg:text-[4.1rem]"
            >
              You read the book. Now see what stayed with you.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-mute">
              Bring a book you&apos;ve read. Bookmap draws a map of its ideas, then asks you a few questions about them, so you can see
              what you really took in.
            </p>
            {problem && (
              <p role="alert" className="mt-6 max-w-[34rem] rounded-2xl border border-danger/50 bg-danger/[0.07] px-4 py-3 text-paper">
                {problem}
              </p>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <GoogleButton next={next} className="w-full sm:w-auto" />
              <p className="text-sm text-mute">Free while we test it with a small group of readers.</p>
            </div>
            {devLoginEnabled() && (
              <p className="mt-4 text-sm">
                <Link href={`/dev-login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-ribbon-soft underline underline-offset-4">
                  Developer sign-in (test builds only)
                </Link>
              </p>
            )}
          </div>

          <figure className="mx-auto w-full max-w-[36rem] lg:max-w-none">
            <BookMapArt state="intro" className="h-auto w-full" />
            <figcaption className="mt-3 text-center text-sm text-mute">
              <span className="book-title">Meditations</span> by Marcus Aurelius, mapped after a test. Green ideas stuck; amber ones
              need another look.
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="how-heading" className="border-t border-line/70 bg-ink-sunk">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 lg:py-24">
            <h2 id="how-heading" className="text-3xl font-semibold leading-tight sm:text-[2.4rem]">
              How it works
            </h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-10">
              {STEPS.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 md:block">
                  <span aria-hidden="true" className="font-serif text-5xl font-semibold leading-none text-ribbon md:text-6xl">
                    {i + 1}
                  </span>
                  <div className="md:mt-5">
                    <h3 className="text-xl font-semibold">{step.title}</h3>
                    <p className="mt-2 max-w-[22rem] text-mute">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="border-t border-line/70">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-8 md:flex-row md:items-center md:justify-between lg:py-20">
            <div>
              <h2 id="cta-heading" className="text-3xl font-semibold leading-tight sm:text-[2.4rem]">
                Which book did you finish last?
              </h2>
              <p className="mt-3 max-w-[34rem] text-mute">Sign in with Google and add it to your shelf. It takes a minute.</p>
            </div>
            <GoogleButton next={next} className="w-full md:w-auto" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
