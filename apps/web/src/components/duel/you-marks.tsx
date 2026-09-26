"use client";

import type { Stance } from "@for-the-people/core/client";
import Link from "next/link";
import { Oval } from "@/components/oval";
import type { KeyVoteDuelRow } from "@/lib/duel";

/**
 * The voter's own marks on Vote Duel. Answers exist only on the device, so the Duel loads this module
 * after hydration and keeps it out of the page's first-load JavaScript.
 */

/**
 * The voter's own answer on a key vote: a filled marigold oval with an ink edge and the word, the way
 * a voter's answer reads everywhere. Where either roll call's Yea worked against the bill, the answer
 * reads as for or against the bill, so it never looks like a match it is not.
 */
export function YouCell({ row, stance }: { row: KeyVoteDuelRow; stance: Stance | undefined }) {
  const reversed = [row.a, row.b].some((side) => side?.rollCall.yeaSupportsMeasure === false);
  if (!stance || stance.choice === "Skip") {
    return (
      <span className="flex min-h-11 items-center gap-2 type-meta text-ink-2">
        <Oval filled={false} dashed size={22} stroke={2.2} animate={false} />
        <span>
          <span className="md:sr-only">You: </span>
          {stance ? "Skipped" : "Not answered"}
        </span>
      </span>
    );
  }
  const word = reversed
    ? stance.choice === "Yea"
      ? "For the bill"
      : "Against the bill"
    : stance.choice;
  return (
    <span className="flex min-h-11 items-center gap-2 text-sm font-bold text-ink">
      <Oval filled tone="current" size={22} stroke={2.2} animate={false} />
      <span>
        <span className="md:sr-only">You: </span>
        {word}
      </span>
    </span>
  );
}

/**
 * The voter's own agreement with both members ("You agree with Collins on 9 of 11 and ..."), or, for a
 * voter with no answers, the way to give some.
 */
export function YouLine({ line, answered }: { line: string | null; answered: boolean }) {
  if (line)
    return (
      <span
        className="inline-flex items-center gap-2"
        data-fact="duel-you"
        data-receipt-id="method-match"
      >
        <Oval filled tone="current" size={22} stroke={2.2} animate={false} />
        {line}
      </span>
    );
  if (answered) return null;
  return (
    <span className="text-base font-normal text-ink-2">
      See how you compare with both.{" "}
      <Link
        href="/swipe"
        className="-my-2 inline-block py-2 font-bold text-ink underline underline-offset-4"
      >
        Answer key votes
      </Link>
    </span>
  );
}
