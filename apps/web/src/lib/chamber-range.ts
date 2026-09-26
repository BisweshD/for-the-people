/**
 * Context for one member's voting-record shares: the range that most members of their chamber fall in
 * ("Most House members: 90% to 97%"). The range holds the middle 80% of members or more (the 10th to
 * the 90th percentile by nearest rank), widened to whole percents (low rounded down, high rounded up),
 * so "most" is always true of the members counted.
 */

export interface ShareRange {
  /** Whole percents. */
  low: number;
  high: number;
}

/** Too few members to speak of "most" of a chamber. */
const MIN_MEMBERS = 10;
/** Float noise from part / whole * 100 must not push a whole percent outward. */
const EPSILON = 1e-9;

export function typicalRange(shares: readonly number[]): ShareRange | null {
  if (shares.length < MIN_MEMBERS) return null;
  const sorted = shares.toSorted((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.ceil(fraction * sorted.length) - 1]!;
  return {
    low: Math.floor(at(0.1) * 100 + EPSILON),
    high: Math.ceil(at(0.9) * 100 - EPSILON),
  };
}

export interface StatsRow {
  personId: string;
  chamber: "house" | "senate";
  eligibleVotes: number;
  missedVotes: number;
  partyUnityEligible: number;
  partyUnityVotes: number;
}

export interface ChamberContext {
  /** Share of party-line votes cast with the member's party. */
  unity: ShareRange | null;
  /** Share of votes missed, among members whose missed votes are counted as a share. */
  missed: ShareRange | null;
}

/**
 * The two ranges for one chamber. `notShare` lists members whose missed votes the profile does not
 * show as a share (the Speaker, delegates), so they never shape the range others are compared with.
 */
export function chamberContext(
  rows: readonly StatsRow[],
  chamber: "house" | "senate",
  notShare: ReadonlySet<string>,
): ChamberContext {
  const inChamber = rows.filter((row) => row.chamber === chamber);
  return {
    unity: typicalRange(
      inChamber
        .filter((row) => row.partyUnityEligible > 0)
        .map((row) => row.partyUnityVotes / row.partyUnityEligible),
    ),
    missed: typicalRange(
      inChamber
        .filter((row) => row.eligibleVotes > 0 && !notShare.has(row.personId))
        .map((row) => row.missedVotes / row.eligibleVotes),
    ),
  };
}

/** "Most House members: 90% to 97%". */
export function rangeLine(chamber: "house" | "senate", range: ShareRange): string {
  const who = chamber === "house" ? "Most House members" : "Most senators";
  return range.low === range.high
    ? `${who}: ${range.low}%`
    : `${who}: ${range.low}% to ${range.high}%`;
}
