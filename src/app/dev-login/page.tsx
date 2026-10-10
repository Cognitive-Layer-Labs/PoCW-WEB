import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { devLoginEnabled, safeNext } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Developer sign-in", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

/** DEV-ONLY: exists only when AUTH_DEV_LOGIN=1 (automated tests). */
export default async function DevLogin({ searchParams }: Props) {
  if (!devLoginEnabled()) notFound();
  const { next, error } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-8 px-4 py-10">
      <Logo />
      <div>
        <h1 className="text-3xl font-semibold">Developer sign-in</h1>
        <p className="mt-2 text-mute">
          Test builds only. This page exists because <code className="text-paper">AUTH_DEV_LOGIN=1</code> is set; it must never be set in
          production.
        </p>
      </div>
      <form action="/api/auth/dev" method="post" className="flex flex-col gap-4">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-mute">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            className="h-12 rounded-xl border border-line-strong bg-ink-sunk px-4 text-paper focus:border-ribbon focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-mute">Name</span>
          <input
            name="name"
            type="text"
            autoComplete="off"
            className="h-12 rounded-xl border border-line-strong bg-ink-sunk px-4 text-paper focus:border-ribbon focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            Enter a valid email address.
          </p>
        )}
        <Button type="submit" size="lg">
          Sign in
        </Button>
      </form>
    </main>
  );
}
