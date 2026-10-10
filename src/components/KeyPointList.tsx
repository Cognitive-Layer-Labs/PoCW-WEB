import { Check, X } from "lucide-react";
import { KEY_POINT_LABEL, type KeyPoint } from "@/lib/keypoints";
import { cn } from "@/lib/utils";

/** A half-filled disk (◐), for "partly". Sized and coloured like a lucide icon. */
export function HalfDisk({ className, ring = false }: { className?: string; ring?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {ring && <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.5" />}
      <path d={ring ? "M12 2.5a9.5 9.5 0 0 0 0 19Z" : "M12 4a8 8 0 0 0 0 16Z"} fill="currentColor" />
    </svg>
  );
}

const ICON = {
  covered: { Icon: Check, tone: "border-outcome-mastered/60 text-outcome-mastered" },
  partial: { Icon: HalfDisk, tone: "border-outcome-attempted/60 text-outcome-attempted" },
  missing: { Icon: X, tone: "border-line-strong text-mute" },
} as const;

/** Checklist of key points: each has its own shape (tick, half circle, cross) and a spoken label, not colour alone. */
export function KeyPointList({ points, className }: { points: KeyPoint[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {points.map((p, i) => {
        const { Icon, tone } = ICON[p.status];
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className={cn("mt-[0.15em] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", tone)} aria-hidden="true">
              {p.status === "partial" ? <HalfDisk className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={cn("min-w-0", p.status === "missing" ? "text-paper/75" : "text-paper/90")}>
              <span className="sr-only">{KEY_POINT_LABEL[p.status]}: </span>
              {p.point}
              {p.status === "partial" && <span className="text-mute"> (partly)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
