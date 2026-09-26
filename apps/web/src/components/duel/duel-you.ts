import { computeMatch, type Match, type Position, type Stance } from "@for-the-people/core/client";
import { scoreKeyVotes } from "@/lib/matching";
import type { CardView } from "@/lib/views";

/**
 * The voter's line for two members, from the same match engine as Matches (computeMatch) run on the
 * key-vote cards and each member's VotePositions. Vote Duel loads this module after hydration, only for
 * a voter with answers, so the engine stays out of the page's first-load JavaScript.
 */
export function voterLine(
  names: [string, string],
  cards: readonly CardView[],
  stances: readonly Stance[],
  members: [
    { id: string; positions: Record<string, Position> },
    { id: string; positions: Record<string, Position> },
  ],
): string {
  const keyVotes = scoreKeyVotes(cards);
  const [a, b] = members.map((member) =>
    computeMatch({
      stances,
      keyVotes,
      member: { personId: member.id, positions: new Map(Object.entries(member.positions)) },
    }),
  );
  return youAgreeLine(names, [a!, b!]);
}

type Counts = Pick<Match, "n" | "agreements">;

/**
 * The voter's own agreement with each member, from the same match engine as Matches (computeMatch):
 * key votes where the voter chose Yea or Nay and the member voted Yea or Nay. A member with no such
 * vote gets no count, since "0 of 0" would read as a disagreement.
 */
export function youAgreeLine(names: [string, string], [a, b]: [Counts, Counts]): string {
  const count = (name: string, match: Counts) => `${name} on ${match.agreements} of ${match.n}`;
  if (a.n > 0 && b.n > 0) return `You agree with ${count(names[0], a)} and ${count(names[1], b)}`;
  if (a.n > 0 || b.n > 0) {
    const [match, name, other] = a.n > 0 ? [a, names[0], names[1]] : [b, names[1], names[0]];
    return `You agree with ${count(name, match)}. ${other} voted on none of the key votes you answered`;
  }
  return `Neither ${names[0]} nor ${names[1]} voted on the key votes you answered`;
}
