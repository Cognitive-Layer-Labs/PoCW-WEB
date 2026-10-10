import { OUTCOME_COLORS } from "@/lib/bloom";
import { cn } from "@/lib/utils";

/**
 * The page's one illustration: an open book. The left page is text; the right
 * page has become a map of the book's ideas, colored by what a reader kept.
 * "intro" draws the map in once; "working" keeps re-linking it while a book is
 * being mapped. Purely decorative.
 */

type Outcome = keyof typeof OUTCOME_COLORS;

const NODES: Array<{ x: number; y: number; r: number; outcome: Outcome; label?: string; anchor?: "start" | "middle" | "end"; dx?: number; dy?: number }> = [
  { x: 430, y: 196, r: 13, outcome: "mastered", label: "The inner citadel", anchor: "middle", dy: 34 },
  { x: 356, y: 118, r: 9, outcome: "mastered", label: "What is up to us", anchor: "start", dx: -26, dy: -22 },
  { x: 504, y: 104, r: 8, outcome: "attempted", label: "Impermanence", anchor: "end", dx: 12, dy: 34 },
  { x: 524, y: 206, r: 9, outcome: "mastered" },
  { x: 488, y: 290, r: 8, outcome: "untested", label: "Duty to others", anchor: "end", dx: 12, dy: 28 },
  { x: 352, y: 262, r: 8, outcome: "attempted", label: "The present", anchor: "start", dx: -12, dy: 28 },
];

const EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3], [0, 5], [1, 5], [2, 3], [3, 4], [4, 5], [0, 4], [1, 2],
];

const TEXT_LINES: Array<[number, number]> = [
  // y, length
  [104, 186], [126, 196], [148, 178], [170, 192], [192, 120],
  [226, 190], [248, 184], [270, 196], [292, 150], [314, 98],
];

export function BookMapArt({ state = "intro", className }: { state?: "intro" | "working" | "still"; className?: string }) {
  return (
    <svg viewBox="0 0 600 400" className={cn("bookmap-art", className)} data-state={state} aria-hidden="true" focusable="false">
      {/* left page: text */}
      <path d="M292 76C226 44 136 34 40 38V334C136 332 226 344 292 374Z" fill="#F6EFF3" />
      <g fill="#1B1026" opacity="0.16">
        {TEXT_LINES.map(([y, len], i) => (
          <rect key={i} x={i === 0 || i === 5 ? 92 : 72} y={y} width={len - (i === 0 || i === 5 ? 20 : 0)} height="7" rx="3.5" />
        ))}
      </g>
      {/* right page: the map */}
      <path d="M308 76C374 44 464 34 560 38V334C464 332 374 344 308 374Z" fill="#251933" stroke="#594670" strokeWidth="1.5" />
      {/* the ribbon bookmark */}
      <path d="M300 60V392L291 384L282 392V64Z" fill="#F0579B" transform="translate(9 0)" />
      <g stroke="#F0579B" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" fill="none">
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            className="edge"
            pathLength={1}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            style={{ animationDelay: state === "intro" ? `${200 + i * 70}ms` : `${i * 140}ms` }}
          />
        ))}
      </g>
      {NODES.map((n, i) => (
        <circle
          key={i}
          className="node"
          cx={n.x}
          cy={n.y}
          r={n.r}
          fill={OUTCOME_COLORS[n.outcome]}
          style={{ animationDelay: state === "intro" ? `${100 + i * 90}ms` : `${i * 210}ms`, transformBox: "fill-box", transformOrigin: "center" }}
        />
      ))}
      <g fill="#F6EFF3" fontSize="17" fontWeight="600" fontFamily='"Atkinson Hyperlegible Next Variable", system-ui, sans-serif'>
        {NODES.filter((n) => n.label).map((n) => (
          <text key={n.label} x={n.x + (n.dx ?? 0)} y={n.y + (n.dy ?? 0)} textAnchor={n.anchor} stroke="#251933" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
            {n.label}
          </text>
        ))}
      </g>
    </svg>
  );
}
