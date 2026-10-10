import { cn } from "@/lib/utils";

export interface BarRow {
  key: string;
  label: React.ReactNode;
  /** Bar length, relative to `max`. */
  value: number;
  /** The number printed at the end of the row. */
  display: string;
  /** Secondary detail after the number. */
  sub?: React.ReactNode;
}

/**
 * Horizontal bars with every value printed, so no tooltip is needed. One hue:
 * the categories are nominal or already ordered by position.
 */
export function BarList({
  rows,
  max,
  track = false,
  label,
  labelWidth = "9.5rem",
  valueWidth = "auto",
  className,
}: {
  rows: BarRow[];
  /** Defaults to the largest value. Pass 1 for shares. */
  max?: number;
  /** Show the 0–max track behind each bar (for rates against 100%). */
  track?: boolean;
  label: string;
  labelWidth?: string;
  /** Fix the width of the value column so stacked lists line up. */
  valueWidth?: string;
  className?: string;
}) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className={cn("flex flex-col gap-2.5", className)} style={{ ["--lw" as string]: labelWidth, ["--vw" as string]: valueWidth }}>
      {rows.map((r) => {
        const w = top > 0 && r.value > 0 ? Math.max(1, Math.min(100, (r.value / top) * 100)) : 0;
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,var(--lw))_minmax(2.5rem,1fr)_var(--vw)] items-center gap-x-3 text-sm">
            <span className="min-w-0 truncate text-paper/90">{r.label}</span>
            <span aria-hidden="true" className={cn("relative h-2 rounded-[4px]", track && "bg-line/70")}>
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-ribbon" style={{ width: `${w}%` }} />
            </span>
            <span className="whitespace-nowrap text-right tabular-nums text-paper">
              {r.display}
              {r.sub && <span className="ml-1.5 text-mute">{r.sub}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One ratio against a limit. The fill turns amber, then rose, as it nears the limit (always with a label). */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const tone = f >= 0.95 ? "bg-danger" : f >= 0.8 ? "bg-outcome-attempted" : "bg-ribbon";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="relative h-3 overflow-hidden rounded-full bg-ribbon/15"
    >
      <div className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${f * 100}%` }} />
    </div>
  );
}
