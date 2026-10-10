/**
 * In-memory sliding-window rate limit, per key (e.g. "search:<userId>"). One server process, so
 * memory is enough; a restart simply resets the windows.
 */

const globalForRate = globalThis as unknown as { __bookmapRate?: Map<string, number[]> };
const hits: Map<string, number[]> = (globalForRate.__bookmapRate ??= new Map<string, number[]>());

/** Records a hit. Returns 0 when allowed, else the seconds to wait. */
export function rateLimit(key: string, limit: number, windowMs = 60_000): number {
  const t = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => at > t - windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
  }
  recent.push(t);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, list] of hits) if (list[list.length - 1] <= t - windowMs) hits.delete(k);
  }
  return 0;
}
