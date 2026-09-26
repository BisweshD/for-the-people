"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useVoter } from "@/lib/voter-store";

/** Election-page pieces that depend on this device: the way back to the state picker and the next step. */

export const STATE_SELECT_ID = "election-state";

/**
 * Scrolls back to the countdown card and puts focus on its state picker, ready to choose. Shown where
 * the key dates would be until a state is chosen.
 */
export function ChooseStateLink() {
  const reduce = useReducedMotion();
  return (
    <Button asChild variant="outline" size="lg">
      <a
        href="#election-card"
        onClick={(event) => {
          const picker = document.getElementById(STATE_SELECT_ID);
          if (!picker) return;
          event.preventDefault();
          document
            .getElementById("election-card")
            ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
          picker.focus({ preventScroll: true });
        }}
      >
        Choose your state
      </a>
    </Button>
  );
}

/**
 * The closing next step, worded for where this voter is: a first visit is asked to answer a few votes;
 * a voter with answers is sent to the matches they already have. A text link, underlined in ink like
 * the page's other links: the page's one ink button is "Check your registration" at the top. The server
 * and the first client render show the first-visit wording; answers are read only after hydration.
 */
export function MatchesStep() {
  const voter = useVoter();
  const hydrated = useHydrated();
  const answered = hydrated ? voter.stances.filter((stance) => stance.choice !== "Skip").length : 0;
  const className =
    "inline-flex min-h-11 w-fit items-center text-base font-semibold text-ink underline underline-offset-4 hover:decoration-2";
  if (answered > 0)
    return (
      <>
        <p className="text-base text-ink-2">
          Your members of Congress and 2026 candidates, matched to your {answered}{" "}
          {answered === 1 ? "answer" : "answers"}, with the official record behind every one.
        </p>
        <Link href="/matches" className={className}>
          See your matches
        </Link>
      </>
    );
  return (
    <>
      <p className="text-base text-ink-2">
        Answer a few real votes, then see how your members of Congress and 2026 candidates match
        you, with the official record behind every answer.
      </p>
      <Link href="/swipe" className={className}>
        Answer key votes
      </Link>
    </>
  );
}
