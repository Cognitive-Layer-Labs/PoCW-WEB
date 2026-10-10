import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { adminEmails } from "@/lib/server/auth";

/** Where readers send privacy and account requests. */
export function contactEmail(): string {
  return process.env.CONTACT_EMAIL?.trim() || adminEmails()[0] || "";
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/" aria-label="Bookmap home">
            <Logo />
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <h1 className="text-[2.2rem] font-semibold leading-tight sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-mute">Last updated {updated}</p>
        <div className="mt-8 space-y-4 leading-relaxed text-paper/90 [&_a]:text-ribbon-soft [&_a]:underline [&_h2]:pt-4 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-paper [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
