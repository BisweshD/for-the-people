"use client";

import type { Stance } from "@for-the-people/core/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardReceipt } from "@/components/swipe/card-receipt";
import type { CardView } from "@/lib/views";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The key votes behind the selected issue: each one's title, its bills, its receipt, and the voter's
 * own answer. Loaded only when an issue is picked.
 */
export function IssuePanel({
  label,
  cards,
  stances,
}: {
  label: string;
  cards: CardView[];
  stances: readonly Stance[];
}) {
  const topic = label.toLowerCase();
  const answers = new Map(stances.map((stance) => [stance.keyVoteId, stance.choice]));
  const answered = cards.filter((card) => {
    const choice = answers.get(card.id);
    return choice === "Yea" || choice === "Nay";
  }).length;
  const status =
    cards.length === 0
      ? "No key votes on this issue yet."
      : answered === 0
        ? `Answer ${plural(cards.length, "it", "them")} to rank members on ${topic}.`
        : `You answered ${answered} of ${cards.length}.`;
  return (
    <section aria-labelledby="issue-title" className="overflow-hidden rounded-card bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pt-4 pb-3 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="issue-title" className="text-lg font-bold text-ink">
            Key votes on {topic}
          </h2>
          <p className="text-sm text-ink-2 tabular-nums">{status}</p>
        </div>
        {answered < cards.length && (
          <Button asChild>
            <Link href="/swipe">{answered === 0 ? "Answer key votes" : "Answer the rest"}</Link>
          </Button>
        )}
      </div>
      {cards.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {cards.map((card) => {
            const choice = answers.get(card.id);
            return (
              <li key={card.id} className="flex flex-col px-4 pt-3 pb-1 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base leading-snug font-semibold text-ink">{card.card.title}</p>
                  {choice && choice !== "Skip" && (
                    <span className="shrink-0 rounded-control bg-canvas px-2 py-0.5 text-sm text-ink-2">
                      You: <span className="font-semibold text-ink">{choice}</span>
                    </span>
                  )}
                </div>
                <div className="-ml-2 flex flex-wrap items-center gap-x-1">
                  {card.measures.map((measure) => (
                    <Link
                      key={measure.id}
                      href={`/bills/${measure.id}`}
                      aria-label={`${measure.label}: ${measure.title}`}
                      title={measure.title}
                      className="inline-flex h-11 max-w-full items-center gap-1 rounded-control px-2 text-sm font-semibold text-ink underline decoration-hairline underline-offset-4 can-hover:bg-badge can-hover:decoration-ink"
                    >
                      <span className="whitespace-nowrap">{measure.label}</span>
                      <span className="hidden truncate font-normal text-ink-2 sm:inline">
                        {measure.title}
                      </span>
                    </Link>
                  ))}
                </div>
                <CardReceipt card={card} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
