import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Hourglass, Minus } from "lucide-react";
import { int, pct, score as fmtScore } from "@/lib/admin-format";
import { cn } from "@/lib/utils";

// ─── Query-string helpers ────────────────────────────────────────────────────

export type Params = Record<string, string | string[] | undefined>;

export function param(params: Params, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** `base` with the current params plus overrides ('' or null drops a key). Page resets unless given. */
export function hrefWith(base: string, params: Params, overrides: Record<string, string | number | null>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s && k !== "page") out.set(k, s);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "") out.delete(k);
    else out.set(k, String(v));
  }
  const qs = out.toString();
  return qs ? `${base}?${qs}` : base;
}

// ─── Page furniture ──────────────────────────────────────────────────────────

export function PageHeader({ title, lede, actions }: { title: string; lede?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-8">
      <div className="min-w-0">
        <h1 className="font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.01em] text-paper sm:text-[2.15rem]">{title}</h1>
        {lede && <p className="mt-1.5 max-w-[46rem] text-mute">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  id,
  title,
  meta,
  children,
  className,
  flush = false,
}: {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding (tables that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0 rounded-xl border border-line bg-ink-sunk/40", className)}>
      <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 sm:px-5", flush ? "pb-3" : "pb-0")}>
        <h2 id={id} className="font-sans text-[0.95rem] font-semibold text-paper">
          {title}
        </h2>
        {meta && <div className="text-[0.8125rem] text-mute">{meta}</div>}
      </div>
      <div className={flush ? "" : "px-4 pb-4 pt-4 sm:px-5 sm:pb-5"}>{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-mute">{children}</p>;
}

export const actionClass =
  "inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-paper transition-colors hover:border-ribbon hover:text-ribbon-soft [&_svg]:size-4";

// ─── KPIs ────────────────────────────────────────────────────────────────────

export type DeltaKind = "count" | "rate" | "score";

/** Change against the previous period: icon + signed number, never colour alone. Up is good for every KPI here. */
export function Delta({ current, previous, kind, period = "the 7 days before" }: { current: number | null; previous: number | null; kind: DeltaKind; period?: string }) {
  if (current === null || previous === null) {
    return <span className="text-mute">No data for {period}</span>;
  }
  const diff = current - previous;
  const flat = kind === "rate" ? Math.abs(diff) < 0.005 : kind === "score" ? Math.abs(diff) < 0.5 : diff === 0;
  const up = !flat && diff > 0;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const amount =
    kind === "rate" ? `${Math.abs(diff * 100).toFixed(0)} pts` : kind === "score" ? Math.abs(diff).toFixed(0) : int(Math.abs(diff));
  const was = kind === "rate" ? pct(previous) : kind === "score" ? fmtScore(previous) : int(previous);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 text-mute">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", flat ? "text-mute" : up ? "text-outcome-mastered" : "text-danger")}>
        <Icon aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{flat ? "No change" : up ? "Up" : "Down"}</span>
        {flat ? "" : `${amount}`}
      </span>
      <span>
        {flat ? "same as" : "from"} {was}
      </span>
    </span>
  );
}

export function KpiTile({ label, value, hint, children, className }: { label: string; value: string; hint?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col bg-ink px-4 py-4 sm:px-5", className)}>
      <p className="text-[0.8125rem] text-mute" title={hint}>
        {label}
      </p>
      <p className="mt-1.5 text-[1.7rem] font-semibold leading-none tracking-[-0.01em] text-paper">{value}</p>
      {children && <p className="mt-2 text-xs leading-snug">{children}</p>}
    </div>
  );
}

/** Tiles separated by hairlines, in one frame. */
export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-xl border border-line bg-line", className)}>{children}</div>;
}

// ─── Status ──────────────────────────────────────────────────────────────────

const STATUS = {
  ready: { label: "Ready", icon: CircleCheck, tone: "text-outcome-mastered" },
  indexing: { label: "Mapping", icon: Hourglass, tone: "text-outcome-attempted" },
  pending: { label: "Waiting", icon: Hourglass, tone: "text-outcome-attempted" },
  failed: { label: "Failed", icon: CircleAlert, tone: "text-danger" },
} as const;

export function BookStatusBadge({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? STATUS.pending;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-paper/90">
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", s.tone)} />
      {s.label}
    </span>
  );
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export const tableClass = "w-full border-collapse text-left text-sm";
export const thClass = "whitespace-nowrap border-b border-line px-3 py-2.5 text-[0.8125rem] font-semibold text-mute first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
export const tdClass = "border-b border-line/60 px-3 py-2.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
export const numClass = "whitespace-nowrap text-right tabular-nums";

/** A sortable column header. Clicking the active column flips the direction. */
export function SortHeader({
  label,
  column,
  sort,
  dir,
  base,
  params,
  numeric = false,
  defaultDir = "desc",
}: {
  label: string;
  column: string;
  sort: string;
  dir: "asc" | "desc";
  base: string;
  params: Params;
  numeric?: boolean;
  defaultDir?: "asc" | "desc";
}) {
  const active = sort === column;
  const next = active ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn(thClass, numeric && "text-right")}>
      <Link
        href={hrefWith(base, params, { sort: column, dir: next })}
        className={cn("inline-flex items-center gap-1 rounded hover:text-paper", active && "text-paper", numeric && "flex-row-reverse")}
      >
        {label}
        <Icon aria-hidden="true" className={cn("size-3.5", active ? "text-ribbon-soft" : "opacity-50")} />
      </Link>
    </th>
  );
}

export function Pagination({ base, params, page, pageSize, total, noun }: { base: string; params: Params; page: number; pageSize: number; total: number; noun: string }) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = "inline-flex h-9 items-center gap-1 rounded-full border border-line-strong px-3 text-sm font-semibold text-paper hover:border-ribbon hover:text-ribbon-soft";
  const off = "inline-flex h-9 items-center gap-1 rounded-full border border-line px-3 text-sm font-semibold text-mute/50";
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-mute sm:px-5">
      <p className="tabular-nums">
        {int(first)}–{int(last)} of {int(total)} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={hrefWith(base, params, { page: page - 1 })} className={link} rel="prev">
              <ChevronLeft aria-hidden="true" className="size-4" /> Previous
            </Link>
          ) : (
            <span className={off} aria-disabled="true">
              <ChevronLeft aria-hidden="true" className="size-4" /> Previous
            </span>
          )}
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={hrefWith(base, params, { page: page + 1 })} className={link} rel="next">
              Next <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span className={off} aria-disabled="true">
              Next <ChevronRight aria-hidden="true" className="size-4" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}

/** Segmented links for a time range or a small set of views. */
export function Segmented({ label, options, value, hrefFor }: { label: string; options: Array<{ value: string; label: string }>; value: string; hrefFor: (v: string) => string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 rounded-full border border-line bg-ink-sunk/60 p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <li key={o.value}>
              <Link
                href={hrefFor(o.value)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-full px-3 text-sm font-semibold transition-colors",
                  active ? "bg-ink-raised text-paper ring-1 ring-line-strong" : "text-mute hover:text-paper"
                )}
              >
                {o.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Name" over "email", for reader cells. */
export function Who({ name, email, href }: { name: string | null; email: string; href?: string }) {
  const title = name?.trim() || "No name";
  return (
    <span className="flex min-w-0 flex-col">
      {href ? (
        <Link href={href} className="truncate font-semibold text-paper hover:text-ribbon-soft hover:underline">
          {title}
        </Link>
      ) : (
        <span className="truncate font-semibold text-paper">{title}</span>
      )}
      <span className="truncate text-[0.8125rem] text-mute">{email}</span>
    </span>
  );
}

export function updatesLabel(v: boolean | null): string {
  return v === null ? "Not asked" : v ? "Yes" : "No";
}
