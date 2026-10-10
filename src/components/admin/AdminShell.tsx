import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookmapMark } from "@/components/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import type { User } from "@/lib/server/auth";

/** Operator layout: a quiet sidebar on desktop, a sticky bar with section tabs on phones. */
export function AdminShell({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-ink text-[0.9375rem] leading-normal lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-ink-sunk lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col lg:px-4 lg:py-6">
        <Link href="/admin" className="flex min-h-11 items-center gap-2.5 rounded-lg px-2">
          <BookmapMark className="h-7 w-7 shrink-0" />
          <span className="font-serif text-lg font-semibold leading-none text-paper">Bookmap</span>
          <span className="rounded-md border border-line-strong px-1.5 py-0.5 text-xs font-semibold text-mute">Admin</span>
        </Link>
        <div className="mt-8 pl-3">
          <AdminNav variant="side" />
        </div>
        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
          <Link href="/shelf" className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-mute hover:text-paper">
            <ArrowLeft aria-hidden="true" className="size-4" /> Back to your shelf
          </Link>
          <p className="truncate px-2 text-xs text-mute" title={user.email}>
            Signed in as {user.email}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-ink-sunk/95 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <div className="flex h-11 items-center gap-2.5">
            <Link href="/admin" className="flex min-h-11 items-center gap-2 rounded-lg">
              <BookmapMark className="h-7 w-7 shrink-0" />
              <span className="font-serif text-lg font-semibold leading-none text-paper">Admin</span>
            </Link>
            <Link href="/shelf" className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-mute hover:text-paper">
              <ArrowLeft aria-hidden="true" className="size-4" /> Shelf
            </Link>
          </div>
          <div className="mt-2">
            <AdminNav variant="tabs" />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[84rem] px-4 pb-20 pt-6 sm:px-6 lg:px-10 lg:pt-9">
          {children}
        </main>
      </div>
    </div>
  );
}
