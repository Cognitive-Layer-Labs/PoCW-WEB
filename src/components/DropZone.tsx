"use client";

import { useId, useRef, useState } from "react";
import { FileUp, Link2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Constellation } from "@/components/Constellation";
import { ACCEPT_ATTR, MAX_UPLOAD_BYTES, checkFile, checkUrl } from "@/lib/engine";
import { cn } from "@/lib/utils";

export type Submission =
  | { kind: "file"; file: File; contentType: string; label: string }
  | { kind: "text"; text: string; label: string }
  | { kind: "url"; url: string; label: string };

const MIN_TEXT_CHARS = 200;

export function DropZone({ onSubmit, disabled }: { onSubmit: (s: Submission) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "text" | "url">("none");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const problemId = useId();
  const textId = useId();
  const urlId = useId();

  function takeFile(file: File | undefined) {
    if (!file || disabled) return;
    const checked = checkFile(file);
    if ("error" in checked) {
      setProblem(checked.error);
      return;
    }
    setProblem(null);
    onSubmit({ kind: "file", file, contentType: checked.contentType, label: file.name });
  }

  function submitText() {
    const value = text.trim();
    if (value.length < MIN_TEXT_CHARS) {
      setProblem(`Paste at least ${MIN_TEXT_CHARS} characters so there's something to build a graph from.`);
      return;
    }
    if (new Blob([value]).size > MAX_UPLOAD_BYTES) {
      setProblem("That text is larger than 10 MB.");
      return;
    }
    setProblem(null);
    const firstLine = value.split("\n")[0].slice(0, 60);
    onSubmit({ kind: "text", text: value, label: firstLine || "Pasted text" });
  }

  function submitUrl() {
    const checked = checkUrl(url);
    if ("error" in checked) {
      setProblem(checked.error);
      return;
    }
    setProblem(null);
    onSubmit({ kind: "url", url: checked.url, label: checked.url });
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={problem ? problemId : undefined}
        aria-label="Upload a document: drop a PDF, .txt or .md file here, or press Enter to choose one"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
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
          e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          takeFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group relative flex min-h-[19rem] cursor-pointer flex-col items-center justify-end overflow-hidden rounded-[28px] border-2 border-dashed px-6 pb-7 pt-4 text-center transition-colors sm:min-h-[22rem]",
          dragging ? "border-magenta bg-magenta/[0.07]" : "border-line-strong bg-ink-raised/60 hover:border-magenta/70",
          disabled && "cursor-progress opacity-70"
        )}
      >
        <Constellation
          state={dragging ? "armed" : "idle"}
          className="pointer-events-none absolute inset-x-6 top-5 h-[58%] w-[calc(100%-3rem)] group-hover:[&_line]:[stroke:#7d5f8f] group-focus-visible:[&_line]:[stroke-dashoffset:0]"
        />
        <div className="relative flex flex-col items-center gap-2">
          <p className="font-display text-2xl font-semibold leading-tight text-paper sm:text-[1.7rem]">
            {dragging ? "Let go to map it" : "Drop a document here"}
          </p>
          <p className="text-mute">
            PDF, .txt or .md, up to 10 MB.{" "}
            <span className="text-magenta-soft underline decoration-magenta/50 underline-offset-4 group-hover:decoration-magenta">
              Choose a file
            </span>
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-mute">
        <span className="mr-1">No file at hand?</span>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={mode === "text"}
          aria-controls={textId}
          onClick={() => setMode(mode === "text" ? "none" : "text")}
          className={cn(mode === "text" && "border-magenta text-magenta-soft")}
        >
          <Type aria-hidden="true" /> Paste text
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={mode === "url"}
          aria-controls={urlId}
          onClick={() => setMode(mode === "url" ? "none" : "url")}
          className={cn(mode === "url" && "border-magenta text-magenta-soft")}
        >
          <Link2 aria-hidden="true" /> Paste a link
        </Button>
      </div>

      {mode === "text" && (
        <form
          id={textId}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitText();
          }}
        >
          <label htmlFor={`${textId}-area`} className="sr-only">
            Text to build a knowledge graph from
          </label>
          <textarea
            id={`${textId}-area`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste an article, lecture notes or a chapter…"
            className="w-full resize-y rounded-2xl border border-line-strong bg-ink-sunk px-4 py-3 text-paper placeholder:text-mute/70 focus:border-magenta focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-mute">{text.trim().length.toLocaleString()} characters</span>
            <Button type="submit" disabled={disabled}>
              <FileUp aria-hidden="true" /> Map this text
            </Button>
          </div>
        </form>
      )}

      {mode === "url" && (
        <form
          id={urlId}
          noValidate
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitUrl();
          }}
        >
          <label htmlFor={`${urlId}-input`} className="sr-only">
            Link to a web page or YouTube video
          </label>
          <input
            id={`${urlId}-input`}
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… (articles and YouTube videos work)"
            className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ink-sunk px-4 text-paper placeholder:text-mute/70 focus:border-magenta focus:outline-none"
          />
          <Button type="submit" disabled={disabled}>
            Map this link
          </Button>
        </form>
      )}

      <p id={problemId} role="alert" className={cn("text-sm text-[#FF8FA3]", !problem && "sr-only")}>
        {problem ?? ""}
      </p>
    </div>
  );
}
