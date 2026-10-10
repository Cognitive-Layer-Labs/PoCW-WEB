"use client";

import { useId, useRef, useState } from "react";
import { int, pct, usd } from "@/lib/admin-format";
import { cn } from "@/lib/utils";

export type ChartFormat = "int" | "usd" | "pct";

export interface Column {
  key: string;
  /** Full label for the tooltip and the table, e.g. "Thu 9 Oct" or "60–69". */
  label: string;
  /** Short axis label, e.g. "9 Oct". Defaults to label. */
  tick?: string;
  value: number;
}

const fmt = (v: number, f: ChartFormat) => (f === "usd" ? usd(v) : f === "pct" ? pct(v) : int(v));

/** Gridline step: 1, 2 or 5 times a power of ten, so every tick label is a round number (whole for counts). */
function niceTicks(max: number, f: ChartFormat): number[] {
  const target = max > 0 ? max / 3 : 1;
  const exp = Math.pow(10, Math.floor(Math.log10(target)));
  const m = target / exp;
  let step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * exp;
  if (f === "int") step = Math.max(1, Math.round(step));
  const count = Math.max(1, Math.ceil((max > 0 ? max : step) / step - 1e-9));
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

/**
 * Vertical columns from one baseline (one series, one colour). Hover or focus a
 * column for its value; arrow keys move between columns; "Table" shows every value.
 */
export function ColumnChart({
  columns,
  format = "int",
  label,
  unit,
  height = 132,
  tickEvery,
}: {
  columns: Column[];
  format?: ChartFormat;
  /** Accessible name, e.g. "Sign-ups per day, last 30 days". */
  label: string;
  /** Noun after the value in the tooltip, e.g. "sign-ups". */
  unit?: string;
  /** Plot height in px; a parent can override it responsively with the --chart-h CSS variable. */
  height?: number;
  /** Label every nth column (counted back from the last). Defaults to all, or weekly for long series. */
  tickEvery?: number;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [rove, setRove] = useState(Math.max(0, columns.length - 1));
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const n = columns.length;
  const ticks = niceTicks(Math.max(0, ...columns.map((c) => c.value)), format);
  const top = ticks[ticks.length - 1];
  const every = tickEvery ?? (n > 14 ? 7 : 1);
  const active = hover ?? focus;

  function onKey(e: React.KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(n - 1, next));
    setRove(j);
    refs.current[j]?.focus();
  }

  const at = (i: number) => ((i + 0.5) / n) * 100;
  const heightPct = (v: number) => (v > 0 ? Math.max(1.5, (v / top) * 100) : 0);

  return (
    <figure className="m-0 min-w-0">
      <div className="flex">
        {/* y-axis labels */}
        <div className="relative w-10 shrink-0" style={{ height: `var(--chart-h, ${height}px)` }} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 translate-y-1/2 text-[0.6875rem] tabular-nums leading-none text-mute"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {fmt(t, format)}
            </span>
          ))}
        </div>
        {/* plot */}
        <div className="relative min-w-0 flex-1" style={{ height: `var(--chart-h, ${height}px)` }}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={cn("absolute inset-x-0 border-t", t === 0 ? "border-line-strong" : "border-line/60")}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <div
            role="group"
            aria-label={`${label}. Use the arrow keys to read each value.`}
            className="absolute inset-0 flex items-stretch gap-[2px]"
            onPointerLeave={() => setHover(null)}
          >
            {columns.map((c, i) => (
              <div
                key={c.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="img"
                aria-label={`${c.label}: ${fmt(c.value, format)}${unit ? ` ${unit}` : ""}`}
                tabIndex={i === rove ? 0 : -1}
                onKeyDown={(e) => onKey(e, i)}
                onFocus={() => {
                  setFocus(i);
                  setRove(i);
                }}
                onBlur={() => setFocus(null)}
                onPointerEnter={() => setHover(i)}
                className={cn(
                  "relative flex min-w-0 flex-1 cursor-default items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ribbon",
                  active === i && "bg-paper/[0.05]"
                )}
              >
                <div
                  className={cn("w-full max-w-6 rounded-t-[4px] transition-colors", active === i ? "bg-ribbon-soft" : "bg-ribbon")}
                  style={{ height: `${heightPct(c.value)}%` }}
                />
              </div>
            ))}
          </div>
          {active !== null && columns[active] && (
            <div
              role="presentation"
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-paper px-2.5 py-1.5 text-ink shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
              style={{
                left: `${at(active)}%`,
                bottom: `calc(${heightPct(columns[active].value)}% + 8px)`,
                transform: `translateX(-${at(active)}%)`,
              }}
            >
              <span className="block text-sm font-semibold tabular-nums leading-tight">
                {fmt(columns[active].value, format)}
                {unit && <span className="font-normal"> {unit}</span>}
              </span>
              <span className="block text-xs leading-tight text-ink/70">{columns[active].label}</span>
            </div>
          )}
        </div>
      </div>
      {/* x-axis labels */}
      <div className="relative ml-10 h-6" aria-hidden="true">
        {columns.map((c, i) =>
          (n - 1 - i) % every === 0 ? (
            <span
              key={c.key}
              className="absolute top-1.5 whitespace-nowrap text-[0.6875rem] leading-none text-mute"
              style={{ left: `${at(i)}%`, transform: `translateX(-${at(i)}%)` }}
            >
              {c.tick ?? c.label}
            </span>
          ) : null
        )}
      </div>
      <details className="group mt-1">
        <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs text-mute hover:text-paper" aria-controls={`${id}-table`}>
          Show as table
        </summary>
        <div id={`${id}-table`} className="mt-1 max-h-56 overflow-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <caption className="sr-only">{label}</caption>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key} className="border-b border-line/50 last:border-0">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-mute">
                    {c.label}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums text-paper">{fmt(c.value, format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
