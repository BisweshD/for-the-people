"use client";

import type { DuelView } from "@/lib/duel";

/**
 * The Duel timeline's numbers as a table, loaded when the reader asks for it ("View as table"), so the
 * chart's page does not carry it in its first-load JavaScript.
 */
export function DuelTimelineTable({
  months,
  summary,
  monthLabel,
}: {
  months: DuelView["months"];
  summary: string;
  monthLabel: (month: string) => string;
}) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse text-left text-sm tabular-nums">
        <caption className="sr-only">{summary}</caption>
        <thead className="sticky top-0 bg-paper">
          <tr className="border-b border-hairline text-ink-2">
            <th scope="col" className="py-2 pr-3 font-bold">
              Month
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-bold">
              Agreed
            </th>
            <th scope="col" className="py-2 text-right font-bold">
              Split
            </th>
          </tr>
        </thead>
        <tbody>
          {months.map((bin) => (
            <tr key={bin.month} className="border-b border-hairline last:border-0">
              <th scope="row" className="py-1.5 pr-3 font-bold text-ink">
                {monthLabel(bin.month)}
              </th>
              <td className="py-1.5 pr-3 text-right text-ink">{bin.agreed}</td>
              <td className="py-1.5 text-right text-ink">{bin.split}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
