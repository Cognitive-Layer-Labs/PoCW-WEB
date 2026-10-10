"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import { BLOOM_COLORS, BLOOM_LEVELS, OUTCOME_COLORS, OUTCOME_LABELS, bloomColor, toBloom, type Outcome } from "@/lib/bloom";
import type { ConceptOutcome, KnowledgeGraph } from "@/lib/engine";
import { cn } from "@/lib/utils";
import type { CanvasNode, ColorMode } from "./GraphCanvas";

const GraphCanvas = dynamic(() => import("./GraphCanvas"), {
  ssr: false,
  loading: () => <Centered>Drawing the graph…</Centered>,
});

export type GraphState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; graph: KnowledgeGraph };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  state: GraphState | undefined;
  outcomes?: ConceptOutcome[] | null;
  onRetry: () => void;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center gap-3 p-6 text-center text-mute">{children}</div>;
}

function outcomeFor(outcome: ConceptOutcome | undefined): Outcome {
  if (!outcome || outcome.asked <= 0) return "untested";
  return outcome.mastered ? "mastered" : "attempted";
}

function importanceWord(weight: number): string {
  if (weight >= 0.7) return "Central idea";
  if (weight >= 0.4) return "Supporting idea";
  return "Detail";
}

export function GraphDialog({ open, onOpenChange, title, state, outcomes, onRetry }: Props) {
  const graph = state?.status === "ready" ? state.graph : null;
  const hasOutcomes = !!outcomes && outcomes.length > 0;
  const [colorMode, setColorMode] = useState<ColorMode>(hasOutcomes ? "outcome" : "bloom");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const mode: ColorMode = hasOutcomes ? colorMode : "bloom";

  const nodes = useMemo<CanvasNode[]>(() => {
    if (!graph) return [];
    const byId = new Map<string, ConceptOutcome>();
    const byLabel = new Map<string, ConceptOutcome>();
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
    const map = new Map<string, ConceptOutcome>();
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

  function pick(id: string | null, center = true) {
    setSelectedId(id);
    if (id && center) setFocus({ id, nonce: Date.now() });
  }

  const legend =
    mode === "outcome"
      ? (Object.keys(OUTCOME_COLORS) as Outcome[]).map((o) => ({ key: o, color: OUTCOME_COLORS[o], label: OUTCOME_LABELS[o], count: counts.outcome.get(o) ?? 0 }))
      : BLOOM_LEVELS.map((b) => ({ key: b, color: BLOOM_COLORS[b], label: b, count: counts.bloom.get(b) ?? 0 })).filter((l) => l.count > 0);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSelectedId(null);
          setQuery("");
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col bg-ink-sunk outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          aria-describedby="graph-desc"
        >
          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-lg font-semibold leading-tight sm:text-xl">Knowledge graph</Dialog.Title>
              <p id="graph-desc" className="truncate text-sm text-mute">
                {graph ? `${nodes.length} concepts and ${graph.edges.length} connections in ${title}` : title}
              </p>
            </div>
            <Dialog.Close
              className="order-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong text-paper hover:border-magenta sm:order-3"
              aria-label="Close graph"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
            {graph && (
              <div className="order-3 flex w-full flex-wrap items-center gap-3 sm:order-2 sm:w-auto">
                <label className="relative flex min-w-0 flex-1 items-center sm:w-72 sm:flex-none">
                  <span className="sr-only">Search concepts</span>
                  <Search className="pointer-events-none absolute left-3 h-4 w-4 text-mute" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && listed[0]) {
                        e.preventDefault();
                        pick(listed[0].id);
                      }
                    }}
                    placeholder="Search concepts"
                    className="h-10 w-full rounded-full border border-line-strong bg-ink pl-9 pr-3 text-sm text-paper placeholder:text-mute/70 focus:border-magenta focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="relative min-h-0 flex-1 touch-none">
              {!state || state.status === "loading" ? (
                <Centered>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading the graph…
                </Centered>
              ) : state.status === "error" ? (
                <Centered>
                  <div className="flex flex-col items-center gap-3">
                    <p>{state.message}</p>
                    <button type="button" onClick={onRetry} className="font-semibold text-magenta-soft underline underline-offset-4">
                      Load the graph again
                    </button>
                  </div>
                </Centered>
              ) : nodes.length === 0 ? (
                <Centered>This document produced no concepts to draw.</Centered>
              ) : (
                <GraphCanvas
                  graph={state.graph}
                  nodes={nodes}
                  colorMode={mode}
                  matches={matches}
                  selectedId={selectedId}
                  focus={focus}
                  onSelect={(id) => pick(id, false)}
                />
              )}

              {graph && nodes.length > 0 && (
                <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-2xl border border-line bg-ink/90 px-3 py-2 text-xs backdrop-blur sm:bottom-3 sm:left-3 sm:px-3.5 sm:py-2.5">
                  {hasOutcomes ? (
                    <div role="radiogroup" aria-label="Color concepts by" className="mb-2 flex w-fit rounded-full border border-line-strong p-0.5">
                      {(
                        [
                          ["outcome", "Your result"],
                          ["bloom", "Bloom level"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={mode === value}
                          onClick={() => setColorMode(value)}
                          className={cn(
                            "h-7 rounded-full px-3 font-semibold transition-colors",
                            mode === value ? "bg-paper text-ink" : "text-mute hover:text-paper"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-1.5 font-semibold text-paper">
                      Colored by Bloom level<span className="hidden font-normal text-mute sm:inline">, sized by importance</span>
                    </p>
                  )}
                  <ul className="flex flex-wrap gap-x-3.5 gap-y-1">
                    {legend.map((l) => (
                      <li key={l.key} className="flex items-center gap-1.5 text-mute">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                        {l.label} <span className="tabular-nums text-paper/80">{l.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Side panel: details for the selected concept, or the concept list */}
            {graph && nodes.length > 0 && (
              <aside
                className="flex max-h-[36%] min-h-0 flex-col border-t border-line bg-ink lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0"
                aria-label={selected ? `Details for ${selected.label}` : "Concepts"}
              >
                {selected ? (
                  <div className="min-h-0 flex-1 overflow-y-auto p-5" aria-live="polite">
                    <button
                      type="button"
                      onClick={() => pick(null)}
                      className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute hover:text-paper"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All concepts
                    </button>
                    <h3 className="text-xl font-semibold leading-snug">{selected.label}</h3>
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className="text-mute">Bloom level</dt>
                      <dd className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: bloomColor(selected.bloomLevel) }} aria-hidden="true" />
                        {toBloom(selected.bloomLevel) ?? selected.bloomLevel ?? "Not set"}
                      </dd>
                      <dt className="text-mute">Importance</dt>
                      <dd>{importanceWord(selected.weight)}</dd>
                      {hasOutcomes && (
                        <>
                          <dt className="text-mute">Your result</dt>
                          <dd className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTCOME_COLORS[selected.outcome] }} aria-hidden="true" />
                            {OUTCOME_LABELS[selected.outcome]}
                            {outcomeById.get(selected.id) && outcomeById.get(selected.id)!.asked > 0 && (
                              <span className="text-mute">
                                ({outcomeById.get(selected.id)!.correct} of {outcomeById.get(selected.id)!.asked} right)
                              </span>
                            )}
                          </dd>
                        </>
                      )}
                    </dl>
                    <h4 className="mt-6 text-sm font-semibold text-mute">
                      {connections.length === 0 ? "No connections" : `Connections (${connections.length})`}
                    </h4>
                    <ul className="mt-2 flex flex-col">
                      {connections.map((c, i) => (
                        <li key={`${c.other.id}-${i}`}>
                          <button
                            type="button"
                            onClick={() => pick(c.other.id)}
                            className="w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-ink-raised"
                          >
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
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <p className="px-5 pb-2 pt-4 text-sm text-mute" aria-live="polite">
                      {matches ? `${listed.length} matching ${listed.length === 1 ? "concept" : "concepts"}` : "Most important first. Select one to see its connections."}
                    </p>
                    <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                      {listed.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => pick(n.id)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-ink-raised"
                          >
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
                )}
              </aside>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
