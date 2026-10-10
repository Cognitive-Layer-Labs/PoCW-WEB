import { cn } from "@/lib/utils";

/**
 * A generated cloth cover for a book (we never have the real one). The cloth
 * color comes from the title, so a book always looks the same. A ribbon hangs
 * from books the reader has tested themselves on.
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
  sm: { box: "w-12 h-[4.5rem]", title: "", author: "" },
  md: { box: "w-[5.5rem] h-[8.25rem]", title: "text-[0.7rem] leading-[1.15]", author: "text-[0.55rem]" },
  lg: { box: "w-36 h-[13.5rem] sm:w-44 sm:h-[16.5rem]", title: "text-[1rem] leading-[1.15] sm:text-[1.2rem]", author: "text-[0.7rem] sm:text-[0.8rem]" },
} as const;

export function Cover({
  title,
  author,
  size = "md",
  ribbon = false,
  className,
}: {
  title: string;
  author?: string | null;
  size?: keyof typeof SIZES;
  ribbon?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div className={cn("relative shrink-0", s.box, className)} aria-hidden="true">
      <div
        className="absolute inset-0 flex flex-col overflow-hidden rounded-[3px] rounded-r-[5px] shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_8px_18px_-10px_rgba(0,0,0,0.7)]"
        style={{ background: clothFor(title) }}
      >
        {/* spine fold */}
        <span className="absolute inset-y-0 left-[7%] w-px bg-black/25" />
        <span className="absolute inset-y-0 left-[calc(7%+1px)] w-px bg-white/10" />
        {size !== "sm" && (
          <span className="relative mx-[14%] mt-[16%] flex flex-col gap-1.5 border-t border-white/25 pt-2">
            <span className={cn("line-clamp-4 break-words font-serif font-semibold text-paper", s.title)}>{title}</span>
            {author && <span className={cn("line-clamp-2 font-sans text-paper/70", s.author)}>{author}</span>}
          </span>
        )}
        {size === "sm" && <span className="m-auto font-serif text-lg font-semibold text-paper/85">{title.trim().charAt(0).toUpperCase()}</span>}
      </div>
      {ribbon && (
        <span
          className={cn(
            "absolute right-[22%] top-0 bg-ribbon",
            size === "sm" ? "-bottom-1.5 w-1.5" : size === "md" ? "-bottom-2.5 w-2" : "-bottom-4 w-3"
          )}
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%)" }}
        />
      )}
    </div>
  );
}
