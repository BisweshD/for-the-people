"use client";

import { computeMatch, type Match, type Position, type Stance } from "@for-the-people/core/client";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AgreementStrip } from "@/components/agreement-strip";
import { MatchScore } from "@/components/match-score";
import { AnswerMark } from "@/components/oval";
import { AgreementGlyph } from "@/components/agreement-glyph";
import { Button } from "@/components/ui/button";
import { RecordStrip, stripVotes } from "@/components/profile/record-strip";
import { PositionGlyph } from "@/components/rollcall/position-cell";
import { ReceiptSheet } from "@/components/receipt/receipt-sheet";
import { MatchShareButton } from "@/components/share/match-share-button";
import { CARD_METHOD, rollCallReceipt } from "@/components/swipe/card-receipt";
import { chamberName, formatDate } from "@/lib/format";
import { scoreKeyVotes } from "@/lib/matching";
import { cn } from "@/lib/utils";
import type { CardView, RollCallView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";

const POSITION_TEXT: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "Did not vote",
};

interface Props {
  personId: string;
  name: string;
  cards: CardView[];
  /** This member's VotePositions on key-vote roll calls, by roll call id. */
  positions: Record<string, Position>;
}

function useMemberMatch({ personId, cards, positions }: Omit<Props, "name">): {
  match: Match;
  stances: readonly Stance[];
} {
  const voter = useVoter();
  const match = useMemo(
    () =>
      computeMatch({
        stances: voter.stances,
        keyVotes: scoreKeyVotes(cards),
        member: { personId, positions: new Map(Object.entries(positions)) },
      }),
    [voter.stances, cards, personId, positions],
  );
  return { match, stances: voter.stances };
}

const lastName = (name: string) => name.split(" ").at(-1) ?? name;

/**
 * The member's VotePosition on each key vote, beside the voter's own Stance. The record strip leads
 * ("Agrees on 9 of 11 votes", one column per shared vote); then the votes where the two differ, then
 * where they agree, each with its count; the rest wait in a collapsed list.
 */
export function MemberKeyVotes({ personId, name, cards, positions }: Props) {
  const { match, stances } = useMemberMatch({ personId, cards, positions });
  const [receipt, setReceipt] = useState<RollCallView | null>(null);
  const [showRest, setShowRest] = useState(false);
  const byCard = new Map(stances.map((stance) => [stance.keyVoteId, stance]));
  const answers = new Map(
    stances.flatMap((stance) =>
      stance.choice === "Skip" ? [] : [[stance.keyVoteId, stance.choice] as const],
    ),
  );
  const compared = new Map(
    match.comparisons.map((comparison) => [comparison.keyVoteId, comparison]),
  );
  const differ = cards.filter((card) => compared.get(card.id)?.agree === false);
  const agree = cards.filter((card) => compared.get(card.id)?.agree === true);
  const rest = cards.filter((card) => !compared.has(card.id));
  const showAgreement = compared.size > 0;

  const member = lastName(name);
  // From tablet up the title takes the room (at least half the row at 1440) and the two answers sit
  // in fixed right columns, named once in a header row; phones name each answer in its cell.
  const columns = cn(
    "grid gap-x-3 md:items-center",
    showAgreement
      ? "md:grid-cols-[5rem_minmax(0,1fr)_6.5rem_6.5rem]"
      : "md:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem]",
  );

  const header = (
    <div
      aria-hidden
      className={cn(
        columns,
        "hidden border-b border-hairline px-4 py-2.5 text-sm font-bold text-ink-2 sm:px-5 md:grid",
      )}
    >
      {showAgreement && <span />}
      <span>Key vote</span>
      <span>{member}</span>
      <span>You</span>
    </div>
  );

  const row = (card: CardView) => {
    const comparison = compared.get(card.id);
    const voted = card.rollCalls.filter((rollCall) => positions[rollCall.id]);
    const rollCall =
      voted.find((candidate) => candidate.id === comparison?.rollCallId) ??
      voted.find((candidate) => candidate.decisive) ??
      voted[0];
    const position = rollCall ? positions[rollCall.id] : undefined;
    const stance = byCard.get(card.id);
    const side = stance && stance.choice !== "Skip" ? stance.choice : null;
    return (
      <li key={card.id} className={cn(columns, "gap-y-2 px-4 py-4 sm:px-5")}>
        {showAgreement && (
          <span className="flex items-center text-sm">
            {comparison && (
              <AgreementGlyph agree={comparison.agree} size={22} className="font-bold">
                {comparison.agree ? "Agrees" : "Differs"}
              </AgreementGlyph>
            )}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-bold text-ink">{card.card.title}</p>
          <p className="text-sm text-ink-2">{card.issue.label}</p>
          {rollCall && (
            <button
              type="button"
              onClick={() => setReceipt(rollCall)}
              // A 44px target drawn by padding, so the line keeps its place under the title.
              className="-my-3 w-fit py-3 text-left text-sm text-ink-2"
            >
              <span className="font-bold text-ink">Receipt:</span>{" "}
              <span className="tabular-nums underline decoration-hairline underline-offset-4">
                {chamberName(rollCall.chamber)} roll call {rollCall.number},{" "}
                <span className="whitespace-nowrap">{formatDate(rollCall.date)}</span>
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 md:contents">
          {rollCall && position ? (
            <span
              className="inline-flex min-h-11 items-center gap-2 text-sm"
              data-fact="vote-position"
              data-receipt-id={rollCall.receipt.sourceId}
            >
              <PositionGlyph position={position} />
              <span className="font-bold text-ink">
                <span className="md:sr-only">{member}: </span>
                {POSITION_TEXT[position]}
              </span>
            </span>
          ) : (
            <span className="inline-flex min-h-11 items-center text-sm text-ink-2">
              <span className="md:sr-only">{member}:&nbsp;</span>No recorded vote
            </span>
          )}
          {/* The voter's own answer: a marigold oval and the word, as on Swipe and Compare. */}
          <AnswerMark
            side={side}
            who="You"
            empty={stance ? "Skipped" : "Not answered"}
            className="min-h-11"
          />
        </div>
      </li>
    );
  };

  const group = (id: string, title: string, list: CardView[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-2">
        <h3 id={id} className="text-lg font-bold text-ink tabular-nums">
          {title} <span className="font-normal text-ink-2">({list.length})</span>
        </h3>
        <div className="rounded-card bg-paper">
          {header}
          <ul aria-labelledby={id} className="flex flex-col divide-y divide-hairline">
            {list.map(row)}
          </ul>
        </div>
      </div>
    );

  return (
    <>
      {showAgreement ? (
        <div className="flex flex-col gap-6">
          <RecordStrip
            match={match}
            votes={stripVotes(match, cards, positions, answers)}
            member={member}
          />
          <div
            role="group"
            aria-label="Votes compared with your answers"
            className="flex flex-col gap-6"
          >
            {group("votes-differ", `Where you and ${member} differ`, differ)}
            {group("votes-agree", "Where you agree", agree)}
          </div>
          {rest.length > 0 && (
            <div className="rounded-card bg-paper">
              <button
                type="button"
                aria-expanded={showRest}
                aria-controls="other-key-votes"
                onClick={() => setShowRest((value) => !value)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-bold text-ink sm:px-5"
              >
                {rest.length} more key {rest.length === 1 ? "vote" : "votes"} you have not compared
                <ChevronDown
                  className={cn("size-5 shrink-0 transition-transform", showRest && "rotate-180")}
                  aria-hidden
                />
              </button>
              {showRest && (
                <div id="other-key-votes" className="border-t border-hairline">
                  {header}
                  <ul className="flex flex-col divide-y divide-hairline">{rest.map(row)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-card bg-paper">
          {header}
          <ul className="flex flex-col divide-y divide-hairline">{cards.map(row)}</ul>
        </div>
      )}
      <ReceiptSheet
        open={receipt !== null}
        onOpenChange={(open) => !open && setReceipt(null)}
        subject={`${name}'s vote`}
        items={receipt ? [rollCallReceipt(receipt)] : []}
        method={`${CARD_METHOD} The member's vote is copied from the same official roll call.`}
      />
    </>
  );
}

/**
 * "Your match", computed on the device from the voter's own answers. A sticky bar above the tab bar
 * on phones, a card in the side rail on wider screens. The count leads; the score follows.
 */
export function YourMatchCard({
  personId,
  name,
  cards,
  positions,
  office,
}: Props & { office?: { chamber: "house" | "senate"; title: string } }) {
  const shareMember = { id: personId, name, chamber: office?.chamber, title: office?.title };
  const { match, stances } = useMemberMatch({ personId, cards, positions });
  const answered = stances.some((stance) => stance.choice !== "Skip");
  const differs = match.comparisons.filter((comparison) => !comparison.agree).length;
  // The phone bar is narrow, so its button says less; the card from 768px names the whole action.
  const jump = (short: boolean) => (
    <Button asChild className={short ? "px-4" : undefined}>
      <a href="#key-votes">
        {short ? "See votes" : differs > 0 ? "See where you differ" : "See the votes"}
      </a>
    </Button>
  );
  if (!answered) {
    return (
      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
        <p className="text-sm text-ink-2 md:text-base">
          Answer a few votes to see how often you agree with {lastName(name)}.
        </p>
        <Button asChild variant="outline">
          <Link href="/swipe">Start</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 md:hidden">
        {match.score === null ? (
          <p className="flex min-w-0 flex-col">
            <span className="text-sm font-bold text-ink-2">Your match</span>
            <span className="text-sm font-bold text-ink-2">No shared votes yet</span>
          </p>
        ) : (
          // The count leads, as on Matches; the score sits under it.
          <p
            className="flex min-w-0 flex-col gap-0.5 tabular-nums"
            data-fact="match"
            data-receipt-id="method-match"
          >
            <span className="text-base leading-tight font-extrabold whitespace-nowrap text-ink">
              <span className="sr-only">Your match: </span>
              Agrees on {match.agreements} of {match.n}
              <span className="sr-only">{` ${match.n === 1 ? "vote" : "votes"}`}</span>
            </span>
            <span className="text-sm leading-tight whitespace-nowrap text-ink-2">
              Match score {Math.round(match.score * 100)}%
              <span className="sr-only"> (weighted)</span>
            </span>
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <MatchShareButton member={shareMember} match={match} iconOnly />
          {match.n > 0 && jump(true)}
        </div>
      </div>
      {/* Below the name on tablets (score left, actions right); the side rail's column from 1024. */}
      <div className="hidden gap-4 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end lg:flex lg:flex-col lg:items-stretch">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-bold text-ink-2">Your match with {lastName(name)}</p>
          <MatchScore match={match} size="lg" />
          <AgreementStrip comparisons={match.comparisons} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {match.n > 0 && jump(false)}
          <MatchShareButton member={shareMember} match={match} label="Share" />
        </div>
      </div>
    </>
  );
}
