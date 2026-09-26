"use client";

import { useDaysUntilElection } from "@/hooks/use-days-until-election";
import { formatDateLong } from "@/lib/format";
import { ELECTION_DAY } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Days until Election Day, from the one shared count. Holds its space until the number arrives. */
export function ElectionCountdown() {
  const days = useDaysUntilElection();
  if (days !== null && days < 0) return null;
  return (
    <div className="flex items-end gap-4">
      <span
        className={cn(
          "text-6xl leading-none font-extrabold tracking-tight text-ink tabular-nums",
          days === null && "invisible",
        )}
      >
        {days ?? "00"}
      </span>
      <p className="pb-1 text-base text-ink-2">
        <span className="block font-bold text-ink">
          {days === 0
            ? "Election Day is today"
            : days === 1
              ? "day until Election Day"
              : "days until Election Day"}
        </span>
        {formatDateLong(ELECTION_DAY)}
      </p>
    </div>
  );
}
