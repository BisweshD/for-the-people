"use client";

import { daysUntil, useDaysUntilElection } from "@/hooks/use-days-until-election";

export { daysUntil };

/**
 * Days until Election Day, counted on the visitor's own calendar. It renders only after hydration
 * (the server snapshot is null), so a prerendered page never shows a stale count. The line keeps its
 * height while empty, so nothing shifts when the number arrives.
 */

export function Countdown({ date }: { date: string }) {
  const days = useDaysUntilElection(date);

  return (
    <p className="flex min-h-16 flex-wrap items-baseline gap-x-3 gap-y-1 md:min-h-[4.5rem]">
      {days === null ? null : days > 1 ? (
        <>
          <span className="inline-block origin-bottom-left animate-figure-in text-6xl leading-none font-extrabold tracking-tight text-ink tabular-nums motion-reduce:animate-none md:text-7xl">
            {days}
          </span>{" "}
          <span className="text-xl font-bold text-ink md:text-2xl">days until Election Day</span>
        </>
      ) : (
        <span className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          {days === 1
            ? "Election Day is tomorrow"
            : days === 0
              ? "Election Day is today"
              : "Election Day has passed"}
        </span>
      )}
    </p>
  );
}
