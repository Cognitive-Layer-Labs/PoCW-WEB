import { BLOOM_LEVELS, BLOOM_COLORS } from "@/lib/bloom";
import { cn } from "@/lib/utils";

/**
 * The page's one visual motif: a small knowledge graph that sits idle in the
 * drop zone, links up when a file is dragged over it, and keeps re-linking
 * while the engine indexes. Purely decorative (aria-hidden).
 */

const NODES: Array<[number, number, number]> = [
  // x, y, bloom index
  [62, 74, 0],
  [148, 38, 1],
  [246, 66, 2],
  [338, 40, 0],
  [104, 160, 3],
  [206, 146, 1],
  [304, 150, 4],
  [372, 212, 2],
  [52, 246, 5],
  [160, 250, 2],
  [262, 238, 3],
];

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [4, 5], [5, 2], [5, 6],
  [3, 6], [6, 7], [4, 8], [4, 9], [9, 10], [5, 10], [10, 6], [10, 7],
];

export type ConstellationState = "idle" | "armed" | "working" | "done";

export function Constellation({ state, className }: { state: ConstellationState; className?: string }) {
  const lit = state !== "idle";
  return (
    <svg
      viewBox="0 0 420 290"
      className={cn("constellation", className)}
      data-state={state}
      aria-hidden="true"
      focusable="false"
    >
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NODES[a][0]}
          y1={NODES[a][1]}
          x2={NODES[b][0]}
          y2={NODES[b][1]}
          pathLength={1}
          stroke={lit ? "#F0389E" : "#5A4769"}
          strokeOpacity={lit ? 0.7 : 0.5}
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ transitionDelay: `${i * 45}ms`, animationDelay: `${i * 140}ms` }}
        />
      ))}
      {NODES.map(([x, y, level], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={lit ? 7 : 5}
          fill={lit ? BLOOM_COLORS[BLOOM_LEVELS[level]] : "#5A4769"}
          style={{ animationDelay: `${i * 210}ms` }}
        />
      ))}
    </svg>
  );
}
