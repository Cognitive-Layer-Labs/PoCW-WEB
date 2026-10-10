/** Per-point verdicts the engine returns for written ("open") answers. Shared by server and client. */

export type KeyPointStatus = "covered" | "partial" | "missing";

export interface KeyPoint {
  point: string;
  status: KeyPointStatus;
}

const STATUSES: KeyPointStatus[] = ["covered", "partial", "missing"];

/** Keeps only well-formed points (the engine field is optional and may be absent on older engines). */
export function normalizeKeyPoints(value: unknown): KeyPoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: KeyPoint[] = [];
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const { point, status } = item as { point?: unknown; status?: unknown };
    if (typeof point !== "string" || !point.trim() || !STATUSES.includes(status as KeyPointStatus)) continue;
    out.push({ point: point.trim().slice(0, 500), status: status as KeyPointStatus });
  }
  return out.length > 0 ? out : undefined;
}

export interface KeyPointSummary {
  covered: number;
  partial: number;
  total: number;
  /** "Correct", "Mostly right", "Partly right" or "Not quite". */
  verdict: string;
  /** "2 of 3 points", "2 of 3 points, 1 partly". */
  tally: string;
}

/** The headline for a written answer. `passed` is the engine's own correct flag. */
export function summarizeKeyPoints(points: KeyPoint[], passed: boolean): KeyPointSummary {
  const covered = points.filter((p) => p.status === "covered").length;
  const partial = points.filter((p) => p.status === "partial").length;
  const total = points.length;
  const verdict =
    covered === total ? "Correct" : passed ? "Mostly right" : covered + partial > 0 ? "Partly right" : "Not quite";
  const tally = `${covered} of ${total} ${total === 1 ? "point" : "points"}${partial ? `, ${partial} partly` : ""}`;
  return { covered, partial, total, verdict, tally };
}

export const KEY_POINT_LABEL: Record<KeyPointStatus, string> = {
  covered: "Covered",
  partial: "Partly covered",
  missing: "Missing",
};
