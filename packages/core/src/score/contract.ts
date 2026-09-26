import type { Position } from "../civic";
import type { IssueAreaId, KeyVoteId, PersonId, RollCallId } from "../ids";
import type { Match } from "../match";
import type { Stance } from "../voter";

/**
 * Score engine contract.
 *
 * - Compare only where the voter chose Yea/Nay and the member voted Yea/Nay on a roll call from
 *   their own chamber mapped to that key vote.
 * - Polarity: flip the member's vote when `yeaSupportsMeasure` is false.
 * - Several roll calls in one chamber: use the one flagged decisive.
 * - A member with Yea/Nay positions in both chambers for one card (served in both): use the later roll call.
 * - agree in {0,1}; w = voter weight (1-3); score = (sum w*agree + k*0.5) / (sum w + k), k = 2.
 * - n = 0 means no score (null).
 * - Duplicate stances for one key vote: the latest answeredAt wins.
 * - Stances for key votes not in `keyVotes` are ignored.
 */

export interface ScoreRollCallRef {
  rollCallId: RollCallId;
  /** ISO date of the roll call, used only to break the served-in-both-chambers tie. */
  date: string;
  yeaSupportsMeasure: boolean;
  decisive: boolean;
}

export interface ScoreKeyVote {
  id: KeyVoteId;
  issueArea: IssueAreaId;
  rollCallRefs: readonly ScoreRollCallRef[];
}

export interface MemberRecord {
  personId: PersonId;
  /** The member's VotePositions, by roll call. A member only has positions in the chamber they sat in. */
  positions: ReadonlyMap<RollCallId, Position>;
}

export interface ScoreInput {
  stances: readonly Stance[];
  keyVotes: readonly ScoreKeyVote[];
  member: MemberRecord;
}

export type ComputeMatch = (input: ScoreInput) => Match;
