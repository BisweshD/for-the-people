/**
 * Where a member's missed-vote share would mislead, and what the profile says instead
 * (/methodology#voting-record).
 */

/**
 * The Speaker of the House in the 119th Congress: Mike Johnson, elected on House roll call 2 of 2025
 * ("Election of the Speaker", https://clerk.house.gov/evs/2025/roll002.xml).
 */
export const SPEAKER = {
  personId: "J000299",
  source: "https://clerk.house.gov/evs/2025/roll002.xml",
} as const;

const NON_VOTING_TITLES = new Set(["Delegate", "Resident Commissioner"]);

export type MissedVotesRule =
  | { kind: "share" }
  | { kind: "speaker"; text: string }
  | { kind: "committee-of-the-whole"; text: string };

export function missedVotesRule(
  member: { id: string; title: string } | undefined,
): MissedVotesRule {
  if (member?.id === SPEAKER.personId) {
    return {
      kind: "speaker",
      text: "Not counted: the Speaker votes at their discretion.",
    };
  }
  if (member && NON_VOTING_TITLES.has(member.title)) {
    return {
      kind: "committee-of-the-whole",
      text: `Not counted as a share: ${member.title === "Delegate" ? "delegates vote" : "the Resident Commissioner votes"} only in the Committee of the Whole.`,
    };
  }
  return { kind: "share" };
}

/**
 * A current Senate term that ends on a date other than January 3 belongs to an appointee to a seat with a
 * special election: they serve until the winner takes office, not until Election Day.
 */
export function appointedUntilSpecial(term: { chamber: "house" | "senate"; end: string }): boolean {
  return term.chamber === "senate" && !term.end.endsWith("-01-03");
}
