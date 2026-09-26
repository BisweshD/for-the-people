import type { KeyVote, RollCall, RollCallTotals, VotePosition } from "./civic";
import { parseRollCallId } from "./ids";

/** Pure invariant checks for civic data. Each returns a list of violations (empty = holds). */

export function tallyPositions(
  positions: readonly Pick<VotePosition, "position">[],
): RollCallTotals {
  const totals: RollCallTotals = { yea: 0, nay: 0, present: 0, notVoting: 0 };
  for (const { position } of positions) {
    if (position === "Yea") totals.yea++;
    else if (position === "Nay") totals.nay++;
    else if (position === "Present") totals.present++;
    else totals.notVoting++;
  }
  return totals;
}

/** RollCall totals equal its VotePositions. */
export function rollCallTotalsViolations(
  rollCall: RollCall,
  positions: readonly VotePosition[],
): string[] {
  const counted = tallyPositions(positions);
  const violations: string[] = [];
  for (const key of ["yea", "nay", "present", "notVoting"] as const) {
    if (counted[key] !== rollCall.totals[key]) {
      violations.push(
        `${rollCall.id}: totals.${key} is ${rollCall.totals[key]} but positions count ${counted[key]}`,
      );
    }
  }
  const people = new Set<string>();
  for (const position of positions) {
    if (position.rollCallId !== rollCall.id)
      violations.push(`position for ${position.personId} points at ${position.rollCallId}`);
    if (people.has(position.personId))
      violations.push(`${rollCall.id}: duplicate position for ${position.personId}`);
    people.add(position.personId);
  }
  return violations;
}

/**
 * A chamber roster can list a member as Not Voting for a few days after their seat became vacant
 * (for example the Clerk's list on the day after a death). That entry records no act, so it is
 * accepted inside this window; any Yea, Nay, or Present outside a term is still a violation.
 */
export const ROSTER_LAG_DAYS = 3;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Members only have positions on their own chamber's roll calls. `chamberOn` answers which chamber a person sat in on a date. */
export function chamberViolations(
  rollCall: RollCall,
  positions: readonly VotePosition[],
  chamberOn: (personId: string, date: string) => "house" | "senate" | null,
): string[] {
  const served = (position: VotePosition) => {
    if (chamberOn(position.personId, rollCall.date) === rollCall.chamber) return true;
    if (position.position !== "NotVoting") return false;
    return (
      chamberOn(position.personId, addDays(rollCall.date, -ROSTER_LAG_DAYS)) === rollCall.chamber
    );
  };
  return positions
    .filter((position) => !served(position))
    .map(
      (position) =>
        `${rollCall.id}: ${position.personId} was not serving in the ${rollCall.chamber} on ${rollCall.date}`,
    );
}

/** Structural rules every KeyVote must satisfy regardless of status. */
export function keyVoteShapeViolations(keyVote: KeyVote): string[] {
  const violations: string[] = [];
  const byChamber = new Map<string, KeyVote["rollCallRefs"]>();
  for (const ref of keyVote.rollCallRefs) {
    const { chamber } = parseRollCallId(ref.rollCallId);
    byChamber.set(chamber, [...(byChamber.get(chamber) ?? []), ref]);
  }
  for (const [chamber, refs] of byChamber) {
    const decisive = refs.filter((ref) => ref.decisive).length;
    if (decisive !== 1) {
      violations.push(
        `${keyVote.id}: the ${chamber} needs exactly one decisive roll call, found ${decisive}`,
      );
    }
  }
  const ids = keyVote.rollCallRefs.map((ref) => ref.rollCallId);
  if (new Set(ids).size !== ids.length)
    violations.push(`${keyVote.id}: a roll call is listed twice`);
  return violations;
}

/** A KeyVote publishes only when every rollCallRef is verified and has polarity, and two reviewers of different leanings approved it. */
export function keyVotePublishViolations(keyVote: KeyVote): string[] {
  const violations = keyVoteShapeViolations(keyVote);
  if (keyVote.rollCallRefs.length === 0) violations.push(`${keyVote.id}: has no roll calls`);
  for (const ref of keyVote.rollCallRefs) {
    if (ref.verification.status !== "verified") {
      violations.push(
        `${keyVote.id}: ${ref.rollCallId} is ${ref.verification.status}, not verified`,
      );
    }
    if (typeof ref.yeaSupportsMeasure !== "boolean")
      violations.push(`${keyVote.id}: ${ref.rollCallId} has no polarity`);
  }
  const approvals = keyVote.reviewers.filter((reviewer) => reviewer.verdict === "approved");
  // A reviewer with no stated leaning adds a review but not a second viewpoint.
  const leanings = new Set(
    approvals.map((reviewer) => reviewer.leaning).filter((leaning) => leaning !== "unstated"),
  );
  if (leanings.size < 2) {
    violations.push(`${keyVote.id}: needs approval from two reviewers with different leanings`);
  }
  return violations;
}

/** The smaller side must hold at least 15% of the Yea and Nay votes, so the vote tells members apart. */
export function isDivisive(totals: RollCallTotals, minorityShare = 0.15): boolean {
  const cast = totals.yea + totals.nay;
  if (cast === 0) return false;
  return Math.min(totals.yea, totals.nay) / cast >= minorityShare;
}
