const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 0-100 scale with the likely range shaded and the pass bar marked. */
export function ScoreScale({ score, low, high, bar }: { score: number; low: number; high: number; bar: number | null }) {
  const lo = clamp(Math.min(low, score));
  const hi = clamp(Math.max(high, score));
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative mx-2.5 h-12" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-ribbon/35" style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }} />
        {bar !== null && (
          <div className="absolute top-1 h-[calc(100%-0.5rem)] w-0.5 bg-paper/70" style={{ left: `${clamp(bar)}%` }}>
            <span className="absolute -top-1 left-1.5 whitespace-nowrap text-xs text-paper/80">bar {Math.round(bar)}</span>
          </div>
        )}
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-ribbon"
          style={{ left: `${clamp(score)}%` }}
        />
      </div>
      <div className="mx-2.5 flex justify-between text-xs tabular-nums text-mute" aria-hidden="true">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <figcaption className="text-sm text-mute">
        The shaded band is where your score likely sits. It narrows the more consistently you answer.
      </figcaption>
    </figure>
  );
}
