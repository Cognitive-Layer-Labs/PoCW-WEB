"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, List, Loader2, Search, X } from "lucide-react";
import { BLOOM_COLORS, BLOOM_LEVELS, OUTCOME_COLORS, OUTCOME_LABELS, bloomColor, toBloom, type Outcome } from "@/lib/bloom";
import { getGraph, type KnowledgeGraph } from "@/lib/engine";
import { cn } from "@/lib/utils";
import type { CanvasNode, ColorMode } from "./GraphCanvas";

const GraphCanvas = dynamic(() => import("./GraphCanvas"), {
  ssr: false,
  loading: () => <Centered>Drawing the map…</Centered>,
});

export interface MapOutcome {
  id: string;
  label: string;
  asked: number;
  correct: number;
  mastered: boolean;
}

interface Props {
  bookId: number;
  knowledgeId: string;
  title: string;
  outcomes: MapOutcome[] | null;
  /** e.g. "your test of 3 Oct (74)" */
  outcomeSource: string | null;
}

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; graph: KnowledgeGraph };

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center gap-3 p-6 text-center text-mute">{children}</div>;
}

function outcomeFor(outcome: MapOutcome | undefined): Outcome {
  if (!outcome || outcome.asked <= 0) return "untested";
  return outcome.mastered ? "mastered" : "attempted";
}

function importanceWord(weight: number): string {
  if (weight >= 0.7) return "Central idea";
  if (weight >= 0.4) return "Supporting idea";
  return "Detail";
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

const SHEET_PEEK = 76; // px of the bottom sheet that stays visible on phones

export function MapView({ bookId, knowledgeId, title, outcomes, outcomeSource }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const hasOutcomes = !!outcomes && outcomes.some((o) => o.asked > 0);
  const [colorMode, setColorMode] = useState<ColorMode>(hasOutcomes ? "outcome" : "bloom");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focus, setFocus] = useState<{ id: string; nonce: number; offsetY?: number } | null>(null);
  const desktop = useIsDesktop();
  const bodyRef = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);
  const mode: ColorMode = hasOutcomes ? colorMode : "bloom";

  const fetchGraph = useCallback(() => {
    setLoad({ status: "loading" });
    getGraph(knowledgeId)
      .then((graph) => setLoad({ status: "ready", graph }))
      .catch((err) => setLoad({ status: "error", message: err instanceof Error ? err.message : "The map couldn't be loaded." }));
  }, [knowledgeId]);
  useEffect(() => fetchGraph(), [fetchGraph]);

  const graph = load.status === "ready" ? load.graph : null;

  const nodes = useMemo<CanvasNode[]>(() => {
    if (!graph) return [];
    const byId = new Map<string, MapOutcome>();
    const byLabel = new Map<string, MapOutcome>();
    for (const c of outcomes ?? []) {
      byId.set(c.id, c);
      byLabel.set(c.label.trim().toLowerCase(), c);
    }
    const seen = new Set<string>();
    const unique = graph.nodes.filter((n) => n.id && !seen.has(n.id) && seen.add(n.id));
    const max = Math.max(...unique.map((n) => Number(n.importance) || 0), 0);
    return unique.map((n) => {
      const imp = Number(n.importance);
      return {
        id: n.id,
        label: n.label || n.id,
        bloomLevel: n.bloomLevel,
        weight: max > 0 && Number.isFinite(imp) ? Math.max(0, Math.min(1, imp / max)) : 0.5,
        outcome: outcomeFor(byId.get(n.id) ?? byLabel.get((n.label || "").trim().toLowerCase())),
      };
    });
  }, [graph, outcomes]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const outcomeById = useMemo(() => {
    const map = new Map<string, MapOutcome>();
    for (const c of outcomes ?? []) map.set(c.id, c);
    for (const n of nodes) {
      if (!map.has(n.id)) {
        const c = outcomes?.find((o) => o.label.trim().toLowerCase() === n.label.trim().toLowerCase());
        if (c) map.set(n.id, c);
      }
    }
    return map;
  }, [nodes, outcomes]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null), [nodes, q]);
  const listed = useMemo(
    () => [...nodes].filter((n) => !matches || matches.has(n.id)).sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)),
    [nodes, matches]
  );

  const counts = useMemo(() => {
    const bloom = new Map<string, number>();
    const outcome = new Map<Outcome, number>();
    for (const n of nodes) {
      const level = toBloom(n.bloomLevel) ?? "Other";
      bloom.set(level, (bloom.get(level) ?? 0) + 1);
      outcome.set(n.outcome, (outcome.get(n.outcome) ?? 0) + 1);
    }
    return { bloom, outcome };
  }, [nodes]);

  const selected = selectedId ? nodeById.get(selectedId) : undefined;
  const connections = useMemo(() => {
    if (!graph || !selectedId) return [];
    return graph.edges
      .filter((e) => (e.source === selectedId || e.target === selectedId) && e.source !== e.target)
      .map((e) => {
        const outgoing = e.source === selectedId;
        const other = nodeById.get(outgoing ? e.target : e.source);
        return other ? { other, outgoing, relationship: (e.relationship || "relates to").replace(/_/g, " ").toLowerCase() } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [graph, selectedId, nodeById]);

  /** On phones, keep the chosen node above the opened bottom sheet. */
  const sheetOffset = () => (desktop ? 0 : Math.round((bodyRef.current?.clientHeight ?? 600) * 0.28));

  function pick(id: string | null, center = true) {
    setSelectedId(id);
    if (id) {
      setSheetOpen(true);
      if (center) setFocus({ id, nonce: Date.now(), offsetY: sheetOffset() });
    }
  }

  const legend =
    mode === "outcome"
      ? (Object.keys(OUTCOME_COLORS) as Outcome[]).map((o) => ({ key: o, color: OUTCOME_COLORS[o], label: OUTCOME_LABELS[o], count: counts.outcome.get(o) ?? 0 }))
      : BLOOM_LEVELS.map((b) => ({ key: b, color: BLOOM_COLORS[b], label: b, count: counts.bloom.get(b) ?? 0 })).filter((l) => l.count > 0);

  const searchInput = (
    <label className="relative flex min-w-0 flex-1 items-center">
      <span className="sr-only">Search ideas</span>
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-mute" aria-hidden="true" />
      <input
        type="search"
        value={query}
        autoFocus={!desktop && searchOpen}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && listed[0]) {
            e.preventDefault();
            pick(listed[0].id);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search ideas"
        className="h-11 w-full rounded-full border border-line-strong bg-ink pl-10 pr-3 text-paper placeholder:text-mute/70 focus:border-ribbon focus:outline-none"
      />
    </label>
  );

  const details = selected && (
    <div aria-live="polite">
      <h2 className="font-serif text-xl font-semibold leading-snug">{selected.label}</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-mute">Importance</dt>
        <dd>{importanceWord(selected.weight)}</dd>
        <dt className="text-mute">Thinking level</dt>
        <dd className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: bloomColor(selected.bloomLevel) }} aria-hidden="true" />
          {toBloom(selected.bloomLevel) ?? selected.bloomLevel ?? "Not set"}
        </dd>
        {hasOutcomes && (
          <>
            <dt className="text-mute">Your result</dt>
            <dd className="flex flex-wrap items-center gap-x-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTCOME_COLORS[selected.outcome] }} aria-hidden="true" />
              {OUTCOME_LABELS[selected.outcome]}
              {(outcomeById.get(selected.id)?.asked ?? 0) > 0 && (
                <span className="text-mute">
                  ({outcomeById.get(selected.id)!.correct} of {outcomeById.get(selected.id)!.asked} right)
                </span>
              )}
            </dd>
          </>
        )}
      </dl>
      <h3 className="mt-5 font-sans text-sm font-semibold text-mute">
        {connections.length === 0 ? "No connections" : `Connections (${connections.length})`}
      </h3>
      <ul className="mt-1 flex flex-col">
        {connections.map((c, i) => (
          <li key={`${c.other.id}-${i}`}>
            <button type="button" onClick={() => pick(c.other.id)} className="min-h-11 w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-ink-raised">
              {c.outgoing ? (
                <>
                  <span className="text-mute">{c.relationship}</span> <span className="font-semibold text-paper">{c.other.label}</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-paper">{c.other.label}</span> <span className="text-mute">{c.relationship} this</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const list = (
    <div>
      <p className="pb-1 text-sm text-mute" aria-live="polite">
        {matches ? `${listed.length} matching ${listed.length === 1 ? "idea" : "ideas"}` : "Most important first. Choose one to see its connections."}
      </p>
      <ul className="flex flex-col">
        {listed.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => pick(n.id)} className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm hover:bg-ink-raised">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: mode === "outcome" ? OUTCOME_COLORS[n.outcome] : bloomColor(n.bloomLevel) }}
                aria-hidden="true"
              />
              <span className="truncate">{n.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const backToList = selected && (
    <button type="button" onClick={() => setSelectedId(null)} className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-mute hover:text-paper">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All ideas
    </button>
  );

  const ready = graph && nodes.length > 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-sunk pt-[env(safe-area-inset-top)]">
      {/* Top bar */}
      <div className="flex flex-col gap-2 border-b border-line bg-ink px-2 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/book/${bookId}`}
            aria-label="Back to the book"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-paper hover:bg-ink-raised"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-lg font-semibold leading-tight">
              Map of <span className="italic">{title}</span>
            </h1>
            <p className="truncate text-sm text-mute">
              {graph ? `${nodes.length} ideas, ${graph.edges.length} connections` : "Loading…"}
              {hasOutcomes && outcomeSource ? `. Colored by ${outcomeSource}` : ""}
            </p>
          </div>
          {ready && desktop && <div className="w-72">{searchInput}</div>}
          {ready && !desktop && (
            <button
              type="button"
              aria-label={searchOpen ? "Close search" : "Search ideas"}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery("");
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-paper hover:bg-ink-raised"
            >
              {searchOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
            </button>
          )}
        </div>
        {ready && !desktop && searchOpen && <div className="px-1 pb-1">{searchInput}</div>}
      </div>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        <div ref={bodyRef} className="relative min-h-0 flex-1">
          <div
            className="absolute inset-x-0 top-0 touch-none"
            style={{ bottom: ready && !desktop ? SHEET_PEEK : 0 }}
            data-testid="graph-area"
          >
            {load.status === "loading" ? (
              <Centered>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading the map…
              </Centered>
            ) : load.status === "error" ? (
              <Centered>
                <div className="flex flex-col items-center gap-3">
                  <p>{load.message}</p>
                  <button type="button" onClick={fetchGraph} className="min-h-11 font-semibold text-ribbon-soft underline underline-offset-4">
                    Load the map again
                  </button>
                </div>
              </Centered>
            ) : nodes.length === 0 ? (
              <Centered>This book produced no ideas to draw.</Centered>
            ) : (
              <GraphCanvas
                graph={load.graph}
                nodes={nodes}
                colorMode={mode}
                matches={matches}
                selectedId={selectedId}
                focus={focus}
                padding={desktop ? 64 : 44}
                onSelect={(id) => {
                  if (id) {
                    setSelectedId(id);
                    setSheetOpen(true);
                  } else {
                    setSelectedId(null);
                    setSheetOpen(false);
                  }
                }}
              />
            )}
          </div>

          {/* Legend */}
          {ready && (
            <div className="pointer-events-auto absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-2xl border border-line bg-ink/90 px-3 py-2 text-xs backdrop-blur lg:bottom-3 lg:left-3 lg:top-auto">
              {hasOutcomes ? (
                <div role="radiogroup" aria-label="Color ideas by" className="mb-1.5 flex w-fit rounded-full border border-line-strong p-0.5">
                  {(
                    [
                      ["outcome", "Your result"],
                      ["bloom", "Thinking level"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      onClick={() => setColorMode(value)}
                      className={cn("h-8 rounded-full px-3 font-semibold transition-colors", mode === value ? "bg-paper text-ink" : "text-mute hover:text-paper")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mb-1 font-semibold text-paper">
                  Colored by thinking level<span className="hidden font-normal text-mute sm:inline">, sized by importance</span>
                </p>
              )}
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {legend.map((l) => (
                  <li key={l.key} className="flex items-center gap-1.5 text-mute">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                    {l.label} <span className="tabular-nums text-paper/80">{l.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Phones: bottom sheet */}
          {ready && !desktop && (
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-3xl border-t border-line-strong bg-ink shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.6)]",
                sheetOpen ? "h-[58%]" : ""
              )}
              style={sheetOpen ? undefined : { height: SHEET_PEEK }}
              data-testid="sheet"
              data-open={sheetOpen ? "true" : "false"}
              onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
              onTouchEnd={(e) => {
                if (touchY.current === null) return;
                const dy = e.changedTouches[0].clientY - touchY.current;
                touchY.current = null;
                if (dy > 50) setSheetOpen(false);
                else if (dy < -50) setSheetOpen(true);
              }}
            >
              <button
                type="button"
                onClick={() => setSheetOpen((o) => !o)}
                aria-expanded={sheetOpen}
                aria-label={sheetOpen ? "Collapse the panel" : "Expand the panel"}
                className="flex h-6 w-full shrink-0 items-center justify-center pt-2"
              >
                <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
              </button>
              {sheetOpen ? (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
                  {backToList}
                  {selected ? details : list}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 pb-[env(safe-area-inset-bottom)]">
                  <p className="min-w-0 flex-1 truncate text-sm text-mute">
                    {selected ? (
                      <>
                        <span className="font-semibold text-paper">{selected.label}</span>, {connections.length} connections
                      </>
                    ) : (
                      "Tap an idea, or pinch to zoom."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold text-paper"
                  >
                    <List className="h-4 w-4" aria-hidden="true" /> {selected ? "Details" : "All ideas"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop: side panel */}
        {ready && desktop && (
          <aside className="flex w-[22rem] min-h-0 flex-col border-l border-line bg-ink" aria-label={selected ? `Details for ${selected.label}` : "Ideas"}>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {backToList}
              {selected ? details : list}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
