"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RemoveBook({ bookId, attempts }: { bookId: number; attempts: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
      router.push("/shelf");
      router.refresh();
    } catch {
      setBusy(false);
      setProblem("The book couldn't be removed. Try again.");
    }
  }

  if (!asking) {
    return (
      <Button variant="ghost" size="sm" className="px-0" onClick={() => setAsking(true)}>
        <Trash2 aria-hidden="true" /> Remove from shelf
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line-strong p-4" role="group" aria-label="Confirm removal">
      <p>
        Remove this book{attempts > 0 ? ` and its ${attempts === 1 ? "test" : `${attempts} tests`}` : ""} from your shelf? Shared links to its results
        stop working.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" onClick={remove} disabled={busy}>
          {busy ? "Removing…" : "Remove it"}
        </Button>
        <Button variant="outline" onClick={() => setAsking(false)} disabled={busy}>
          Keep it
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
