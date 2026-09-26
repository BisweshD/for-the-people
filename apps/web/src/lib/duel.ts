import type { Position } from "@for-the-people/core/client";
import type { DuelMonth } from "@for-the-people/data/read/duel";
import type { RollCallReceiptInput } from "@/components/swipe/card-receipt";
import type { CardView, RollCallView } from "./views";

/** Serializable Vote Duel views and the key-vote comparison, computed the same way on server and device. */

export interface DuelRollCallView extends RollCallReceiptInput {
  id: string;
  title: string | null;
  measureId: string | null;
}

export interface DuelSplitView {
  rollCall: DuelRollCallView;
  a: Position;
  b: Position;
}

export interface DuelView {
  aId: string;
  bId: string;
  congress: number;
  shared: number;
  agreed: number;
  split: number;
  bothRecorded: number;
  firstDate: string | null;
  lastDate: string | null;
  splits: DuelSplitView[];
  /** Shared votes by month, oldest first, for the agreement timeline. */
  months: DuelMonth[];
}

export type KeyVoteDuelOutcome = "agree" | "split" | "none";

export interface KeyVoteDuelSide {
  rollCall: RollCallView;
  position: Position;
  /** After polarity: true when this VotePosition supported the measure. Null for Present or Not Voting. */
  supports: boolean | null;
}

export interface KeyVoteDuelRow {
  card: CardView;
  a: KeyVoteDuelSide | null;
  b: KeyVoteDuelSide | null;
  /** True when both sides are on the same roll call (members of the same chamber). */
  sameRollCall: boolean;
  outcome: KeyVoteDuelOutcome;
}

function side(card: CardView, positions: Map<string, Position>): KeyVoteDuelSide | null {
  const voted = card.rollCalls.filter((rollCall) => positions.has(rollCall.id));
  const rollCall = voted.find((candidate) => candidate.decisive) ?? voted[0];
  if (!rollCall) return null;
  const position = positions.get(rollCall.id)!;
  const tookSide = position === "Yea" || position === "Nay";
  return {
    rollCall,
    position,
    supports: tookSide ? (position === "Yea") === rollCall.yeaSupportsMeasure : null,
  };
}

/**
 * Each key-vote card with both members' VotePositions. Members of the same chamber are compared on the
 * same roll call. Members of different chambers are compared on the measure, after each roll call's polarity.
 */
export function keyVoteDuel(
  cards: readonly CardView[],
  a: Map<string, Position>,
  b: Map<string, Position>,
): KeyVoteDuelRow[] {
  return cards.map((card) => {
    const left = side(card, a);
    const right = side(card, b);
    const sameRollCall = Boolean(left && right && left.rollCall.id === right.rollCall.id);
    let outcome: KeyVoteDuelOutcome = "none";
    if (left?.supports != null && right?.supports != null)
      outcome = left.supports === right.supports ? "agree" : "split";
    return { card, a: left, b: right, sameRollCall, outcome };
  });
}
