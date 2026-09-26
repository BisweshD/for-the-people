import type { Chamber, IssueAreaId, KeyVoteId, PersonId, RollCallId } from "./ids";
import type { Weight } from "./voter";

/** A Match is derived on the device and never stored server-side. */

export interface MatchComparison {
  keyVoteId: KeyVoteId;
  issueArea: IssueAreaId;
  rollCallId: RollCallId;
  chamber: Chamber;
  /** The voter's answer on the measure. */
  voterSupports: boolean;
  /** The member's VotePosition, after polarity (a Yea on a motion to table counts as opposing the measure). */
  memberSupports: boolean;
  agree: boolean;
  weight: Weight;
}

export interface IssueMatch {
  issueArea: IssueAreaId;
  n: number;
  agreements: number;
  score: number | null;
}

export interface Match {
  personId: PersonId;
  /** Null when n = 0: there is no score without shared votes. */
  score: number | null;
  /** Number of key votes where both the voter and the member took a Yea or Nay side. Always shown. */
  n: number;
  agreements: number;
  splits: number;
  byIssue: IssueMatch[];
  comparisons: MatchComparison[];
}

/** Below this many shared votes the UI shows a low-confidence badge. */
export const LOW_CONFIDENCE_N = 5;

/** Pseudo-count of the prior that pulls scores toward 50% when there are few shared votes. */
export const MATCH_PRIOR_K = 2;
