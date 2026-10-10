"use client";

import { useRef, useState } from "react";
import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Creates the public link for a result. Phones get the native share sheet;
 * everything else copies the link (and shows it, in case copying is blocked).
 */
export function ShareButton({ attemptId, bookTitle, score, className }: { attemptId: number; bookTitle: string; score: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ensureUrl(): Promise<string | null> {
    if (url) return url;
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attemptId }),
    }).catch(() => null);
    const body = res && res.ok ? ((await res.json().catch(() => null)) as { url?: string } | null) : null;
    if (!body?.url) {
      setNote("The share link couldn't be created. Try again.");
      return null;
    }
    setUrl(body.url);
    return body.url;
  }

  async function copy(link: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      inputRef.current?.select();
      return false;
    }
  }

  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const link = await ensureUrl();
      if (!link) return;
      const mobile = window.matchMedia("(pointer: coarse)").matches;
      if (mobile && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "My Bookmap result", text: `I scored ${score} on ${bookTitle} with Bookmap.`, url: link });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // fall through to copying
        }
      }
      setNote((await copy(link)) ? "Link copied. Anyone with it can see your first name, the book and your score." : "Copy the link below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button size="lg" onClick={share} disabled={busy} className="w-full sm:w-auto" data-testid="share">
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Share2 aria-hidden="true" />}
        Share my result
      </Button>
      {url && (
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor={`share-${attemptId}`}>
            Share link
          </label>
          <input
            ref={inputRef}
            id={`share-${attemptId}`}
            readOnly
            value={url}
            data-testid="share-url"
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ink-sunk px-4 text-sm text-paper focus:border-ribbon focus:outline-none"
          />
          <Button
            variant="outline"
            size="sm"
            aria-label="Copy link"
            onClick={async () => setNote((await copy(url)) ? "Link copied." : "Select the link and copy it.")}
          >
            {note?.startsWith("Link copied") ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </Button>
        </div>
      )}
      <p aria-live="polite" className={cn("text-sm text-mute", !note && "sr-only")}>
        {note ?? ""}
      </p>
    </div>
  );
}
