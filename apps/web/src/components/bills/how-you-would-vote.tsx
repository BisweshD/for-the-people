"use client";

import { DEFAULT_WEIGHT } from "@for-the-people/core/client";
import Link from "next/link";
import { Oval } from "@/components/oval";
import type { KeyVoteCardView } from "@/lib/bill-views";
import { cn } from "@/lib/utils";
import { useVoter, voterActions } from "@/lib/voter-store";

type Side = "Yea" | "Nay";

/**
 * "How you would vote": the voter's Stance on the key vote behind this bill, answered with the same Yea
 * and Nay ovals as Swipe. Here a filled marigold oval (with its ink edge) means "your choice", and the
 * panel says so in words. The answer stays on this device (voterActions.recordStance).
 */
export function HowYouWouldVote({
  card,
}: {
  card: Pick<KeyVoteCardView, "id" | "title" | "question" | "yeaMeans">;
}) {
  const voter = useVoter();
  const stance = voter.stances.find((candidate) => candidate.keyVoteId === card.id);
  const chosen = stance && stance.choice !== "Skip" ? stance.choice : null;

  const choose = (side: Side) =>
    voterActions.recordStance(card.id, side, stance?.weight ?? DEFAULT_WEIGHT);

  return (
    <div className="flex flex-col gap-5 rounded-card border border-hairline bg-paper p-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-lg leading-snug font-bold text-ink">{card.question ?? card.title}</p>
        <p className="type-meta text-ink-2">
          A Yea vote means: <span className="font-bold text-ink">{card.yeaMeans}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Your answer">
        {(["Nay", "Yea"] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={chosen === side}
            onClick={() => choose(side)}
            className={cn(
              "inline-flex h-14 items-center justify-center gap-3 rounded-control border bg-paper text-base font-bold text-ink transition-[border-color,background-color] active:scale-[0.98]",
              chosen === side ? "border-ink bg-canvas" : "border-hairline hover:border-ink-3",
            )}
          >
            <Oval filled={chosen === side} tone={chosen === side ? "current" : "ink"} size={30} />
            {side}
          </button>
        ))}
      </div>
      <p className="type-meta text-ink-2" aria-live="polite">
        {chosen ? (
          <>
            Saved on this device: you would vote {chosen}.{" "}
            <Link
              href="/matches"
              className="-my-2 inline-block py-2 font-bold text-ink underline underline-offset-4"
            >
              See your matches
            </Link>
          </>
        ) : stance?.choice === "Skip" ? (
          "You skipped this vote. Choose a side to count it in your matches."
        ) : (
          "A filled oval marks your choice. It stays on this device and counts toward your matches."
        )}
      </p>
    </div>
  );
}
