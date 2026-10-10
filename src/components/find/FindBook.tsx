"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Search, Upload, Waypoints, X } from "lucide-react";
import { AddBook } from "@/components/AddBook";
import { Cover } from "@/components/Cover";
import { ShelfRow } from "@/components/find/ShelfRow";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_QUERY_LENGTH, type BrowseLists, type CatalogItem } from "@/lib/catalog";
import { SearchError, browseBooks, mapBook, searchBooks } from "@/lib/catalog-client";
import { EngineError } from "@/lib/engine";
import { cn } from "@/lib/utils";

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string; items: CatalogItem[] | null }
  | { status: "done"; query: string; items: CatalogItem[] }
  | { status: "error"; query: string; message: string };

const DEBOUNCE_MS = 350;
const tidy = (q: string) => q.replace(/\s+/g, " ").trim();

/**
 * Finding the book a reader has read: search Open Library as they type, or pick from the
 * shelves below. A book with free full text (Project Gutenberg) is mapped in one click; any
 * other book opens the upload, bound to that book. A file or link can always be added directly.
 */
export function FindBook({ initialQuery = "", lists: initialLists }: { initialQuery?: string; lists: BrowseLists | null }) {
  const router = useRouter();
  const inputId = useId();
  const statusId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [lists, setLists] = useState<BrowseLists | null>(initialLists);
  const [listsFailed, setListsFailed] = useState(false);
  const [bound, setBound] = useState<CatalogItem | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const cache = useRef(new Map<string, CatalogItem[]>());
  const controller = useRef<AbortController | null>(null);
  const boundHeading = useRef<HTMLHeadingElement>(null);
  const top = useRef<HTMLDivElement>(null);

  // Lists not cached on the server yet (first minutes after a deploy): fetch them.
  useEffect(() => {
    if (initialLists) return;
    let cancelled = false;
    browseBooks()
      .then((l) => !cancelled && setLists(l))
      .catch(() => !cancelled && setListsFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initialLists]);

  async function run(raw: string) {
    const q = tidy(raw).slice(0, MAX_QUERY_LENGTH);
    controller.current?.abort();
    if (q.length < 2) {
      setSearch({ status: "idle" });
      return;
    }
    const hit = cache.current.get(q.toLowerCase());
    if (hit) {
      setSearch({ status: "done", query: q, items: hit });
      return;
    }
    const ctrl = new AbortController();
    controller.current = ctrl;
    setSearch((s) => ({ status: "loading", query: q, items: s.status === "done" || s.status === "loading" ? s.items : null }));
    try {
      const items = await searchBooks(q, ctrl.signal);
      cache.current.set(q.toLowerCase(), items);
      if (!ctrl.signal.aborted) setSearch({ status: "done", query: q, items });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setSearch({
        status: "error",
        query: q,
        message: err instanceof SearchError ? err.message : "Search is unavailable right now. You can still upload a file.",
      });
    }
  }

  // Search as the reader types; keep the query in the URL so Back returns to the same results.
  useEffect(() => {
    const timer = setTimeout(() => void run(query), tidy(query) === tidy(initialQuery) && search.status === "idle" ? 0 : DEBOUNCE_MS);
    const url = new URL(window.location.href);
    if (tidy(query)) url.searchParams.set("q", tidy(query));
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on query changes only
  }, [query]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (bound) {
      top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      boundHeading.current?.focus({ preventScroll: true });
    }
  }, [bound]);

  async function pick(item: CatalogItem) {
    if (pendingKey) return;
    setProblem(null);
    if (item.bookId !== null) {
      router.push(`/book/${item.bookId}`);
      return;
    }
    if (!item.available) {
      setBound(item);
      return;
    }
    setPendingKey(item.key);
    try {
      const bookId = await mapBook(item.key);
      router.push(`/book/${bookId}`);
    } catch (err) {
      setPendingKey(null);
      if (err instanceof EngineError && err.code === "NOT_AVAILABLE") {
        setBound({ ...item, available: false });
        return;
      }
      setProblem(err instanceof Error ? err.message : "That book couldn't be added. Try again.");
    }
  }

  if (bound) {
    return (
      <div ref={top} className="max-w-3xl scroll-mt-6">
        <button
          type="button"
          onClick={() => setBound(null)}
          className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-mute hover:text-paper"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Choose a different book
        </button>
        <section aria-labelledby="copy-heading" className="mt-4">
          <div className="flex items-start gap-5">
            <Cover title={bound.title} author={bound.author} src={bound.coverUrl} size="md" />
            <div className="min-w-0 pt-1">
              <p className="text-mute">Upload your copy of</p>
              <h2 id="copy-heading" ref={boundHeading} tabIndex={-1} className="mt-0.5 break-words text-[1.75rem] font-semibold leading-tight outline-none sm:text-[2.1rem]">
                {bound.title}
              </h2>
              {(bound.author || bound.year) && (
                <p className="mt-1 text-mute">{[bound.author, bound.year].filter(Boolean).join(", ")}</p>
              )}
            </div>
          </div>
          <p className="mt-6 max-w-[38rem] text-lg">
            Bookmap can only use a copy you own. Drop the PDF or EPUB of <span className="book-title">{bound.title}</span> here.
          </p>
          <div className="mt-5">
            <AddBook book={{ key: bound.key, title: bound.title }} />
          </div>
        </section>
      </div>
    );
  }

  const q = tidy(query);
  const searching = q.length >= 2;
  const shown = search.status === "done" ? search.items : search.status === "loading" ? search.items : null;

  return (
    <div ref={top}>
      <form
        role="search"
        className="max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search for a book by title or author
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-mute" aria-hidden="true" />
          <input
            id={inputId}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={MAX_QUERY_LENGTH}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            aria-describedby={statusId}
            placeholder="Title or author"
            className="h-14 w-full rounded-full border border-line-strong bg-ink-sunk pl-14 pr-14 text-lg text-paper placeholder:text-mute/70 focus:border-ribbon focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear the search"
              className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-mute hover:text-paper"
            >
              {search.status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <X className="h-5 w-5" aria-hidden="true" />}
            </button>
          )}
        </div>
        <p id={statusId} aria-live="polite" className="mt-3 min-h-[1.6em] px-1 text-sm text-mute">
          {!searching ? (
            <>
              Have the file already?{" "}
              <a href="#upload" className="font-semibold text-paper underline decoration-line-strong underline-offset-4 hover:decoration-ribbon">
                Upload it
              </a>
            </>
          ) : search.status === "loading" ? (
            "Searching…"
          ) : search.status === "done" ? (
            search.items.length === 0 ? (
              ""
            ) : (
              `${search.items.length === 1 ? "1 book" : `${search.items.length} books`} from Open Library`
            )
          ) : (
            ""
          )}
        </p>
      </form>

      {problem && (
        <p role="alert" className="mt-4 max-w-3xl rounded-2xl border border-danger/50 bg-danger/[0.07] px-4 py-3">
          {problem}
        </p>
      )}

      {searching ? (
        <section aria-label="Search results" className="mt-4">
          {search.status === "error" ? (
            <Notice title={search.message} />
          ) : search.status === "done" && search.items.length === 0 ? (
            <Notice title={`No English books match “${search.query}”.`} line="Check the spelling or try the author's name. If you have the file, you can upload it." />
          ) : shown ? (
            <ul className={cn("grid gap-x-10 md:grid-cols-2", search.status === "loading" && "opacity-60 transition-opacity")}>
              {shown.map((item) => (
                <Result key={item.key} item={item} pending={pendingKey === item.key} disabled={!!pendingKey} onPick={pick} />
              ))}
            </ul>
          ) : (
            <ResultSkeleton />
          )}
        </section>
      ) : (
        <div className="mt-10">
          {listsFailed ? null : (
            <>
              <ShelfRow
                id="most-read"
                title="Most read in English"
                intro="The books Open Library readers have marked as read most often. Most are in copyright, so you upload your own copy."
                items={lists?.mostRead ?? null}
                ranked
                pendingKey={pendingKey}
                onPick={pick}
              />
              <ShelfRow
                id="classics"
                title="Classics you can test right away"
                intro="Public-domain books from Project Gutenberg. One click maps the book and opens it, ready for a test."
                items={lists?.classics ?? null}
                pendingKey={pendingKey}
                onPick={pick}
              />
              {lists && lists.popular.length > 0 && (
                <ShelfRow
                  id="popular"
                  title="Popular on Bookmap"
                  intro="Free classics other readers have mapped. They open instantly."
                  items={lists.popular}
                  pendingKey={pendingKey}
                  onPick={pick}
                />
              )}
            </>
          )}
        </div>
      )}

      <section id="upload" aria-labelledby="upload-heading" className="mt-16 max-w-3xl scroll-mt-6 border-t border-line pt-10">
        <h2 id="upload-heading" className="text-[1.6rem] font-semibold leading-tight sm:text-[1.85rem]">
          Have the file?
        </h2>
        <p className="mb-6 mt-1 text-mute">Add any book you have as a file or a link, whether or not it&apos;s in the search.</p>
        <AddBook />
      </section>
    </div>
  );
}

function Notice({ title, line }: { title: string; line?: string }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-line-strong bg-ink-raised/60 px-5 py-4">
      <p className="font-semibold">{title}</p>
      {line && <p className="mt-1 text-mute">{line}</p>}
      <a href="#upload" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
        <Upload aria-hidden="true" /> Upload a file
      </a>
    </div>
  );
}

function Result({ item, pending, disabled, onPick }: { item: CatalogItem; pending: boolean; disabled: boolean; onPick: (item: CatalogItem) => void }) {
  const meta = [item.author, item.year].filter(Boolean).join(", ");
  return (
    <li className="flex gap-4 border-b border-line py-5 sm:gap-5">
      <Cover title={item.title} author={item.author} src={item.coverUrl} size="md" />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-3 break-words text-[1.2rem] font-semibold leading-snug">{item.title}</h3>
        {meta && <p className="mt-0.5 text-mute">{meta}</p>}
        <p className={cn("mt-2 flex items-center gap-1.5 text-sm font-semibold", item.available ? "text-ribbon-soft" : "text-mute")}>
          {item.bookId !== null ? (
            <>
              <Check className="h-3.5 w-3.5 text-paper" aria-hidden="true" /> <span className="text-paper">On your shelf</span>
            </>
          ) : item.available ? (
            <>
              <Waypoints className="h-3.5 w-3.5 text-ribbon" aria-hidden="true" /> Full text available
            </>
          ) : (
            "No free full text"
          )}
        </p>
        <div className="mt-3">
          {item.bookId !== null ? (
            <Link href={`/book/${item.bookId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open the book
            </Link>
          ) : item.available ? (
            <Button size="sm" className="px-4" onClick={() => onPick(item)} disabled={disabled} aria-busy={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {pending ? "Opening…" : "Map & test"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="px-4" onClick={() => onPick(item)} disabled={disabled}>
              <Upload aria-hidden="true" /> Upload your copy to test
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function ResultSkeleton() {
  return (
    <ul className="grid gap-x-10 md:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex gap-5 border-b border-line py-5">
          <div className="h-[8.25rem] w-[5.5rem] animate-pulse rounded-[3px] bg-ink-raised" />
          <div className="flex-1 pt-1">
            <div className="h-5 w-3/4 rounded bg-ink-raised" />
            <div className="mt-2 h-4 w-1/2 rounded bg-ink-raised" />
            <div className="mt-5 h-9 w-32 rounded-full bg-ink-raised" />
          </div>
        </li>
      ))}
    </ul>
  );
}
