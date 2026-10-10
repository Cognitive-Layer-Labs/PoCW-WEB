/** Number and time formatting for the admin dashboard (server and client). All times UTC. */

const INT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function int(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "–" : INT.format(v);
}

/** 0.4567 -> "46%". */
export function pct(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "–" : `${(v * 100).toFixed(digits)}%`;
}

/** A score out of 100, rounded. */
export function score(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "–" : String(Math.round(v));
}

/** Dollars: $1,234 / $12.34 / $0.064 / $0.0042. */
export function usd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a === 0) return "$0";
  if (a >= 1000) return `${sign}$${INT.format(Math.round(a))}`;
  if (a >= 1) return `${sign}$${a.toFixed(2)}`;
  return `${sign}$${Number(a.toPrecision(2))}`;
}

/** 48 -> "48 s", 112 -> "1 min 52 s", 7500 -> "2 h 5 min". */
export function duration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !Number.isFinite(secs)) return "–";
  const s = Math.round(secs);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "10 Oct 2026". */
export function day(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "–";
}

/** "10 Oct" (for axis ticks). */
export function dayShort(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "–";
}

/** "9 Oct" this year, "9 Oct 2025" before. */
export function dayCompact(iso: string | null | undefined, nowMs = Date.now()): string {
  const d = parse(iso);
  if (!d) return "–";
  return d.getUTCFullYear() === new Date(nowMs).getUTCFullYear() ? dayShort(iso) : day(iso);
}

/** "Thu 9 Oct" (for tooltips). */
export function dayLong(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "–";
}

/** "10 Oct 2026, 12:26" in UTC; the year is left out for the current year. */
export function stamp(iso: string | null | undefined, nowMs = Date.now()): string {
  const d = parse(iso);
  if (!d) return "–";
  const year = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function ago(iso: string | null | undefined, nowMs = Date.now()): string {
  const d = parse(iso);
  if (!d) return "–";
  const secs = (nowMs - d.getTime()) / 1000;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  const days = Math.floor(secs / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return day(iso);
}

export const LEVEL_NAMES: Record<string, string> = { gentle: "Gentle", standard: "Standard", challenging: "Challenging" };
export const TYPE_NAMES: Record<string, string> = { open: "Written", mcq: "Multiple choice", true_false: "True or false" };
export const TYPE_SHORT: Record<string, string> = { open: "Written", mcq: "Choice", true_false: "T/F" };

/** 700 -> "700 ms", 9200 -> "9.2 s". */
export function latency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return "–";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** "1 test", "12 tests". */
export function count(n: number | null | undefined, one: string, many = `${one}s`): string {
  return `${int(n)} ${n === 1 ? one : many}`;
}
