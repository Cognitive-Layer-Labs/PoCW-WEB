"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link2, Loader2 } from "lucide-react";
import { BookmapMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTR, EngineError, addLink, checkFile, checkUrl, uploadBook } from "@/lib/engine";
import { cn } from "@/lib/utils";

type Phase = { name: "idle" } | { name: "uploading"; label: string; progress: number } | { name: "starting"; label: string };

export function AddBook() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const problemId = useId();
  const urlId = useId();
  const busy = phase.name !== "idle";

  async function sendFile(file: File | undefined) {
    if (!file || busy) return;
    const checked = checkFile(file);
    if ("error" in checked) {
      setProblem(checked.error);
      return;
    }
    setProblem(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "uploading", label: file.name, progress: 0 });
    try {
      const status = await uploadBook(
        file,
        checked.contentType,
        (progress) => setPhase(progress >= 1 ? { name: "starting", label: file.name } : { name: "uploading", label: file.name, progress }),
        controller.signal
      );
      setPhase({ name: "starting", label: file.name });
      router.push(`/book/${status.bookId}`);
    } catch (err) {
      setPhase({ name: "idle" });
      if (err instanceof EngineError && err.code === "ABORTED") return;
      setProblem(err instanceof Error ? err.message : "The upload failed. Try again.");
    } finally {
      abortRef.current = null;
    }
  }

  async function sendLink() {
    if (busy) return;
    const checked = checkUrl(url);
    if ("error" in checked) {
      setProblem(checked.error);
      return;
    }
    setProblem(null);
    setPhase({ name: "starting", label: checked.url });
    try {
      const status = await addLink(checked.url);
      router.push(`/book/${status.bookId}`);
    } catch (err) {
      setPhase({ name: "idle" });
      setProblem(err instanceof Error ? err.message : "That link couldn't be added. Try again.");
    }
  }

  if (phase.name !== "idle") {
    const pct = phase.name === "uploading" ? Math.round(phase.progress * 100) : 100;
    return (
      <div className="rounded-[1.75rem] border-2 border-ribbon/60 bg-ink-raised px-5 py-7 sm:px-8" aria-live="polite">
        <p className="font-serif text-2xl font-semibold">{phase.name === "uploading" ? "Uploading your book…" : "Opening the book…"}</p>
        <p className="mt-1 truncate text-mute" title={phase.label}>
          {phase.label}
        </p>
        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-ribbon transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-mute">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {phase.name === "uploading" ? `${pct}% sent` : "Handing it to the mapper"}
          </span>
          {phase.name === "uploading" && (
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="button"
        tabIndex={0}
        aria-describedby={problem ? problemId : undefined}
        aria-label="Add a book file: drop a PDF, EPUB, .txt or .md file here, or press Enter to choose one"
        data-testid="dropzone"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          void sendFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group flex min-h-[15rem] cursor-pointer flex-col items-center justify-center gap-4 rounded-[1.75rem] border-2 border-dashed px-6 py-10 text-center transition-colors sm:min-h-[18rem]",
          dragging ? "border-ribbon bg-ribbon/[0.08]" : "border-line-strong bg-ink-raised/60 hover:border-ribbon/70"
        )}
      >
        <BookmapMark className={cn("h-14 w-14 transition-transform", dragging && "scale-110")} />
        <div>
          <p className="font-serif text-2xl font-semibold leading-tight text-paper sm:text-[1.75rem]">
            {dragging ? (
              "Let go to add it"
            ) : (
              <>
                <span className="[@media(pointer:coarse)]:hidden">Drop your book here</span>
                <span className="hidden [@media(pointer:coarse)]:inline">Choose a book file</span>
              </>
            )}
          </p>
          <p className="mt-2 text-mute">PDF, EPUB, TXT or Markdown, up to 40 MB.</p>
        </div>
        <span className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold text-paper group-hover:border-ribbon">
          <FileUp className="h-4 w-4" aria-hidden="true" /> Choose a file
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="file-input"
          onChange={(e) => {
            void sendFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendLink();
        }}
      >
        <label htmlFor={urlId} className="font-semibold text-paper">
          Or paste a link
        </label>
        <p className="-mt-1 text-sm text-mute">A link to a PDF or EPUB file, or to a web page with the text.</p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden="true" />
            <input
              id={urlId}
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="h-12 w-full rounded-full border border-line-strong bg-ink-sunk pl-11 pr-4 text-paper placeholder:text-mute/70 focus:border-ribbon focus:outline-none"
            />
          </div>
          <Button type="submit" size="lg" className="h-12">
            Add from link
          </Button>
        </div>
      </form>

      <p id={problemId} role="alert" className={cn("text-danger", !problem && "sr-only")}>
        {problem ?? ""}
      </p>

      <p className="text-sm text-mute">Only add books you have the right to use. Your shelf is private to you.</p>
    </div>
  );
}
