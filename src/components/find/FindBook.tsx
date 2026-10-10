"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, Upload, Waypoints, X } from "lucide-react";
import { AddBook } from "@/components/AddBook";
import { Cover } from "@/components/Cover";
import { ShelfRow } from "@/components/find/ShelfRow";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_QUERY_LENGTH, type BrowseLists, type CatalogItem } from "@/lib/catalog";
import { SearchError, browseBooks, mapBook, searchBooks } from "@/lib/catalog-client";
import { cn } from "@/lib/utils";

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string; items: CatalogItem[] | null }
  | { status: "done"; query: string; items: CatalogItem[] }
  | { status: "error"; query: string; message: string };

const DEBOUNCE_MS = 350;
const tidy = (q: string) => q.replace(/\s+/g, " ").trim();

/**
 * Finding a book to test on: search as the reader types, or pick from the shelves below. Only
 * books Bookmap can map are shown (free full text on Project Gutenberg), each mapped in one
 * click. Any other book can be added as a file or a link at the bottom of the page.
 */
export function FindBook({ initialQuery = "", lists: initialLists }: { initialQuery?: string; lists: BrowseLists | null }) {
  const router = useRouter();
  const inputId = useId();
  const statusId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [lists, setLists] = useState<BrowseLists | null>(initialLists);
  const [listsFailed, setListsFailed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const cache = useRef(new Map<string, CatalogItem[]>());
  const controller = useRef<AbortController | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

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

  // A "Map & test" from a shelf far down the page: bring the error into view.
  useEffect(() => {
    if (problem) alertRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [problem]);

  async function pick(item: CatalogItem) {
    if (pendingKey) return;
    setProblem(null);
    if (item.bookId !== null) {
      router.push(`/book/${item.bookId}`);
      return;
    }
    setPendingKey(item.key);
    try {
      const bookId = await mapBook(item.key);
      router.push(`/book/${bookId}`);
    } catch (err) {
      setPendingKey(null);
      setProblem(err instanceof Error ? err.message : "That book couldn't be added. Try again.");
    }
  }

  const q = tidy(query);
  const searching = q.length >= 2;
  const shown = search.status === "done" ? search.items : search.status === "loading" ? search.items : null;

  return (
    <div>
      <form
        role="search"
        className="max-w-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search free classics by title or author
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
            placeholder="A classic, by title or author"
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
              `${search.items.length === 1 ? "1 book" : `${search.items.length} books`} with free full text`
            )
          ) : (
            ""
          )}
        </p>
      </form>

      {problem && (
        <p ref={alertRef} role="alert" className="mt-4 max-w-3xl rounded-2xl border border-danger/50 bg-danger/[0.07] px-4 py-3">
          {problem}
        </p>
      )}

      {searching ? (
        <section aria-label="Search results" className="mt-4">
          {search.status === "error" ? (
            <Notice title={search.message} />
          ) : search.status === "done" && search.items.length === 0 ? (
            <NoMatch query={search.query} onTry={setQuery} />
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
                id="classics"
                title="Most read classics"
                intro="The most downloaded books on Project Gutenberg, free to map. One click maps the book and opens it, ready for a test."
                items={lists?.classics ?? null}
                ranked
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

function Notice({ title }: { title: string }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-line-strong bg-ink-raised/60 px-5 py-4">
      <p className="font-semibold">{title}</p>
      <a href="#upload" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
        <Upload aria-hidden="true" /> Upload a file
      </a>
    </div>
  );
}

const TRY = ["Pride and Prejudice", "Sherlock Holmes", "Charles Dickens"];

/** Nothing Bookmap can map: what it can map, a few classics to try, and the upload below. */
function NoMatch({ query, onTry }: { query: string; onTry: (query: string) => void }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-line-strong bg-ink-raised/60 px-5 py-4">
      <p className="font-semibold">No books with free full text match “{query}”.</p>
      <p className="mt-1 text-mute">
        Bookmap can map books whose full text is free: public-domain classics from Project Gutenberg. Try a classic:
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {TRY.map((t) => (
          <li key={t}>
            <Button variant="outline" size="sm" onClick={() => onTry(t)}>
              {t}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-mute">
        You can still{" "}
        <a href="#upload" className="font-semibold text-paper underline decoration-line-strong underline-offset-4 hover:decoration-ribbon">
          upload a file you have
        </a>{" "}
        below.
      </p>
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
        {item.bookId !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> On your shelf
          </p>
        )}
        <div className="mt-3">
          {item.bookId !== null ? (
            <Link href={`/book/${item.bookId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open the book
            </Link>
          ) : (
            <Button size="sm" className="px-4" onClick={() => onPick(item)} disabled={disabled} aria-busy={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Waypoints aria-hidden="true" />}
              {pending ? "Opening…" : "Map & test"}
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
