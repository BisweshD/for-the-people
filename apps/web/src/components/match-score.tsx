"use client";

import { LOW_CONFIDENCE_N, type Match } from "@for-the-people/core/client";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/rolling-number";
import { Badge } from "@/components/ui/badge";
import { useHydrated } from "@/hooks/use-hydrated";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { SCORE_NOTE, whyNotLabel } from "@/lib/score-note";
import { cn } from "@/lib/utils";

/** The count's one roll into place: within the 500 ms allowed for a data reveal. */
const ROLL_MS = 450;

type Phase = "wait" | "zero" | "done";

/**
 * A count that rolls up once from zero when it first appears, and rolls between values after that.
 * It stays hidden for the moment the rolling digits take to load, so it never shows a number it is not
 * about to roll from; with reduced motion it is simply there.
 */
function useRollIn(value: number): { shown: number; animated: boolean; hidden: boolean } {
  const hydrated = useHydrated();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("wait");
  useEffect(() => {
    if (!hydrated || reduce) return;
    let live = true;
    const done = () => live && setPhase("done");
    // If the rolling digits never load, the plain number shows after a beat.
    const fallback = window.setTimeout(done, 600);
    void import("@number-flow/react").then(() => {
      if (!live) return;
      window.clearTimeout(fallback);
      setPhase("zero");
      requestAnimationFrame(() => requestAnimationFrame(done));
    }, done);
    return () => {
      live = false;
      window.clearTimeout(fallback);
    };
  }, [hydrated, reduce]);
  if (reduce) return { shown: value, animated: false, hidden: false };
  return {
    shown: phase === "done" ? value : 0,
    animated: phase === "done",
    hidden: phase === "wait",
  };
}

/** "Agrees on 7 of 8 votes", with the 7 rolling into place once. Screen readers hear the sentence. */
export function AgreeCount({
  match,
  className,
}: {
  match: Pick<Match, "agreements" | "n">;
  className?: string;
}) {
  const roll = useRollIn(match.agreements);
  const votes = match.n === 1 ? "vote" : "votes";
  return (
    <span className={cn("tabular-nums", className)}>
      <span className="sr-only">
        Agrees with you on {match.agreements} of {match.n} {votes}.
      </span>
      <span aria-hidden className={cn(roll.hidden && "invisible")}>
        Agrees on <RollingNumber value={roll.shown} animated={roll.animated} duration={ROLL_MS} />{" "}
        of {match.n} {votes}
      </span>
    </span>
  );
}

/**
 * The match: the plain count leads ("Agrees on 7 of 8 votes") and the weighted score follows, smaller
 * ("Match score 80%"). Only the headline count rolls; lists use CompactScore and stay still.
 */
export function MatchScore({
  match,
  size = "md",
  roll = true,
  className,
}: {
  match: Match | null;
  size?: "md" | "lg" | "xl";
  /** Roll the count into place. Off where many scores sit together. */
  roll?: boolean;
  className?: string;
}) {
  if (!match || match.score === null) {
    return (
      <div
        className={cn("flex flex-col", className)}
        data-fact="match"
        data-receipt-id="method-match"
      >
        <span className={cn("font-bold text-ink-2", size === "md" ? "text-base" : "text-xl")}>
          No shared votes yet
        </span>
        <span className="text-sm text-ink-2">Answer more votes to compare.</span>
      </div>
    );
  }
  const count = cn(
    "leading-tight font-extrabold tracking-tight text-ink",
    size === "xl" ? "text-3xl sm:text-4xl" : size === "lg" ? "text-2xl" : "text-lg",
  );
  const votes = match.n === 1 ? "vote" : "votes";
  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-fact="match"
      data-receipt-id="method-match"
    >
      {roll ? (
        <AgreeCount match={match} className={count} />
      ) : (
        <span className={cn(count, "tabular-nums")}>
          <span className="sr-only">Agrees with you</span>
          <span aria-hidden>Agrees</span> on {match.agreements} of {match.n} {votes}
        </span>
      )}
      <span className={cn("text-ink-2 tabular-nums", size === "md" ? "text-sm" : "text-base")}>
        Match score {Math.round(match.score * 100)}%<span className="sr-only"> (weighted)</span>
      </span>
      {match.n < LOW_CONFIDENCE_N && (
        <Badge>
          Low confidence: only {match.n} shared {votes}
        </Badge>
      )}
    </div>
  );
}

/**
 * The page's one answer to "why is the score not the plain share?": "Why not 88%?" beside a count of
 * 7 of 8, opening the score note. Placed once per page, on its headline match.
 */
export function ScoreWhy({
  match,
  className,
}: {
  match: Pick<Match, "agreements" | "n" | "score">;
  className?: string;
}) {
  return (
    <details className={cn("group text-sm", className)}>
      <summary className="-my-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-bold text-ink underline decoration-ink-3 underline-offset-4 hover:decoration-ink [&::-webkit-details-marker]:hidden">
        {whyNotLabel(match) ?? "Why this score?"}
        <ChevronDown
          className="size-4 text-ink-2 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <p className="max-w-[60ch] pt-1 text-sm text-ink-2">{SCORE_NOTE}</p>
    </details>
  );
}
