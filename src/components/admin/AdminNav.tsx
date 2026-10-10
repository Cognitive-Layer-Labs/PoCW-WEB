"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Coins, LayoutDashboard, ListChecks, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/readers", label: "Readers", icon: Users },
  { href: "/admin/books", label: "Books", icon: BookOpen },
  { href: "/admin/tests", label: "Tests", icon: ListChecks },
  { href: "/admin/costs", label: "Costs", icon: Coins },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The ribbon that marks the open section, like a bookmark between pages. */
function Ribbon() {
  return (
    <svg viewBox="0 0 10 18" aria-hidden="true" className="absolute -left-3 top-0 h-[1.35rem] w-[0.6rem]">
      <path d="M0 0H10V18L5 13.5L0 18Z" fill="#F0579B" />
    </svg>
  );
}

/** Sidebar list on desktop, a scrollable row of tabs on phones. */
export function AdminNav({ variant }: { variant: "side" | "tabs" }) {
  const pathname = usePathname() ?? "/admin";

  if (variant === "tabs") {
    return (
      <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex w-max min-w-full gap-0.5 rounded-full border border-line bg-ink p-1">
          {ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-full px-2.5 text-sm font-semibold transition-colors",
                    active ? "bg-paper text-ink" : "text-mute hover:text-paper"
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Admin sections">
      <ul className="flex flex-col gap-0.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative">
              {active && <Ribbon />}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-[0.95rem] transition-colors",
                  active ? "bg-ink-raised font-semibold text-paper" : "text-mute hover:bg-ink-raised/50 hover:text-paper"
                )}
              >
                <Icon aria-hidden="true" className={cn("size-[1.05rem]", active ? "text-ribbon-soft" : "text-mute")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
