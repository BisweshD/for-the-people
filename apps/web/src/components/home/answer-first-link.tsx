"use client";

import Link from "next/link";
import { useHydrated } from "@/hooks/use-hydrated";
import { useVoter } from "@/lib/voter-store";

/**
 * The line under the home ballot lookup. A first visit is offered all the key votes; a returning voter
 * is offered the ones left, and someone who has answered them all is sent to their matches.
 */
export function AnswerFirstLink({ keyVoteIds }: { keyVoteIds: string[] }) {
  const voter = useVoter();
  const hydrated = useHydrated();
  const answered = hydrated
    ? new Set(voter.stances.map((stance) => stance.keyVoteId))
    : new Set<string>();
  const left = keyVoteIds.filter((id) => !answered.has(id)).length;
  const link = "font-semibold text-ink underline underline-offset-4";
  if (left === 0)
    return (
      <p className="text-base text-ink-2">
        Or{" "}
        <Link href="/matches" className={link}>
          see who votes like you
        </Link>{" "}
        first.
      </p>
    );
  return (
    <p className="text-base text-ink-2">
      Or{" "}
      <Link href="/swipe" className={link}>
        {left === keyVoteIds.length
          ? `answer all ${left} votes`
          : `answer the other ${left} ${left === 1 ? "vote" : "votes"}`}
      </Link>{" "}
      first.
    </p>
  );
}
