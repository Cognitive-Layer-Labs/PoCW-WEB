"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A book cover. Books picked from the catalog have a real one (Open Library or Project
 * Gutenberg); the rest get a generated cloth cover whose color comes from the title, so a book
 * always looks the same. The cloth is also what shows while a real cover loads or if it fails.
 * A ribbon hangs from books the reader has tested themselves on.
 */

const CLOTHS = ["#7A2E3A", "#2F5D50", "#34477A", "#8A5A24", "#5E3A6E", "#44546A", "#2D6470", "#8A4B2C"];

function clothFor(title: string): string {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CLOTHS[Math.abs(h) % CLOTHS.length];
}

const SIZES = {
  xs: { box: "w-8 h-12", title: "", author: "" },
  sm: { box: "w-12 h-[4.5rem]", title: "", author: "" },
  md: { box: "w-[5.5rem] h-[8.25rem]", title: "text-[0.7rem] leading-[1.15]", author: "text-[0.55rem]" },
  shelf: {
    box: "w-[7.25rem] h-[10.875rem] sm:w-[8.25rem] sm:h-[12.375rem]",
    title: "text-[0.8rem] leading-[1.15] sm:text-[0.9rem]",
    author: "text-[0.6rem] sm:text-[0.65rem]",
  },
  lg: { box: "w-36 h-[13.5rem] sm:w-44 sm:h-[16.5rem]", title: "text-[1rem] leading-[1.15] sm:text-[1.2rem]", author: "text-[0.7rem] sm:text-[0.8rem]" },
} as const;

const SMALL = new Set(["xs", "sm"]);

export function Cover({
  title,
  author,
  src,
  size = "md",
  ribbon = false,
  className,
}: {
  title: string;
  author?: string | null;
  /** A real cover image, when there is one. */
  src?: string | null;
  size?: keyof typeof SIZES;
  ribbon?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const img = useRef<HTMLImageElement>(null);
  const [photo, setPhoto] = useState<"loading" | "shown" | "failed">(src ? "loading" : "failed");

  useEffect(() => {
    setPhoto(src ? "loading" : "failed");
    // An image that failed before hydration never fires onError for React: check it here.
    const el = img.current;
    if (src && el?.complete) setPhoto(el.naturalWidth > 1 ? "shown" : "failed");
  }, [src]);

  const lettering = photo === "failed";
  return (
    <div className={cn("relative shrink-0", s.box, className)} aria-hidden="true">
      <div
        className="absolute inset-0 flex flex-col overflow-hidden rounded-[3px] rounded-r-[5px] shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_8px_18px_-10px_rgba(0,0,0,0.7)]"
        style={{ background: clothFor(title) }}
      >
        {lettering && !SMALL.has(size) && (
          <span className="relative mx-[14%] mt-[16%] flex flex-col gap-1.5 border-t border-white/25 pt-2">
            <span className={cn("line-clamp-4 break-words font-serif font-semibold text-paper", s.title)}>{title}</span>
            {author && <span className={cn("line-clamp-2 font-sans text-paper/70", s.author)}>{author}</span>}
          </span>
        )}
        {lettering && size === "sm" && <span className="m-auto font-serif text-lg font-semibold text-paper/85">{title.trim().charAt(0).toUpperCase()}</span>}
        {src && photo !== "failed" && (
          // Covers come from Open Library and Project Gutenberg (see img-src in next.config.ts).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={img}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={(e) => setPhoto(e.currentTarget.naturalWidth > 1 ? "shown" : "failed")}
            onError={() => setPhoto("failed")}
            className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", photo === "shown" ? "opacity-100" : "opacity-0")}
          />
        )}
        {/* spine fold, over the photo too: it reads as a bound book either way */}
        <span className="absolute inset-y-0 left-[7%] w-px bg-black/25" />
        <span className="absolute inset-y-0 left-[calc(7%+1px)] w-px bg-white/10" />
      </div>
      {ribbon && (
        // Across a cloth cover; only the tail below the pages on a real cover, so it doesn't stripe the art.
        <span
          className={cn(
            "absolute right-[22%] bg-ribbon",
            src && photo !== "failed" ? "top-[calc(100%-2px)]" : "top-0",
            SMALL.has(size) ? "-bottom-1.5 w-1.5" : size === "lg" ? "-bottom-4 w-3" : "-bottom-2.5 w-2"
          )}
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%)" }}
        />
      )}
    </div>
  );
}
