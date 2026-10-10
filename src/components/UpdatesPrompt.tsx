"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One-time question after sign-in: may we email this reader about new features? */
export function UpdatesPrompt() {
  const [state, setState] = useState<"ask" | "saving" | "yes" | "no" | "error">("ask");

  async function answer(optIn: boolean) {
    setState("saving");
    try {
      const res = await fetch("/api/me/updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optIn }),
      });
      setState(res.ok ? (optIn ? "yes" : "no") : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "no") return null;

  return (
    <section
      aria-live="polite"
      className="mb-8 flex flex-col gap-4 rounded-2xl border border-line bg-ink-raised p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      {state === "yes" ? (
        <p className="flex items-center gap-3 text-paper">
          <Mail aria-hidden="true" className="size-5 shrink-0 text-ribbon" />
          Thanks. We&apos;ll email you when Bookmap gets something new. You can opt out any time.
        </p>
      ) : (
        <>
          <p className="flex items-start gap-3 text-paper sm:items-center">
            <Mail aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ribbon sm:mt-0" />
            <span>
              Want an email when Bookmap adds something new?{" "}
              <span className="text-mute">A few emails a year at most. No spam.</span>
              {state === "error" && <span className="block text-sm text-danger">That didn&apos;t save. Try again.</span>}
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => answer(true)} disabled={state === "saving"}>
              Yes, keep me posted
            </Button>
            <Button size="sm" variant="ghost" onClick={() => answer(false)} disabled={state === "saving"}>
              No thanks
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
