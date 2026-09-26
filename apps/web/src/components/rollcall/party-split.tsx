import type { Party } from "@for-the-people/core/client";
import { PartyTag } from "@/components/party-tag";
import { partyPlural } from "@/lib/bill-views";
import { formatInteger } from "@/lib/format";
import type { PartyTally } from "@/lib/seat-layout";

/**
 * How each party voted, as one slim bar per party with its numbers written beside it: Yea filled, Nay
 * hollow, the rest left empty. Every bar is drawn on one scale, the largest party, so lengths compare
 * directly. A picture for the eyes; the totals table beside it carries the same numbers for screen readers.
 */
export function PartySplit({ tallies }: { tallies: readonly PartyTally[] }) {
  const largest = Math.max(1, ...tallies.map((tally) => tally.total));
  const share = (count: number) => `${((count / largest) * 100).toFixed(3)}%`;
  return (
    <ul className="flex flex-col gap-4" aria-hidden>
      {tallies.map((tally) => {
        const rest = [
          tally.present ? `${formatInteger(tally.present)} Present` : null,
          tally.notVoting ? `${formatInteger(tally.notVoting)} not voting` : null,
        ].filter(Boolean);
        return (
          <li key={tally.party} className="flex flex-col gap-1.5">
            <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-2 text-base font-bold text-ink">
                <PartyTag party={tally.party as Party} />
                {partyPlural(tally.party as Party, tally.total)}
              </span>
              <span className="text-base text-ink tabular-nums">
                <span className="font-bold">{formatInteger(tally.yea)}</span> Yea,{" "}
                <span className="font-bold">{formatInteger(tally.nay)}</span> Nay
                {rest.length > 0 && <span className="text-ink-2">, {rest.join(", ")}</span>}
              </span>
            </p>
            <div className="flex h-2.5 gap-[2px]">
              {tally.yea > 0 && (
                <span
                  className="bg-ink first:rounded-l-full last:rounded-r-full"
                  style={{ width: share(tally.yea) }}
                />
              )}
              {tally.nay > 0 && (
                <span
                  className="border-[1.5px] border-ink bg-paper first:rounded-l-full last:rounded-r-full"
                  style={{ width: share(tally.nay) }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
