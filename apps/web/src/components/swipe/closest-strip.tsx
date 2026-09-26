"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import { RollingNumber } from "@/components/rolling-number";
import { useRanking } from "@/components/swipe/ranking";
import type { RankedEntry } from "@/lib/match-groups";
import { cn } from "@/lib/utils";
import type { CardView, MemberView } from "@/lib/views";

type Entry = RankedEntry<MemberView>;

/**
 * One line that links to Matches: the voter's closest member so far, with a small portrait and the
 * plain count ("Agrees on 7 of 8"). On /swipe it sits just above the answers on phones and tablets,
 * where the side rail does not fit; on Home it follows a returning voter's progress line. When the
 * leader changes, the new one slides in 8px as the old one fades, and the count rolls.
 */
export function ClosestStrip({
  cards,
  label,
  minDecided,
  className,
}: {
  cards: readonly CardView[];
  /** "Closest so far" on Swipe, "Your closest match" on Home. */
  label: string;
  /** Yea or Nay answers before the line appears. */
  minDecided: number;
  className?: string;
}) {
  const ranking = useRanking(cards);
  const leaders = ranking && ranking.decided >= minDecided ? ranking.leaders : [];
  const leader = leaders[0] ?? null;
  // The leader on screen, and the one fading out after a change (derived during render, so the swap
  // starts on the same frame as the new count).
  const [shown, setShown] = useState<Entry | null>(leader);
  const [leaving, setLeaving] = useState<Entry | null>(null);
  if (leader?.member.id !== shown?.member.id) {
    setLeaving(shown);
    setShown(leader);
  }
  if (!leader) return null;
  const tied = leaders.length - 1;
  const { match } = leader;
  return (
    <Link
      href="/matches"
      className={cn(
        "group flex min-h-12 items-center gap-3 rounded-control border border-hairline bg-canvas py-1.5 pr-2 pl-1.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink can-hover:border-input",
        className,
      )}
    >
      <span className="relative flex min-w-0 flex-1 items-center">
        {leaving && (
          <span
            key={`out-${leaving.member.id}`}
            aria-hidden
            className="journey-swap-out absolute inset-0 flex min-w-0 items-center gap-2.5"
            onAnimationEnd={() => setLeaving(null)}
          >
            <Leader entry={leaving} label={label} tied={0} />
          </span>
        )}
        <span
          key={leader.member.id}
          className={cn("flex min-w-0 flex-1 items-center gap-2.5", leaving && "journey-swap-in")}
        >
          <Leader entry={leader} label={label} tied={tied} />
        </span>
      </span>
      <span
        className="shrink-0 text-right type-meta text-ink-2"
        data-fact="match"
        data-receipt-id="method-match"
      >
        <span className="sr-only">. </span>
        Agrees on <RollingNumber value={match.agreements} className="font-bold text-ink" /> of{" "}
        <RollingNumber value={match.n} className="font-bold text-ink" />
        <span className="sr-only"> of your votes. See your matches.</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-2" aria-hidden />
    </Link>
  );
}

function Leader({ entry, label, tied }: { entry: Entry; label: string; tied: number }) {
  const { member } = entry;
  return (
    <>
      <Portrait
        portrait={member.portrait}
        name={member.name}
        sizes="32px"
        decorative
        className="w-8 shrink-0 rounded-input"
      />
      <span className="flex min-w-0 flex-col">
        {/* A tie is said up front: the name shown is one of several at the same score. */}
        <span className="type-meta text-ink-2">{tied > 0 ? "Tied for closest" : label}</span>
        <span className="truncate text-sm leading-tight font-bold">
          {member.name}
          <PartyTag party={member.party} className="ml-1.5 align-[1px]" />
          {tied > 0 && (
            <span className="font-normal text-ink-2">
              {" "}
              +{tied}
              <span className="sr-only"> more {tied === 1 ? "member" : "members"} tied</span>
            </span>
          )}
        </span>
      </span>
    </>
  );
}
