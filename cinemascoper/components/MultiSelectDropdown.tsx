"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./Icons";

export interface MultiSelectOption {
  id: string;
  label: string;
}

/**
 * A real dropdown multi-select — Connor's specific complaint about the old
 * "row of toggle chips" filters was that choosing filters felt "a little
 * bit chunky", especially once there are more than a handful of cinemas or
 * formats to pick from. This collapses down to one button showing a short
 * summary ("All cinemas" / "Dendy Newtown" / "3 cinemas") and opens a
 * checklist panel on click, closing on an outside click or Escape — the
 * usual dropdown-multiselect pattern, built by hand rather than pulled in
 * as a dependency (this project has none — see the doc comment on
 * `lib/dateUtils.ts`).
 */
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
}: {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const summary =
    selected.size === 0
      ? allLabel
      : selected.size === 1
        ? (options.find((o) => selected.has(o.id))?.label ?? "1 selected")
        : `${selected.size} selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          selected.size > 0
            ? "border-accent-dim/60 bg-accent-soft text-accent"
            : "border-base-700 bg-base-900 text-base-300 hover:border-base-600 hover:text-base-100"
        }`}
      >
        <span className="text-base-500">{label}:</span>
        <span className="max-w-[10rem] truncate">{summary}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-lg border border-base-700 bg-base-850 p-1.5 shadow-xl">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-base-800"
            >
              Clear ({allLabel})
            </button>
          )}
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-base-500">Nothing to filter by yet.</p>
          ) : (
            options.map((o) => {
              const active = selected.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-base-200 hover:bg-base-800"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      active ? "border-accent-dim bg-accent-soft text-accent" : "border-base-600 text-transparent"
                    }`}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
