"use client";

import { Table2 } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { AgreementOval } from "@/components/agreement-glyph";
import { Button } from "@/components/ui/button";
import type { DuelView } from "@/lib/duel";
import { cn } from "@/lib/utils";

const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthLabel = (month: string): string => MONTH.format(new Date(`${month}-15T12:00:00Z`));

/** The same numbers as a table, loaded when the reader asks for it. */
const DuelTimelineTable = lazy(() =>
  import("@/components/duel/duel-timeline-table").then((module) => ({
    default: module.DuelTimelineTable,
  })),
);

/** The chart's height in pixels (h-24); the tallest month fills it. */
const BAR_HEIGHT = 96;

/**
 * When two members agree and when they split: one column per month, the month's shared votes stacked
 * agreed (bottom) and split (top), tallest month at full height. The month with the most splits is
 * labelled directly. After hydration the columns rise with the meter above; reduced motion keeps
 * them still. A table view carries the same numbers.
 */
export function DuelTimeline({
  months,
  animate,
}: {
  months: DuelView["months"];
  /** Rise once after hydration, with the meter; false on the server and under reduced motion. */
  animate: boolean;
}) {
  const ids = useId();
  const [table, setTable] = useState(false);
  if (months.length < 2) return null;
  const tallest = Math.max(...months.map((bin) => bin.agreed + bin.split), 1);
  const peak = months.reduce((best, bin) => (bin.split > best.split ? bin : best), months[0]!);
  const first = monthLabel(months[0]!.month);
  const last = monthLabel(months.at(-1)!.month);
  const summary =
    peak.split > 0
      ? `Shared votes by month, ${first} to ${last}. The most splits came in ${monthLabel(peak.month)}: ${peak.split} of ${peak.agreed + peak.split}.`
      : `Shared votes by month, ${first} to ${last}. They never split.`;

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={`${ids}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption id={`${ids}-title`} className="type-meta font-bold text-ink-2">
          Month by month
        </figcaption>
        <Button
          type="button"
          variant="outline"
          aria-pressed={table}
          onClick={() => setTable((current) => !current)}
        >
          <Table2 className="size-4" aria-hidden />
          View as table
        </Button>
      </div>
      {table ? (
        <Suspense fallback={<div className="h-80" />}>
          <DuelTimelineTable months={months} summary={summary} monthLabel={monthLabel} />
        </Suspense>
      ) : (
        <>
          <div role="img" aria-label={summary} className="flex h-24 items-end gap-[2px] sm:gap-1">
            {months.map((bin, index) => (
              <div
                key={bin.month}
                className={cn(
                  "flex min-w-0 flex-1 origin-bottom flex-col gap-px rounded-t-[2px]",
                  bin.month === peak.month &&
                    peak.split > 0 &&
                    "outline-2 outline-offset-2 outline-ink",
                  animate && "animate-bar-rise",
                )}
                style={animate ? { animationDelay: `${120 + index * 20}ms` } : undefined}
              >
                {bin.split > 0 && (
                  <div
                    className="rounded-t-[2px] bg-split"
                    style={{ height: `${(bin.split / tallest) * BAR_HEIGHT}px` }}
                  />
                )}
                {bin.agreed > 0 && (
                  <div
                    className={cn("bg-agree", bin.split === 0 && "rounded-t-[2px]")}
                    style={{ height: `${(bin.agreed / tallest) * BAR_HEIGHT}px` }}
                  />
                )}
              </div>
            ))}
          </div>
          <div
            className="relative flex h-5 justify-between type-meta text-ink-2 tabular-nums"
            aria-hidden
          >
            <span>{first}</span>
            {months.map((bin, index) =>
              index > 0 && index < months.length - 1 && bin.month.endsWith("-01") ? (
                <span
                  key={bin.month}
                  className="absolute top-0 border-l border-hairline pl-1"
                  style={{ left: `${(index / months.length) * 100}%` }}
                >
                  {bin.month.slice(0, 4)}
                </span>
              ) : null,
            )}
            <span>{last}</span>
          </div>
          <p className="flex items-start gap-2 text-sm text-ink tabular-nums" aria-hidden>
            {peak.split > 0 ? (
              <>
                <span className="mt-0.5 shrink-0">
                  <AgreementOval agree={false} size={18} />
                </span>
                <span>
                  <span className="font-bold">Most splits in {monthLabel(peak.month)}:</span>{" "}
                  {peak.split} of {peak.agreed + peak.split} shared votes (outlined)
                </span>
              </>
            ) : (
              <span>They never split.</span>
            )}
          </p>
        </>
      )}
    </figure>
  );
}
