/** Formatting shared by server and client components. */

const DAY = 24 * 3600 * 1000;

/** "today", "yesterday", "3 days ago", or "12 Mar 2026". */
export function relativeDay(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  const start = today.getTime();
  if (t >= start) return "today";
  if (t >= start - DAY) return "yesterday";
  const days = Math.ceil((start - t) / DAY);
  if (days < 7) return `${days} days ago`;
  return shortDate(iso);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

/** Plain-language reading of a 0-100 score. */
export function band(score: number): { label: string; line: string } {
  if (score >= 80) return { label: "Deep grasp", line: "You can work with this book's ideas, not just recall them." };
  if (score >= 65) return { label: "Strong grasp", line: "Most of the key ideas stuck, and you can use them." };
  if (score >= 50) return { label: "Working grasp", line: "You've got the core. A few ideas are still fuzzy." };
  if (score >= 35) return { label: "Partial grasp", line: "Some ideas stuck. The map shows which ones to revisit." };
  return { label: "Early grasp", line: "Not much has stuck yet. Skim the map and try again." };
}

export const LEVEL_LABELS = { gentle: "Gentle", standard: "Standard", challenging: "Challenging" } as const;
export const LEVEL_BARS = { gentle: 35, standard: 50, challenging: 65 } as const;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
