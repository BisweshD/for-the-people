"use client";

import type { Match, Position } from "@for-the-people/core/client";
import { Check, X } from "lucide-react";
import { useRef, type CSSProperties } from "react";
import { AgreeCount, ScoreWhy } from "@/components/match-score";
import { Oval } from "@/components/oval";
import { PositionGlyph } from "@/components/rollcall/position-cell";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import type { CardView } from "@/lib/views";

export interface StripVote {
  keyVoteId: string;
  title: string;
  date: string;
  member: Position;
  you: "Yea" | "Nay";
  agree: boolean;
}

/** The compared votes, oldest first, from the match and the member's positions. */
export function stripVotes(
  match: Match,
  cards: readonly CardView[],
  positions: Readonly<Record<string, Position>>,
  answers: ReadonlyMap<string, "Yea" | "Nay">,
): StripVote[] {
  return match.comparisons
    .flatMap((comparison) => {
      const card = cards.find((candidate) => candidate.id === comparison.keyVoteId);
      const rollCall = card?.rollCalls.find((candidate) => candidate.id === comparison.rollCallId);
      const member = positions[comparison.rollCallId];
      const you = answers.get(comparison.keyVoteId);
      if (!card || !rollCall || !member || !you) return [];
      return [
        {
          keyVoteId: card.id,
          title: card.card.title,
          date: rollCall.date,
          member,
          you,
          agree: comparison.agree,
        },
      ];
    })
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.keyVoteId.localeCompare(b.keyVoteId));
}

/** The voter's own answer in the strip: a marigold oval with an ink edge and the answer's letter. */
function YouGlyph({ side }: { side: "Yea" | "Nay" }) {
  return (
    <span className="relative inline-flex" aria-hidden>
      <Oval filled tone="you" size={26} stroke={2.2} animate={false} />
      <span className="absolute inset-0 grid place-items-center text-[11px] leading-none font-extrabold text-ink">
        {side === "Yea" ? "Y" : "N"}
      </span>
    </span>
  );
}

/**
 * The member's record against the voter's, one column per shared key vote: the member's vote on top
 * (the Board's Y/N square), the voter's answer at the bottom (their marigold oval), and between them a
 * check where the two took the same side or a cross where they did not. It shows "agrees on 9 of 11"
 * at a glance. The checks settle in once, left to right, when the strip scrolls into view.
 */
export function RecordStrip({
  match,
  votes,
  member,
}: {
  match: Match;
  votes: readonly StripVote[];
  /** The member's last name. */
  member: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const seen = useInView(ref, { margin: "-10% 0px" });
  if (votes.length === 0) return null;
  return (
    <figure className="flex flex-col gap-4 rounded-card bg-paper p-4 sm:p-5">
      <figcaption className="flex flex-col gap-2">
        <AgreeCount
          match={match}
          className="text-2xl leading-tight font-extrabold tracking-tight text-ink sm:text-3xl"
        />
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <PositionGlyph position="Yea" />
            {member}&rsquo;s vote
          </span>
          <span className="inline-flex items-center gap-1.5">
            <YouGlyph side="Yea" />
            Your answer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4 text-agree" strokeWidth={3} aria-hidden />
            Same side
          </span>
          <span className="inline-flex items-center gap-1.5">
            <X className="size-4 text-split" strokeWidth={3} aria-hidden />
            Different side
          </span>
        </span>
      </figcaption>
      <ol
        ref={ref}
        aria-label={`Oldest first. ${votes.map((vote) => `${vote.title}: ${member} ${vote.member}, you ${vote.you}, ${vote.agree ? "same side" : "different side"}`).join(". ")}.`}
        className="flex flex-wrap gap-x-1 gap-y-3"
      >
        {votes.map((vote, index) => (
          <li
            key={vote.keyVoteId}
            aria-hidden
            title={vote.title}
            className="flex w-7 flex-col items-center gap-1"
          >
            <PositionGlyph position={vote.member} className="size-6 text-xs" />
            <span
              className={cn(
                "grid size-5 place-items-center",
                seen ? "r10-tick" : "motion-safe:opacity-0",
              )}
              style={{ "--i": index } as CSSProperties}
            >
              {vote.agree ? (
                <Check className="size-4 text-agree" strokeWidth={3} />
              ) : (
                <X className="size-4 text-split" strokeWidth={3} />
              )}
            </span>
            <YouGlyph side={vote.you} />
          </li>
        ))}
      </ol>
      <ScoreWhy match={match} />
    </figure>
  );
}
