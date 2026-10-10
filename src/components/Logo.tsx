import { cn } from "@/lib/utils";

/**
 * The Bookmap mark: an open book whose right page has become a small map of
 * connected ideas. Paper page, ribbon page, ink constellation.
 */
export function BookmapMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d="M15 11C11.6 8.2 7.6 6.8 3 6.6V23.8C7.6 24 11.6 25.2 15 28Z" fill="#F6EFF3" />
      <path d="M17 11C20.4 8.2 24.4 6.8 29 6.6V23.8C24.4 24 20.4 25.2 17 28Z" fill="#F0579B" />
      <path
        d="M20.4 14.4L26 11M20.4 14.4L24.6 19.6M26 11L24.6 19.6M24.6 19.6L20.6 23.6"
        stroke="#1B1026"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <g fill="#1B1026">
        <circle cx="20.4" cy="14.4" r="1.7" />
        <circle cx="26" cy="11" r="1.7" />
        <circle cx="24.6" cy="19.6" r="1.7" />
        <circle cx="20.6" cy="23.6" r="1.7" />
      </g>
    </svg>
  );
}

/** Mark + wordmark, for headers. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BookmapMark className="h-8 w-8 shrink-0" />
      <span className={cn("font-serif text-[1.3rem] font-semibold leading-none tracking-[-0.01em] text-paper", compact && "max-[379px]:sr-only")}>
        Bookmap
      </span>
    </span>
  );
}

/** The mark as an SVG string (icons, Open Graph images). */
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M15 11C11.6 8.2 7.6 6.8 3 6.6V23.8C7.6 24 11.6 25.2 15 28Z" fill="#F6EFF3"/><path d="M17 11C20.4 8.2 24.4 6.8 29 6.6V23.8C24.4 24 20.4 25.2 17 28Z" fill="#F0579B"/><path d="M20.4 14.4L26 11M20.4 14.4L24.6 19.6M26 11L24.6 19.6M24.6 19.6L20.6 23.6" stroke="#1B1026" stroke-width="1.5" stroke-linecap="round" fill="none"/><g fill="#1B1026"><circle cx="20.4" cy="14.4" r="1.7"/><circle cx="26" cy="11" r="1.7"/><circle cx="24.6" cy="19.6" r="1.7"/><circle cx="20.6" cy="23.6" r="1.7"/></g></svg>`;
