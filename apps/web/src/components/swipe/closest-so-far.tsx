"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { MemberRow } from "@/components/member-row";
import { useRanking } from "@/components/swipe/ranking";
import { MIN_RANKED as MIN_ANSWERS } from "@/components/swipe/thresholds";
import { useFlip } from "@/hooks/use-flip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { railGroups, type RailGroup } from "@/lib/match-groups";
import { SCORE_NOTE } from "@/lib/score-note";
import type { CardView, MemberView } from "@/lib/views";

const SHOWN = 3;

/**
 * The swipe page's side rail on wide screens: who is closest so far, re-ranked on the device after
 * every answer, so each answer visibly moves something. Tied members are grouped under one "Tied at"
 * line, as on Matches, and rows glide to their new places. Phones get the one-line ClosestStrip.
 */
export function ClosestSoFar({ cards }: { cards: CardView[] }) {
  const ranking = useRanking(cards);
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  useFlip(listRef, !reduce);
  const decided = ranking?.decided ?? 0;
  // Up to three rows in all; a tie that runs past them is counted instead of listed.
  const shown = useMemo(() => (ranking ? railGroups(ranking.ranked, SHOWN) : []), [ranking]);

  const rows = (entries: RailGroup<MemberView>["rows"]) => (
    <ul className="flex flex-col divide-y divide-hairline">
      {entries.map(({ member, match }) => (
        <li key={member.id} data-flip={member.id} className="bg-canvas">
          <MemberRow
            member={member}
            match={match}
            size="sm"
            office="short"
            className="hover:bg-paper"
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-labelledby="closest-so-far"
      className="flex flex-col gap-3 border-t-2 border-ink pt-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="closest-so-far" className="text-lg font-bold text-ink">
          Closest so far
        </h2>
        <p className="text-sm text-ink-2">
          {decided < MIN_ANSWERS
            ? `Answer ${MIN_ANSWERS - decided} more ${MIN_ANSWERS - decided === 1 ? "vote" : "votes"} to see who votes most like you.`
            : `From your ${decided} Yea or Nay answers. It changes as you go.`}
        </p>
      </div>
      {shown.length > 0 && (
        <div
          ref={listRef}
          className="flex flex-col divide-y divide-hairline border-y border-hairline"
          aria-live="polite"
        >
          {shown.map((group) =>
            group.tie ? (
              // A rule down the left edge spans exactly the tied rows; the group ends in a hairline.
              <div
                key={group.key}
                role="group"
                aria-labelledby={`tie-${group.key}`}
                className="py-2"
              >
                <div className="flex flex-col border-l-2 border-ink-3-graphic pl-2">
                  <p
                    id={`tie-${group.key}`}
                    className="pt-1 pb-1 text-sm font-semibold text-ink-2 tabular-nums"
                    data-fact="match"
                    data-receipt-id="method-match"
                  >
                    Tied at {group.percent}%
                  </p>
                  {rows(group.rows)}
                  {group.more > 0 && (
                    <p className="pt-1 text-sm text-ink-2 tabular-nums">
                      {group.more} more {group.more === 1 ? "member is" : "members are"} tied at{" "}
                      {group.percent}%. More answers will tell them apart.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div key={group.key}>{rows(group.rows)}</div>
            ),
          )}
        </div>
      )}
      {shown.length > 0 && <p className="text-sm text-ink-2">{SCORE_NOTE}</p>}
      {decided > 0 && (
        <div className="flex flex-wrap items-center gap-x-5">
          <Link
            href="/matches"
            className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-ink underline underline-offset-4"
          >
            See all your matches
          </Link>
          {shown.length > 0 && (
            <Link
              href="/methodology#match"
              className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-ink-2 underline underline-offset-4 hover:text-ink"
            >
              How scores work
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
