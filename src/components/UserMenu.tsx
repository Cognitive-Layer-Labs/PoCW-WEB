"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  admin: boolean;
}

export function Avatar({ name, email, avatarUrl, className }: { name: string | null; email: string; avatarUrl: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || email).trim().charAt(0).toUpperCase();
  return avatarUrl && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn("h-9 w-9 rounded-full object-cover", className)}
    />
  ) : (
    <span className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-ribbon-deep font-serif font-semibold text-paper", className)}>
      {initial}
    </span>
  );
}

export function UserMenu({ name, email, avatarUrl, admin }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${name || email}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink-raised"
      >
        <Avatar name={name} email={email} avatarUrl={avatarUrl} />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line-strong bg-ink-raised p-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <div className="px-3 pb-3 pt-2">
            <p className="truncate font-semibold text-paper">{name || "Signed in"}</p>
            <p className="truncate text-sm text-mute">{email}</p>
          </div>
          <div className="border-t border-line pt-2">
            {admin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-paper hover:bg-ink"
              >
                <ShieldCheck className="h-4 w-4 text-mute" aria-hidden="true" /> Admin
              </Link>
            )}
            <form action="/api/auth/signout" method="post">
              <button type="submit" className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-paper hover:bg-ink")}>
                <LogOut className="h-4 w-4 text-mute" aria-hidden="true" /> Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
