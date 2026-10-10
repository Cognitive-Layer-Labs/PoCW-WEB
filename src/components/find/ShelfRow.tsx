"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Loader2, Upload, Waypoints } from "lucide-react";
import { Cover } from "@/components/Cover";
import type { CatalogItem } from "@/lib/catalog";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A shelf of books: covers standing on one board, scrolled sideways (swipe on phones, the arrow
 * buttons with a mouse). Ranked shelves set the position before each cover.
 */
export function ShelfRow({
  id,
  title,
  intro,
  items,
  ranked = false,
  pendingKey,
  onPick,
}: {
  id: string;
  title: string;
  intro: string;
  items: CatalogItem[] | null;
  ranked?: boolean;
  pendingKey: string | null;
  onPick: (item: CatalogItem) => void;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section aria-labelledby={id} className="mt-14 first:mt-0">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="text-[1.6rem] font-semibold leading-tight sm:text-[1.85rem]">
            {title}
          </h2>
          <p className="mt-1 max-w-[42rem] text-mute">{intro}</p>
        </div>
        {items && items.length > 0 && !(edge.start && edge.end) && (
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={edge.start}
              aria-label={`Scroll ${title} back`}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-paper transition-colors hover:border-ribbon disabled:opacity-30 disabled:hover:border-line-strong"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={edge.end}
              aria-label={`Scroll ${title} on`}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-paper transition-colors hover:border-ribbon disabled:opacity-30 disabled:hover:border-line-strong"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="-mx-4 sm:-mx-8">
        <ul
          ref={scroller}
          className="relative flex snap-x snap-mandatory overflow-x-auto scroll-px-2 px-2 pb-2 pt-6 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
          aria-busy={items === null}
        >
          {items === null
            ? Array.from({ length: 7 }, (_, i) => (
                <li key={i} className="shrink-0 snap-start px-2.5" aria-hidden="true">
                  <div className="border-b border-line-strong">
                    <div className="h-[10.875rem] w-[7.25rem] animate-pulse rounded-[3px] bg-ink-raised sm:h-[12.375rem] sm:w-[8.25rem]" />
                  </div>
                  <div className="mt-3 h-4 w-24 rounded bg-ink-raised" />
                  <div className="mt-2 h-3 w-16 rounded bg-ink-raised" />
                </li>
              ))
            : items.map((item, i) => (
                <li key={item.key} className="shrink-0 snap-start px-2.5">
                  <ShelfBook item={item} rank={ranked ? i + 1 : undefined} pending={pendingKey === item.key} disabled={!!pendingKey} onPick={onPick} />
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}

function ShelfBook({
  item,
  rank,
  pending,
  disabled,
  onPick,
}: {
  item: CatalogItem;
  rank?: number;
  pending: boolean;
  disabled: boolean;
  onPick: (item: CatalogItem) => void;
}) {
  const body = (
    <>
      <span className="flex items-end border-b border-line-strong">
        {rank !== undefined && (
          <span className="-mb-[0.18em] w-9 shrink-0 font-serif text-[2.6rem] font-semibold italic leading-none text-line-strong sm:w-10 sm:text-[2.9rem]" aria-hidden="true">
            {rank}
          </span>
        )}
        <Cover
          title={item.title}
          author={item.author}
          src={item.coverUrl}
          size="shelf"
          className="transition-transform duration-200 group-hover:-translate-y-1.5"
        />
      </span>
      <span className="block h-2 bg-gradient-to-b from-black/30 to-transparent" aria-hidden="true" />
      <span className={cn("block", rank !== undefined ? "w-[9.5rem] sm:w-[10.75rem]" : "w-[7.25rem] sm:w-[8.25rem]")}>
        {rank !== undefined && <span className="sr-only">Number {rank}: </span>}
        <span className="mt-1 line-clamp-2 font-serif font-semibold leading-snug text-paper group-hover:text-ribbon-soft">{item.title}</span>
        {item.author && <span className="mt-0.5 block truncate text-sm text-mute">{item.author}</span>}
        <span className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ribbon-soft" aria-hidden="true" />
              <span className="text-ribbon-soft">Opening…</span>
            </>
          ) : item.bookId !== null ? (
            <>
              <Check className="h-3.5 w-3.5 text-paper" aria-hidden="true" />
              <span>On your shelf</span>
            </>
          ) : item.available ? (
            <>
              <Waypoints className="h-3.5 w-3.5 text-ribbon" aria-hidden="true" />
              <span className="text-ribbon-soft">Map &amp; test</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 text-mute" aria-hidden="true" />
              <span className="text-mute">Upload your copy</span>
            </>
          )}
        </span>
        {item.readers !== undefined && <span className="mt-0.5 block text-sm text-mute">{plural(item.readers, "reader")}</span>}
      </span>
    </>
  );

  const className = "group block rounded-lg pb-2 text-left outline-offset-4";
  if (item.bookId !== null) {
    return (
      <Link href={`/book/${item.bookId}`} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={cn(className, "disabled:cursor-wait")} onClick={() => onPick(item)} disabled={disabled} aria-busy={pending}>
      {body}
    </button>
  );
}
