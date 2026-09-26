"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import { useRanking } from "@/components/swipe/ranking";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import type { CardView } from "@/lib/views";
import { voterActions } from "@/lib/voter-store";

/**
 * Shown once, in place of the next vote, when the fifth Yea or Nay answer lands: the voter has given
 * enough to see a real ranking. The top three portraits assemble 40 ms apart; the one primary action
 * opens Matches, and "Keep going" brings the next vote back. Not a dialog: nothing is blocked.
 */
export function Milestone({
  cards,
  left,
  onContinue,
}: {
  cards: readonly CardView[];
  /** Votes not answered yet. */
  left: number;
  onContinue: () => void;
}) {
  const ranking = useRanking(cards);
  const top = ranking?.ranked.slice(0, 3) ?? [];
  const leaders = ranking?.leaders ?? [];
  const leader = leaders[0];
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The answer button that had focus is gone; the new heading takes it, so keyboard and screen-reader
  // users land on what replaced the vote.
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <section
      aria-labelledby="milestone-heading"
      className="journey-card-in flex flex-col gap-5 rounded-card border border-hairline bg-paper p-5 sm:p-8"
    >
      {top.length > 0 && (
        <ul className="flex" aria-hidden>
          {top.map(({ member }, index) => (
            <li
              key={member.id}
              className="journey-assemble -ml-2 first:ml-0"
              style={{ animationDelay: `${120 + index * 40}ms`, zIndex: top.length - index }}
            >
              <Portrait
                portrait={member.portrait}
                name={member.name}
                sizes="56px"
                decorative
                className="w-14 rounded-control ring-2 ring-paper"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <h2
          id="milestone-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-extrabold tracking-tight text-ink outline-none sm:text-3xl"
        >
          You&rsquo;ve answered enough to see who votes like you
        </h2>
        {leader && leaders.length > 1 ? (
          // Early on many members share the top score; say so rather than crown one of them.
          <p className="text-base text-ink-2" data-fact="match" data-receipt-id="method-match">
            {leaders.length} members are tied for closest so far, including{" "}
            <span className="font-semibold text-ink">{leader.member.name}</span> (agrees with you on{" "}
            {leader.match.agreements} of {leader.match.n} votes). More answers will tell them apart.
          </p>
        ) : leader ? (
          <p className="text-base text-ink-2" data-fact="match" data-receipt-id="method-match">
            Closest so far: <span className="font-semibold text-ink">{leader.member.name}</span>,
            who agrees with you on {leader.match.agreements} of {leader.match.n} votes.
          </p>
        ) : (
          <p className="text-base text-ink-2">
            Your matches are ready, ranked from your answers on this device.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild size="lg">
          <Link href="/matches" onClick={() => voterActions.markMatched()}>
            See my matches
          </Link>
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onContinue}>
          Keep going, {left} left
        </Button>
      </div>
    </section>
  );
}

/**
 * The completion card's number one: portrait, name, and the plain count as the headline, with the
 * weighted percent under it rolling up from 50% (where every score starts) in under half a second.
 */
export function TopMatch({ cards }: { cards: readonly CardView[] }) {
  const ranking = useRanking(cards);
  const leaders = ranking?.leaders ?? [];
  const leader = leaders[0];
  if (!leader || leader.match.score === null) return null;
  const { member, match } = leader;
  const percent = Math.round(leader.match.score * 100);
  return (
    <div className="flex items-center gap-4 rounded-control bg-canvas p-4">
      <Portrait
        portrait={member.portrait}
        name={member.name}
        sizes="64px"
        decorative
        className="w-16 shrink-0 rounded-control"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-ink-2">
          {leaders.length > 1
            ? `Your closest match, tied with ${leaders.length - 1} ${leaders.length === 2 ? "other" : "others"}`
            : "Your closest match"}
        </p>
        <p className="text-base leading-snug font-bold text-ink">
          {member.name}
          <PartyTag party={member.party} className="ml-1.5 align-[1px]" />
        </p>
        <p data-fact="match" data-receipt-id="method-match">
          <span className="block text-xl leading-tight font-extrabold text-ink tabular-nums">
            Agrees on {match.agreements} of {match.n} votes
          </span>
          <span className="text-sm text-ink-2 tabular-nums">
            <QuickRoll from={50} to={percent} suffix="%" /> match
          </span>
        </p>
      </div>
    </div>
  );
}

const NumberFlow = lazy(() => import("@number-flow/react"));
const ROLL = { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

/**
 * A number that rolls once from `from` to `to` in 450 ms (data reveals stay under 500 ms). It renders
 * the true value until the rolling component is ready, and NumberFlow skips the roll under reduced
 * motion.
 */
function QuickRoll({ from, to, suffix }: { from: number; to: number; suffix: string }) {
  const hydrated = useHydrated();
  const plain = (
    <span>
      {to}
      {suffix}
    </span>
  );
  if (!hydrated) return plain;
  return (
    <Suspense fallback={plain}>
      <Roller from={from} to={to} suffix={suffix} />
    </Suspense>
  );
}

function Roller({ from, to, suffix }: { from: number; to: number; suffix: string }) {
  const [value, setValue] = useState(from);
  // Effects here run only once NumberFlow has loaded and mounted, so the roll is always seen.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setValue(to));
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return (
    <NumberFlow
      value={value}
      suffix={suffix}
      transformTiming={ROLL}
      spinTiming={ROLL}
      opacityTiming={{ duration: 200, easing: "ease-out" }}
    />
  );
}
