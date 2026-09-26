"use client";

import { PARTY_NAMES, type StateCode } from "@for-the-people/core/client";
import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { FilterChange, FilterValues, PartyFilter } from "@/components/explore/explore-filters";
import { Segmented } from "@/components/segmented";
import { STATE_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATE_OPTIONS = (Object.entries(STATE_NAMES) as Array<[StateCode, string]>).sort((a, b) =>
  a[1].localeCompare(b[1]),
);

const CHAMBERS = [
  { value: "all", label: "Both chambers" },
  { value: "house", label: "House" },
  { value: "senate", label: "Senate" },
] as const;

const PARTIES: ReadonlyArray<{ value: "all" | PartyFilter; label: string }> = [
  { value: "all", label: "All parties" },
  ...(["D", "R", "I"] as const).map((code) => ({ value: code, label: PARTY_NAMES[code] })),
];

const TRACK = "rounded-control border border-input bg-paper p-0.5";
const ITEM =
  "h-11 rounded-control px-3 text-[15px] font-bold whitespace-nowrap text-ink-2 transition-colors duration-150 can-hover:bg-badge can-hover:text-ink data-[state=on]:bg-ink data-[state=on]:text-paper";

/**
 * Chamber, party, and state. Inline on desktop, with the labels read to screen readers only; in the
 * phone sheet, stacked under visible labels. Its own module, loaded only where it shows (the desktop
 * row, or the phone's filter sheet), so a phone's first load does not carry it.
 */
export function FilterControls({
  values,
  onChange,
  layout,
  children,
}: {
  values: FilterValues;
  onChange: (next: FilterChange) => void;
  layout: "inline" | "sheet";
  /** Anything that belongs at the end of the row (the desktop "Clear filters"). */
  children?: ReactNode;
}) {
  const id = useId();
  const sheet = layout === "sheet";
  const label = cn(sheet ? "text-sm font-bold text-ink-2" : "sr-only");
  return (
    <div className={cn("flex", sheet ? "flex-col gap-6" : "flex-wrap items-center gap-3")}>
      <div className="flex flex-col gap-2">
        <span id={`${id}-chamber`} className={label}>
          Chamber
        </span>
        <Segmented
          labelledBy={`${id}-chamber`}
          value={values.chamber ?? "all"}
          options={CHAMBERS}
          onChange={(value) => onChange({ chamber: value === "all" ? null : value })}
          className={cn(TRACK, "gap-0", sheet && "grid grid-cols-3")}
          itemClassName={ITEM}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span id={`${id}-party`} className={label}>
          Party
        </span>
        <Segmented
          labelledBy={`${id}-party`}
          value={values.party ?? "all"}
          options={PARTIES}
          onChange={(value) => onChange({ party: value === "all" ? null : value })}
          className={cn(TRACK, "gap-0", sheet && "grid grid-cols-2")}
          itemClassName={ITEM}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-state`} className={label}>
          State
        </label>
        <span className="relative inline-flex">
          <select
            id={`${id}-state`}
            value={values.state ?? ""}
            onChange={(event) =>
              onChange({ state: event.target.value ? (event.target.value as StateCode) : null })
            }
            className={cn(
              "h-[50px] appearance-none rounded-control border border-input bg-paper pr-11 pl-4 text-[15px] font-bold text-ink can-hover:bg-badge",
              sheet ? "w-full" : "min-w-52",
            )}
          >
            <option value="">All states</option>
            {STATE_OPTIONS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-2"
            aria-hidden
          />
        </span>
      </div>
      {children}
    </div>
  );
}
