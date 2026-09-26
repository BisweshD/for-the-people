import type { Position } from "../civic";
import { parseRollCallId } from "../base";
import type { Chamber, IssueAreaId, KeyVoteId } from "../ids";
import { MATCH_PRIOR_K, type IssueMatch, type Match, type MatchComparison } from "../match";
import type { Stance, Weight } from "../voter";
import type {
  ComputeMatch,
  MemberRecord,
  ScoreKeyVote,
  ScoreRollCallRef,
  ScoreInput,
} from "./contract";

export type * from "./contract";

/** A stance the voter actually took a side on (Skip is never compared). */
interface DecidedStance {
  keyVoteId: KeyVoteId;
  supports: boolean;
  weight: Weight;
}

/** A roll call the member voted Yea or Nay on, with that vote already corrected for polarity. */
interface MemberVote {
  ref: ScoreRollCallRef;
  chamber: Chamber;
  supports: boolean;
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Orders roll call refs by date, then id, so "later" is well defined even on the same day. */
const compareRefs = (a: ScoreRollCallRef, b: ScoreRollCallRef): number =>
  compareStrings(a.date, b.date) || compareStrings(a.rollCallId, b.rollCallId);

/**
 * Orders stances by answer time. Timestamps may carry different offsets, so they are compared as
 * instants; an exact tie falls back to the stance's content so the winner never depends on input order
 * (by choice in string order, Yea > Skip > Nay, then by the higher weight). Ties only happen with
 * hand-edited data; the device store records one answer per key vote.
 */
const compareStances = (a: Stance, b: Stance): number =>
  Date.parse(a.answeredAt) - Date.parse(b.answeredAt) ||
  compareStrings(a.choice, b.choice) ||
  a.weight - b.weight;

/** Keeps the latest stance per key vote, then drops Skips (a later Skip withdraws an earlier answer). */
function decidedStances(stances: readonly Stance[]): Map<KeyVoteId, DecidedStance> {
  const latest = new Map<KeyVoteId, Stance>();
  for (const stance of stances) {
    const current = latest.get(stance.keyVoteId);
    if (!current || compareStances(stance, current) > 0) latest.set(stance.keyVoteId, stance);
  }
  const decided = new Map<KeyVoteId, DecidedStance>();
  for (const [keyVoteId, stance] of latest) {
    if (stance.choice === "Skip") continue;
    decided.set(keyVoteId, { keyVoteId, supports: stance.choice === "Yea", weight: stance.weight });
  }
  return decided;
}

/**
 * Picks the one roll call per chamber that stands for the card: the decisive one. If a chamber has
 * no decisive flag (or more than one), the latest candidate is used so the choice stays deterministic.
 */
function refsByChamber(keyVote: ScoreKeyVote): Map<Chamber, ScoreRollCallRef> {
  const grouped = new Map<Chamber, ScoreRollCallRef[]>();
  for (const ref of keyVote.rollCallRefs) {
    const { chamber } = parseRollCallId(ref.rollCallId);
    grouped.set(chamber, [...(grouped.get(chamber) ?? []), ref]);
  }
  const chosen = new Map<Chamber, ScoreRollCallRef>();
  for (const [chamber, refs] of grouped) {
    const decisive = refs.filter((ref) => ref.decisive);
    const candidates = (decisive.length > 0 ? decisive : refs).toSorted(compareRefs);
    const pick = candidates.at(-1);
    if (pick) chosen.set(chamber, pick);
  }
  return chosen;
}

const isYeaOrNay = (position: Position | undefined): position is "Yea" | "Nay" =>
  position === "Yea" || position === "Nay";

/**
 * The member's vote on a card: the decisive roll call in each chamber where they voted Yea or Nay.
 * A member who voted in both chambers is judged on the later roll call. Yea counts as support only
 * when `yeaSupportsMeasure`; otherwise the vote is flipped.
 */
function memberVote(keyVote: ScoreKeyVote, member: MemberRecord): MemberVote | null {
  const votes: MemberVote[] = [];
  for (const [chamber, ref] of refsByChamber(keyVote)) {
    const position = member.positions.get(ref.rollCallId);
    if (!isYeaOrNay(position)) continue;
    votes.push({ ref, chamber, supports: (position === "Yea") === ref.yeaSupportsMeasure });
  }
  return votes.toSorted((a, b) => compareRefs(a.ref, b.ref)).at(-1) ?? null;
}

function compare(
  keyVote: ScoreKeyVote,
  stance: DecidedStance,
  member: MemberRecord,
): MatchComparison | null {
  const vote = memberVote(keyVote, member);
  if (!vote) return null;
  return {
    keyVoteId: keyVote.id,
    issueArea: keyVote.issueArea,
    rollCallId: vote.ref.rollCallId,
    chamber: vote.chamber,
    voterSupports: stance.supports,
    memberSupports: vote.supports,
    agree: stance.supports === vote.supports,
    weight: stance.weight,
  };
}

interface Tally {
  n: number;
  agreements: number;
  score: number | null;
}

/** score = (sum w*agree + k/2) / (sum w + k); null when there is nothing to compare. */
function tally(comparisons: readonly MatchComparison[]): Tally {
  let agreedWeight = 0;
  let totalWeight = 0;
  let agreements = 0;
  for (const comparison of comparisons) {
    totalWeight += comparison.weight;
    if (comparison.agree) {
      agreedWeight += comparison.weight;
      agreements += 1;
    }
  }
  const n = comparisons.length;
  const score = n === 0 ? null : (agreedWeight + MATCH_PRIOR_K / 2) / (totalWeight + MATCH_PRIOR_K);
  return { n, agreements, score };
}

function byIssue(comparisons: readonly MatchComparison[]): IssueMatch[] {
  const grouped = new Map<IssueAreaId, MatchComparison[]>();
  for (const comparison of comparisons) {
    grouped.set(comparison.issueArea, [...(grouped.get(comparison.issueArea) ?? []), comparison]);
  }
  return [...grouped]
    .toSorted(([a], [b]) => compareStrings(a, b))
    .map(([issueArea, group]) => ({ issueArea, ...tally(group) }));
}

/** The lightest and heaviest weight a voter can give an answer ("how much I care", 1 to 3). */
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 3;

/**
 * The lowest and highest score a match with `agreements` of `n` shared votes can have under the
 * published formula, over every choice of weights: lowest when each agreement weighs 1 and each split
 * weighs 3, highest the other way round. Null when there is no score (n = 0) or the counts are impossible.
 */
export function matchScoreBounds(
  agreements: number,
  n: number,
): { min: number; max: number } | null {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(agreements)) return null;
  if (n < 1 || agreements < 0 || agreements > n) return null;
  const splits = n - agreements;
  const prior = MATCH_PRIOR_K / 2;
  return {
    min:
      (agreements * MIN_WEIGHT + prior) /
      (agreements * MIN_WEIGHT + splits * MAX_WEIGHT + MATCH_PRIOR_K),
    max:
      (agreements * MAX_WEIGHT + prior) /
      (agreements * MAX_WEIGHT + splits * MIN_WEIGHT + MATCH_PRIOR_K),
  };
}

export const computeMatch: ComputeMatch = ({ stances, keyVotes, member }: ScoreInput): Match => {
  const decided = decidedStances(stances);
  // A card listed twice is compared once (the first listing wins), so n never double-counts.
  const cards = new Map(keyVotes.toReversed().map((keyVote) => [keyVote.id, keyVote] as const));
  const comparisons: MatchComparison[] = [];
  for (const keyVote of cards.values()) {
    const stance = decided.get(keyVote.id);
    const comparison = stance ? compare(keyVote, stance, member) : null;
    if (comparison) comparisons.push(comparison);
  }
  comparisons.sort((a, b) => compareStrings(a.keyVoteId, b.keyVoteId));

  const overall = tally(comparisons);
  return {
    personId: member.personId,
    score: overall.score,
    n: overall.n,
    agreements: overall.agreements,
    splits: overall.n - overall.agreements,
    byIssue: byIssue(comparisons),
    comparisons,
  };
};
