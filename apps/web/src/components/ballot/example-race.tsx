import { PartyTag } from "@/components/party-tag";
import { Badge } from "@/components/ui/badge";
import type { RaceView } from "@/lib/ballot";
import { STATE_NAMES, districtLabel, formatDate, formatDollarsCompact } from "@/lib/format";

/**
 * Before an address: one real race from the ballot data, marked as an example, so a first-time visitor
 * sees what they will get. Two real candidate rows at full contrast, each with its Receipt, and no
 * controls: nothing here can be mistaken for the voter's own ballot. Rendered on the server, so it adds
 * no JavaScript to /ballot.
 */
export function ExampleRace({ race }: { race: RaceView }) {
  const office =
    race.chamber === "senate"
      ? `U.S. Senate, ${STATE_NAMES[race.state]}`
      : `U.S. House, ${districtLabel(race.state, race.district)}`;
  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-card border border-hairline bg-paper">
        <div className="mx-4 mt-3 h-0.5 bg-ink" aria-hidden />
        <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pt-3 pb-3">
          <span
            className="text-base font-bold text-ink"
            data-fact="race"
            data-receipt-id={race.receipt.sourceId}
          >
            {office}
          </span>
          <Badge>Example</Badge>
        </p>
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {race.candidates.slice(0, 2).map((candidate) => (
            <li
              key={candidate.candidacyId}
              className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-3"
              data-fact="candidacy"
              data-receipt-id={candidate.receipt.sourceId}
            >
              {/* An empty ballot oval: not marked. The example has no controls. */}
              <svg viewBox="0 0 32 20" className="w-7" aria-hidden>
                <ellipse
                  cx="16"
                  cy="10"
                  rx="14.6"
                  ry="8.6"
                  className="fill-paper stroke-ink"
                  strokeWidth="2.2"
                />
              </svg>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-base font-bold text-ink">
                  {candidate.name}
                  <PartyTag party={candidate.party} />
                </span>
                <span className="flex flex-wrap gap-x-3 type-meta text-ink-2 tabular-nums">
                  {candidate.partyLabel && <span>{candidate.partyLabel}</span>}
                  {candidate.incumbent && <span>Incumbent</span>}
                  {candidate.finance && (
                    <span data-fact="finance" data-receipt-id={candidate.finance.receipt.sourceId}>
                      Raised {formatDollarsCompact(candidate.finance.receipts)} through{" "}
                      {formatDate(candidate.finance.asOf)}
                    </span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="type-meta text-ink-2">
        <span className="font-bold text-ink">Example.</span> Your address shows your own U.S. Senate
        and House races like this one.
      </figcaption>
    </figure>
  );
}
