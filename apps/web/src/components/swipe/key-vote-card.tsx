"use client";

import { Info, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { IssueIcon } from "@/components/issue-icon";
import { CardReceipt } from "@/components/swipe/card-receipt";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CardView } from "@/lib/views";

/** The content of one swipe card. Layout and motion live in SwipeDeck. */
export function KeyVoteCard({
  card,
  position,
  total,
  compact = false,
  showPosition = compact,
  onAsk,
}: {
  card: CardView;
  position: number;
  total: number;
  /** The home page hero: the summary is clamped to three lines and the context waits behind "Read the full description". */
  compact?: boolean;
  /** "3 of 20" in the header. The home hero drops it once a "continue" line says where you are. */
  showPosition?: boolean;
  /** Opens "Ask about this bill"; left out when no model is configured. */
  onAsk?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const short = compact && !expanded;
  return (
    <article className="flex flex-1 flex-col gap-4" aria-labelledby={`${card.id}-title`}>
      <header data-card-header className="flex items-center justify-between gap-3">
        <Badge icon={<IssueIcon name={card.issue.icon} />}>{card.issue.label}</Badge>
        {/* On /swipe the progress row above already counts; the home hero has no progress row. */}
        {showPosition && (
          <span className="type-meta text-ink-2">
            {position} of {total}
          </span>
        )}
      </header>
      <h2
        id={`${card.id}-title`}
        tabIndex={-1}
        className={cn(
          "leading-tight font-bold tracking-tight text-ink outline-none",
          // A question is a sentence: it wraps like one (pretty, not balanced) and steps down a size on
          // phones so the Yea and Nay meanings stay near the top of the card.
          card.card.question
            ? "text-[21px] text-pretty sm:text-2xl md:text-[28px]"
            : "text-2xl text-balance sm:text-3xl",
        )}
      >
        {card.card.question ?? card.card.title}
      </h2>
      {/* Under a question, the bill numbers say which measure it is; the official short titles are left
          to the bill page, since some are persuasive names. */}
      {card.card.question && card.measures.length > 0 && (
        <p className="-mt-2 text-sm text-ink-3">
          {card.measures.map((measure) => measure.label).join(" and ")}
        </p>
      )}
      {/* What each answer means comes right after the question: it is what the voter decides on. */}
      <dl
        className={cn(
          "grid gap-3 rounded-control bg-canvas px-4 py-3",
          card.card.nayMeans && "grid-cols-2",
        )}
      >
        <div>
          <dt className="text-sm text-ink-2">Yea (yes) means</dt>
          <dd className="text-base font-semibold text-ink">{card.card.yeaMeans}</dd>
        </div>
        {card.card.nayMeans && (
          <div>
            <dt className="text-sm text-ink-2">Nay (no) means</dt>
            <dd className="text-base font-semibold text-ink">{card.card.nayMeans}</dd>
          </div>
        )}
      </dl>
      {!compact && (
        <div className="-mt-2 md:hidden">
          <CardReceipt card={card} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p
          id={`${card.id}-summary`}
          className={cn(
            "text-base text-ink-2",
            short && "line-clamp-3",
            // On /swipe phones the summary stops at four lines so the card stays short; the button under it opens it.
            !compact && !expanded && "max-sm:line-clamp-4",
          )}
        >
          {card.card.whatItDoes}
        </p>
        {(compact || !expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${card.id}-summary`}
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              "inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline underline-offset-4",
              !compact && "sm:hidden",
            )}
          >
            {expanded ? "Show less" : "Read the full description"}
          </button>
        )}
      </div>
      {!short && (
        <p className="flex gap-2 text-sm text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          <span>{card.card.context}</span>
        </p>
      )}
      {onAsk && (
        <button
          type="button"
          onClick={onAsk}
          aria-haspopup="dialog"
          className="-my-2 inline-flex min-h-11 items-center gap-2 self-start rounded-control text-sm font-semibold text-ink underline underline-offset-4"
        >
          <MessageCircleQuestion className="size-4 shrink-0" aria-hidden />
          Not sure? Ask about this bill
        </button>
      )}
      {/* The home hero keeps its receipt at the foot of the ballot. On /swipe it sits under the title on
          phones (in the first view, above the pinned answers) and in the answer tray from tablets up. */}
      {compact && (
        <div className="flex flex-col">
          <CardReceipt card={card} />
          {/* Beside the headline on wide screens; on a phone the promise sits with its proof. */}
          <p className="inline-flex items-center gap-2 text-sm text-ink-2 lg:hidden">
            <ShieldCheck className="size-4 shrink-0 text-agree" aria-hidden />
            Every vote is checked against the official roll call.
          </p>
        </div>
      )}
    </article>
  );
}
