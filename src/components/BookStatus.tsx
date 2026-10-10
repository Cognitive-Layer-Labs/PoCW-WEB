"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMapArt } from "@/components/BookMapArt";
import { EngineError, getIndexStatus } from "@/lib/engine";

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * Shown while a book is being mapped: polls the status (honouring
 * Retry-After) and refreshes the page once the map is ready or has failed.
 */
export function BookStatus({ knowledgeId }: { knowledgeId: string }) {
  const router = useRouter();
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [gone, setGone] = useState(false);
  const [slow, setSlow] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const poll = async () => {
      let wait = 8000;
      try {
        const { status, retryAfterMs } = await getIndexStatus(knowledgeId);
        if (cancelled) return;
        setSlow(false);
        if (status.status === "ready" || status.status === "failed") {
          done.current = true;
          router.refresh();
          return;
        }
        wait = retryAfterMs;
      } catch (err) {
        if (cancelled) return;
        if (err instanceof EngineError && err.gone) {
          setGone(true);
          return;
        }
        setSlow(true); // transient: keep waiting
      }
      timer = setTimeout(poll, wait);
    };
    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [knowledgeId, router]);

  if (gone) {
    return (
      <p role="alert" className="rounded-2xl border border-danger/50 bg-danger/[0.07] px-4 py-3">
        This book is no longer available on the mapper. Remove it and add it again.
      </p>
    );
  }

  const waited = now - since;
  return (
    <div className="rounded-[1.75rem] border border-line-strong bg-ink-raised/70 px-5 pb-6 pt-4 sm:px-7" aria-live="polite">
      <BookMapArt state="working" className="mx-auto h-auto w-full max-w-[22rem]" />
      <p className="mt-2 font-serif text-2xl font-semibold">Mapping the ideas…</p>
      <p className="mt-2 text-mute">
        Bookmap is reading the book and drawing how its key ideas connect. A long book can take several minutes. You can leave this page;
        the book stays on your shelf and keeps mapping.
      </p>
      <p className="mt-3 text-sm tabular-nums text-mute">
        {elapsed(waited)} so far{slow ? ". The mapper is slow to answer; still waiting." : "."}
      </p>
    </div>
  );
}
