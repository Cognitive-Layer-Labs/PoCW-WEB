"use client";

import Form from "next/form";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * GET form for list filters. Choosing an option applies it at once; the search
 * box applies on Enter. Works without JavaScript too (the Apply button).
 */
export function FilterForm({ action, children, className }: { action: string; children: React.ReactNode; className?: string }) {
  return (
    <Form
      action={action}
      role="search"
      className={cn("flex flex-wrap items-end gap-2", className)}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") (e.currentTarget as HTMLFormElement).requestSubmit();
      }}
    >
      {children}
      <button type="submit" className="h-10 rounded-full border border-line-strong px-4 text-sm font-semibold text-paper hover:border-ribbon hover:text-ribbon-soft">
        Apply
      </button>
    </Form>
  );
}

export function SearchField({ name = "q", defaultValue, placeholder, label }: { name?: string; defaultValue: string; placeholder: string; label: string }) {
  return (
    <label className="relative flex min-w-[min(100%,16rem)] flex-1 sm:max-w-[22rem]">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-full border border-line-strong bg-ink-sunk pl-9 pr-4 text-[0.9375rem] text-paper placeholder:text-mute/70 focus:border-ribbon focus:outline-none"
        style={{ fontSize: "max(16px, 0.9375rem)" }}
      />
    </label>
  );
}

export function SelectField({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="px-1 text-xs text-mute">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-10 rounded-full border border-line-strong bg-ink-sunk pl-3.5 pr-8 text-paper focus:border-ribbon focus:outline-none"
        style={{ fontSize: "max(16px, 0.9375rem)" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
