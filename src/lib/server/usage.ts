/**
 * LLM usage and spend from the engine's operator endpoint (GET /api/usage).
 * Server-to-server only: the bearer key never reaches a browser, and the
 * browser proxy (/api/engine/...) does not forward this route.
 */

const ENGINE_URL = (process.env.ENGINE_URL || "http://engine:3000").replace(/\/+$/, "");
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "";

export interface Usage {
  key: { limitUsd: number | null; usageUsd: number; remainingUsd: number | null } | null;
  totals: { calls: number; costUsd: number; errors: number };
  byDay: Array<{ date: string; calls: number; costUsd: number }>;
  byTask: Array<{ task: string; model: string; calls: number; costUsd: number; avgLatencyMs: number; errors: number }>;
  perBook: { avgCostUsd: number | null; count: number };
  perSession: { avgCostUsd: number | null; count: number };
}

export type UsageResult =
  | { state: "ok"; usage: Usage }
  | { state: "unsupported" } // older engine without the endpoint
  | { state: "unconfigured" }
  | { state: "unreachable" }
  | { state: "error"; status: number };

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown, max = 120): string => (typeof v === "string" ? v.slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 400) : []);

/** Defensive parse: unknown or missing fields become zeros or nulls, never a crash. */
export function parseUsage(body: unknown): Usage {
  const b = obj(body);
  const key = b.key && typeof b.key === "object" ? obj(b.key) : null;
  const perBook = obj(b.perBook);
  const perSession = obj(b.perSession);
  const totals = obj(b.totals);
  return {
    key: key ? { limitUsd: nOrNull(key.limitUsd), usageUsd: n(key.usageUsd), remainingUsd: nOrNull(key.remainingUsd) } : null,
    totals: { calls: n(totals.calls), costUsd: n(totals.costUsd), errors: n(totals.errors) },
    byDay: arr(b.byDay)
      .map(obj)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(s(d.date)))
      .map((d) => ({ date: s(d.date), calls: n(d.calls), costUsd: n(d.costUsd) })),
    byTask: arr(b.byTask)
      .map(obj)
      .map((t) => ({
        task: s(t.task, 60) || "other",
        model: s(t.model) || "unknown",
        calls: n(t.calls),
        costUsd: n(t.costUsd),
        avgLatencyMs: n(t.avgLatencyMs),
        errors: n(t.errors),
      })),
    perBook: { avgCostUsd: nOrNull(perBook.avgCostUsd), count: n(perBook.count) },
    perSession: { avgCostUsd: nOrNull(perSession.avgCostUsd), count: n(perSession.count) },
  };
}

export async function fetchUsage(days: number): Promise<UsageResult> {
  if (!ENGINE_API_KEY) return { state: "unconfigured" };
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/usage?days=${Math.max(1, Math.min(365, Math.round(days)))}`, {
      headers: { authorization: `Bearer ${ENGINE_API_KEY}`, accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { state: "unreachable" };
  }
  if (res.status === 404 || res.status === 405) {
    await res.body?.cancel().catch(() => undefined);
    return { state: "unsupported" };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { state: "error", status: res.status };
  }
  try {
    return { state: "ok", usage: parseUsage(await res.json()) };
  } catch {
    return { state: "error", status: res.status };
  }
}
