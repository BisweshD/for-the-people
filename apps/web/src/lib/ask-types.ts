import type { Chamber, Party, Position } from "@for-the-people/core/client";
import type { MethodReceiptId } from "./methods";
import type { MemberView, RollCallView } from "./views";

/**
 * What each Ask For The People tool returns to the page. These are full, serializable
 * view models; the model itself sees only compact summaries of them (toModelOutput).
 */

/** A voter-shared match, present only when the voter tapped "Use my answers" for this question. */
export interface SharedMatch {
  score: number | null;
  n: number;
  agreements: number;
}

export interface AskPerson {
  member: MemberView;
  /** Source behind the member's latest term. */
  receiptId: string;
  /** VotePositions on the key-vote roll calls, so the page can compute a match on the device. */
  keyVotePositions: Record<string, Position>;
  sharedMatch: SharedMatch | null;
}

/** A member's VotePosition on one key vote, with the roll call behind it. */
export interface AskSide {
  position: Position;
  rollCall: RollCallView;
  /** Whether the vote supported the measure (polarity applied); null for Present or Not Voting. */
  supportsMeasure: boolean | null;
}

export interface AskVote {
  keyVoteId: string;
  title: string;
  issue: { id: string; label: string };
  side: AskSide | null;
  /** The chamber that held every roll call on this key vote, when it is not the member's own; else null. */
  heldOnlyIn: Chamber | null;
  /** That chamber's decisive roll call, the receipt for "House vote only"; else null. */
  heldOnlyRollCall: RollCallView | null;
}

/** Counts over every key vote getVotes chose for one member, listed or not, so an answer can summarize them. */
export interface VoteTally {
  keyVotes: number;
  yea: number;
  nay: number;
  present: number;
  didNotVote: number;
  /** Key votes held only in the other chamber, which the member could not vote on. */
  otherChamberOnly: number;
  /** Key votes in the member's chamber with no VotePosition for them (not serving then). */
  noRecordedVote: number;
}

export interface FindPeopleOutput {
  people: AskPerson[];
}

export interface MemberRecordView {
  chamber: Chamber;
  partyUnityVotes: number;
  partyUnityEligible: number;
  partyUnityShare: string;
  missedVotes: number;
  eligibleVotes: number;
  missedShare: string;
  firstVoteDate: string | null;
  lastVoteDate: string | null;
}

export interface GetPersonOutput {
  person: AskPerson | null;
  record: MemberRecordView | null;
}

export interface GetVotesOutput {
  person: AskPerson | null;
  issue: { id: string; label: string } | null;
  /** The key votes listed: all of them, unless the model asked for fewer. */
  votes: AskVote[];
  tally: VoteTally;
}

export interface AskKeyVote {
  id: string;
  title: string;
  issue: { id: string; label: string };
  whatItDoes: string;
  yeaMeans: string;
  rollCalls: RollCallView[];
}

export interface KeyVotesOutput {
  issue: { id: string; label: string } | null;
  keyVotes: AskKeyVote[];
}

export interface PartyTallyView {
  party: Party;
  yea: number;
  nay: number;
  present: number;
  notVoting: number;
}

export interface RollCallOutput {
  rollCall: RollCallView | null;
  measure: { id: string; label: string; title: string } | null;
  byParty: PartyTallyView[];
}

export interface AskMeasure {
  id: string;
  label: string;
  title: string;
  becameLaw: boolean;
  latestAction: string;
  latestActionDate: string;
  receiptId: string;
  crsSummary: { text: string; date: string; sourceId: string } | null;
  rollCalls: RollCallView[];
}

export interface MeasureOutput {
  measures: AskMeasure[];
}

export interface CompareRow {
  keyVoteId: string;
  title: string;
  a: AskSide | null;
  b: AskSide | null;
  /** True when both took the same side on the measure; null when either has no Yea or Nay. */
  sameSide: boolean | null;
}

export interface CompareOutput {
  a: AskPerson | null;
  b: AskPerson | null;
  rows: CompareRow[];
  /** Key votes where both members voted Yea or Nay. */
  shared: number;
  /** Of those, how many they took the same side on. */
  same: number;
}

export interface MoneyOutput {
  person: AskPerson | null;
  cycle: number;
  status: "no-record" | "found";
  summaries: Array<{
    financeCommitteeId: string;
    receipts: number;
    individual: number;
    pacs: number;
    cashOnHand: number;
    asOf: string;
    sourceId: string;
  }>;
}

export interface MyRepresentativesOutput {
  status: "no-location" | "found" | "none-found";
  districtIds: string[];
  people: AskPerson[];
}

export interface MethodOutput {
  id: MethodReceiptId;
  title: string;
  summary: string;
  href: string;
}
