import type { BallotCandidate } from "./ballot";

const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Alphabetical by last name, then full name: the neutral order. Incumbency and money raised never
 * decide position. For two filings under one name, the one with FEC
 * totals comes first so mergeRepeatFilings keeps it.
 */
export function compareCandidates(a: BallotCandidate, b: BallotCandidate): number {
  return (
    a.person.names.last.localeCompare(b.person.names.last) ||
    a.person.names.full.localeCompare(b.person.names.full) ||
    Number(b.finance !== null) - Number(a.finance !== null) ||
    a.candidacy.id.localeCompare(b.candidacy.id)
  );
}

/**
 * The FEC sometimes holds two statutory filings for one campaign: a re-registration under a new
 * candidate id, sometimes under another form of the name ("Bob Chew" and "Robert Chew"). Within one race,
 * filings with the same full name, or reporting through the same principal campaign committee, are one
 * entry: the first in compareCandidates order is kept.
 */
export function mergeRepeatFilings(candidates: readonly BallotCandidate[]): BallotCandidate[] {
  const names = new Set<string>();
  const committees = new Set<string>();
  return candidates.toSorted(compareCandidates).filter((candidate) => {
    const name = normalizeName(candidate.person.names.full);
    const committee = candidate.finance?.financeCommitteeId;
    if (names.has(name) || (committee && committees.has(committee))) return false;
    names.add(name);
    if (committee) committees.add(committee);
    return true;
  });
}
