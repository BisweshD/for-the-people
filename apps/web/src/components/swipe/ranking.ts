"use client";

import { LOW_CONFIDENCE_N } from "@for-the-people/core/client";
import { useMemo } from "react";
import { useMatchData } from "@/components/swipe/match-data";
import { MIN_RANKED } from "@/components/swipe/thresholds";
import { groupTies, type RankedEntry } from "@/lib/match-groups";
import { matchPerson, scoreKeyVotes } from "@/lib/matching";
import type { CardView, MemberView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";

/**
 * The on-device ranking behind the Swipe rail, the phone strip, the fifth-answer pause, the completion
 * card, and Home's closest match. Its own module, so pages load the scoring code only with the pieces
 * that show a ranking.
 */
export interface Ranking {
  /** The voter's Yea or Nay answers. */
  decided: number;
  /** Serving members with a score, best first (the same order as Matches and the Swipe rail). */
  ranked: Array<RankedEntry<MemberView>>;
  /** The top tier: everyone who shows the leader's rounded percent. Empty when nothing ranks yet. */
  leaders: Array<RankedEntry<MemberView>>;
}

/**
 * Ranks serving members against the voter's answers on this device. Null while the data is missing.
 * The bar matches the Swipe rail: a member must share min(5, answers) votes, so a few shared votes
 * never outrank a long record.
 */
export function useRanking(cards: readonly CardView[]): Ranking | null {
  const data = useMatchData();
  const voter = useVoter();
  const keyVotes = useMemo(() => scoreKeyVotes(cards), [cards]);
  return useMemo(() => {
    if (!data) return null;
    const decided = voter.stances.filter((stance) => stance.choice !== "Skip").length;
    if (decided < MIN_RANKED) return { decided, ranked: [], leaders: [] };
    const ranked = data.members
      .filter((member) => member.serving)
      .map((member) => ({
        member,
        match: matchPerson(member.id, voter.stances, keyVotes, data.record),
      }))
      .filter(({ match }) => match.score !== null && match.n >= Math.min(LOW_CONFIDENCE_N, decided))
      .toSorted(
        (a, b) =>
          (b.match.score ?? 0) - (a.match.score ?? 0) ||
          b.match.n - a.match.n ||
          a.member.lastName.localeCompare(b.member.lastName),
      );
    return { decided, ranked, leaders: groupTies(ranked, 1)[0]?.entries ?? [] };
  }, [data, voter.stances, keyVotes]);
}
