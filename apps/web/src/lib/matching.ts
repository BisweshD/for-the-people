import {
  computeMatch,
  type Match,
  type Position,
  type ScoreKeyVote,
  type Stance,
} from "@for-the-people/core/client";
import type { KeyVoteRecord } from "@for-the-people/data/read";
import type { CardView } from "./views";

/** Device-side matching: the voter's stances never leave the browser to be scored. */

export function scoreKeyVotes(cards: readonly CardView[]): ScoreKeyVote[] {
  return cards.map((card) => ({
    id: card.id,
    issueArea: card.issue.id,
    rollCallRefs: card.rollCalls.map((rollCall) => ({
      rollCallId: rollCall.id,
      date: rollCall.date,
      yeaSupportsMeasure: rollCall.yeaSupportsMeasure,
      decisive: rollCall.decisive,
    })),
  }));
}

const DECODE: Record<string, Position> = { Y: "Yea", N: "Nay", P: "Present", V: "NotVoting" };

export function positionsFor(record: KeyVoteRecord, personId: string): Map<string, Position> {
  const codes = record.positions[personId];
  const positions = new Map<string, Position>();
  if (!codes) return positions;
  record.rollCallIds.forEach((id, index) => {
    const position = DECODE[codes[index] ?? "-"];
    if (position) positions.set(id, position);
  });
  return positions;
}

export function matchPerson(
  personId: string,
  stances: readonly Stance[],
  keyVotes: readonly ScoreKeyVote[],
  record: KeyVoteRecord,
): Match {
  return computeMatch({
    stances,
    keyVotes,
    member: { personId, positions: positionsFor(record, personId) },
  });
}

/** Whether a member has any VotePosition on the key-vote roll calls at all. */
export const hasRecord = (record: KeyVoteRecord, personId: string): boolean =>
  Boolean(record.positions[personId]?.replace(/-/g, ""));
