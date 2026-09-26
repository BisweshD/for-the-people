"use client";

import { PARTY_NAMES, type StateCode } from "@for-the-people/core/client";
import { SlidersHorizontal, X } from "lucide-react";
import { STATE_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Chamber = "house" | "senate";
export type PartyFilter = "D" | "R" | "I";

export interface FilterValues {
  chamber: Chamber | null;
  party: PartyFilter | null;
  state: StateCode | null;
}

export type FilterChange = Partial<FilterValues>;

/** Each active filter as a chip that removes it. */
export function ActiveFilters({
  values,
  onChange,
  className,
}: {
  values: FilterValues;
  onChange: (next: FilterChange) => void;
  className?: string;
}) {
  const chips: Array<{ key: keyof FilterValues; label: string }> = [];
  if (values.chamber)
    chips.push({ key: "chamber", label: values.chamber === "house" ? "House" : "Senate" });
  if (values.party) chips.push({ key: "party", label: PARTY_NAMES[values.party] });
  if (values.state) chips.push({ key: "state", label: STATE_NAMES[values.state] });
  if (chips.length === 0) return null;
  return (
    <ul className={cn("flex gap-2", className)} aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key} className="shrink-0">
          <button
            type="button"
            onClick={() => onChange({ [chip.key]: null })}
            aria-label={`Remove filter: ${chip.label}`}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-hairline bg-paper pr-3 pl-4 text-sm font-bold text-ink hover:border-ink-3-graphic"
          >
            {chip.label}
            <X className="size-4 text-ink-2" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

export const activeCount = (values: FilterValues): number =>
  Number(Boolean(values.chamber)) + Number(Boolean(values.party)) + Number(Boolean(values.state));

/** The phone's way into the filters: opens the bottom sheet and shows how many are on. */
export function FiltersButton({
  count,
  open,
  onOpen,
}: {
  count: number;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-input bg-paper px-4 text-sm font-bold text-ink can-hover:bg-badge"
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      Filters
      {count > 0 && (
        <span className="inline-grid size-5 place-items-center rounded-full bg-badge px-1 text-sm font-bold text-ink tabular-nums">
          {count}
          <span className="sr-only"> on</span>
        </span>
      )}
    </button>
  );
}
