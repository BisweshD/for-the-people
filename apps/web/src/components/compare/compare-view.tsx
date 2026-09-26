"use client";

import {
  friendCompareFromHash,
  LOW_CONFIDENCE_N,
  type FriendCompare,
  type Match,
  type Stance,
} from "@for-the-people/core/client";
import type { KeyVoteRecord } from "@for-the-people/data/read";
import { ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { IssueIcon } from "@/components/issue-icon";
import { MemberRow } from "@/components/member-row";
import { ANSWER_OVAL, AnswerMark, Oval } from "@/components/oval";
import { CreateFriendCompareLink } from "@/components/share/create-friend-compare-link";
import { Button } from "@/components/ui/button";
import { matchPerson, scoreKeyVotes } from "@/lib/matching";
import { SCORE_NOTE } from "@/lib/score-note";
import { cn } from "@/lib/utils";
import type { CardView, MemberView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";

type Side = "Yea" | "Nay";

interface Row {
  card: CardView;
  friend: Side | null;
  you: Side | null;
  /** True or false when both took a side; null otherwise. */
  agree: boolean | null;
}

const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};

/** The fragment, read on the device only. Null while rendering on the server and hydrating. */
function useHash(): string | null {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => null,
  );
}

/** Friend stances need an answer time to be scored; the link carries none, so one fixed time stands in. */
const LINK_TIME = "2026-01-01T00:00:00.000Z";
const asStances = (compare: FriendCompare): Stance[] =>
  compare.stances.map((stance) => ({ ...stance, answeredAt: LINK_TIME }));

/** The gap between ovals in the "Where you line up" fill, the page's one sequence. */
const STAGGER_MS = 40;
const MEMBERS_SHOWN = 6;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export function CompareView({
  cards,
  record,
  members,
}: {
  cards: CardView[];
  record: KeyVoteRecord;
  members: MemberView[];
}) {
  const hash = useHash();
  const voter = useVoter();
  const friend = useMemo(() => (hash === null ? null : friendCompareFromHash(hash)), [hash]);

  if (hash === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          You and a friend
        </h1>
        <p className="text-base text-ink-2">Reading the answers in this link.</p>
      </div>
    );
  }

  if (!friend) {
    const damaged = hash !== "" && hash !== "#";
    return voter.stances.some((s) => s.choice !== "Skip") ? (
      <SendPreview damaged={damaged} stances={voter.stances} cards={cards} />
    ) : (
      <NoLink damaged={damaged} />
    );
  }

  return <Comparison friend={friend} cards={cards} record={record} members={members} />;
}

const NO_LINK_TEXT =
  "Send a friend a link with your answers. When they open it, they see where the two of you agree, vote by vote.";
const DAMAGED_TEXT =
  "This link is missing its answers or was cut off. Ask your friend to send it again, or send them yours.";

function NoLink({ damaged }: { damaged: boolean }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 rounded-card bg-paper p-6 md:p-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Compare with a friend</h1>
      <p className="text-base text-ink-2">{damaged ? DAMAGED_TEXT : NO_LINK_TEXT}</p>
      <Button asChild size="lg" className="h-12 rounded-control px-6 text-base font-bold">
        <Link href="/swipe">Answer the key votes first</Link>
      </Button>
    </div>
  );
}

/** How many of the voter's own answers the preview shows before "and N more". */
const PREVIEW_ROWS = 4;
/** Key vote, You (oval and word), and the Friend column, which says "Waiting" until they answer. */
const PREVIEW_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] gap-x-3 px-4 sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:px-5";

/**
 * The start of Friend Compare for a voter with answers: a preview of what the friend will see, built
 * from the answers on this device (nothing is sent), then the ways to send the link.
 */
function SendPreview({
  damaged,
  stances,
  cards,
}: {
  damaged: boolean;
  stances: readonly Stance[];
  cards: CardView[];
}) {
  const decided = new Map(
    stances.flatMap((stance) =>
      stance.choice === "Skip" ? [] : [[stance.keyVoteId, stance.choice as Side] as const],
    ),
  );
  const skipped = new Set(stances.map((stance) => stance.keyVoteId)).size - decided.size;
  const rows = cards.filter((card) => decided.has(card.id));
  const shown = rows.slice(0, PREVIEW_ROWS);
  const more = rows.length - shown.length;
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Compare with a friend
        </h1>
        <p className="max-w-[52ch] text-base text-ink-2 md:text-lg">
          {damaged ? DAMAGED_TEXT : NO_LINK_TEXT}
        </p>
        <p className="max-w-[52ch] text-base font-bold text-ink tabular-nums md:text-lg">
          They&rsquo;ll see which of your {decided.size}{" "}
          {decided.size === 1 ? "answer they agree with" : "answers they agree with"}.
        </p>
      </header>

      {/* On a phone the actions come before the preview, so they sit above the fold. */}
      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
        <CreateFriendCompareLink primary />
        <HowItWorks />
      </div>

      <section
        aria-labelledby="preview"
        className="flex flex-col rounded-card bg-paper lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <div className="flex flex-col gap-1 px-4 pt-5 pb-4 sm:px-5">
          {/* The same count as Ask's "Use my 11 answers": the Yea or Nay answers the link carries. */}
          <h2 id="preview" className="text-lg font-bold text-ink tabular-nums">
            Your {decided.size} Yea or Nay {decided.size === 1 ? "answer" : "answers"}
          </h2>
          <p className="text-sm text-ink-2">
            What your friend sees when they open the link, before they answer.
          </p>
        </div>
        <div
          className={cn(
            PREVIEW_COLUMNS,
            "border-y border-hairline py-2 text-sm font-bold text-ink-2",
          )}
          aria-hidden
        >
          <span>Key vote</span>
          <span>You</span>
          <span>Friend</span>
        </div>
        <ul className="flex flex-col divide-y divide-hairline" aria-label="Your answers">
          {shown.map((card) => {
            const side = decided.get(card.id)!;
            return (
              <li key={card.id} className={cn(PREVIEW_COLUMNS, "items-center py-3")}>
                <span className="flex min-w-0 items-start gap-2.5">
                  <IssueIcon
                    name={card.issue.icon}
                    className="mt-0.5 hidden size-5 shrink-0 text-ink-3 sm:block"
                  />
                  <span className="text-[15px] leading-snug font-bold text-ink">
                    {card.card.title}
                  </span>
                </span>
                {/* The voter's own answers: a marigold oval and the word, as on Swipe and You. */}
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                  <Oval filled tone="you" {...ANSWER_OVAL} animate={false} />
                  <span>
                    <span className="sr-only">You: </span>
                    {side}
                  </span>
                </span>
                <span className="text-sm text-ink-2">
                  <span className="sr-only">Friend: </span>Waiting
                </span>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-hairline px-4 py-3 text-sm text-ink-2 tabular-nums sm:px-5">
          {more > 0 ? `And ${more} more. ` : ""}
          {skipped > 0
            ? `Your ${skipped} skipped ${skipped === 1 ? "vote stays" : "votes stay"} off the link. `
            : ""}
          Your friend&rsquo;s column says Waiting until they answer.
        </p>
      </section>
    </div>
  );
}

/** What happens after the link is sent, in order, under the ways to send it. */
function HowItWorks() {
  return (
    <ol className="flex flex-col gap-2 border-t border-hairline pt-5 text-base text-ink-2">
      {[
        "You send the link. Your answers travel inside the link itself.",
        "Your friend answers the same key votes on their own device.",
        "You both see where you agree, vote by vote, and which members match you both.",
      ].map((step, index) => (
        <li key={step} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
          <span className="font-bold text-ink tabular-nums">{index + 1}.</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function Comparison({
  friend,
  cards,
  record,
  members,
}: {
  friend: FriendCompare;
  cards: CardView[];
  record: KeyVoteRecord;
  members: MemberView[];
}) {
  const voter = useVoter();
  const friendStances = useMemo(() => asStances(friend), [friend]);
  const yours = voter.stances;
  const youAnswered = yours.some((stance) => stance.choice !== "Skip");

  const rows: Row[] = useMemo(() => {
    const theirs = new Map(friend.stances.map((stance) => [stance.keyVoteId, stance.choice]));
    const mine = new Map(
      yours.flatMap((stance) =>
        stance.choice === "Skip" ? [] : [[stance.keyVoteId, stance.choice as Side] as const],
      ),
    );
    return cards.map((card) => {
      const a = theirs.get(card.id) ?? null;
      const b = mine.get(card.id) ?? null;
      return { card, friend: a, you: b, agree: a && b ? a === b : null };
    });
  }, [cards, friend, yours]);

  // Votes you both answered first, then those only one of you answered; the rest wait behind a
  // closed disclosure. Each group keeps the key votes' own order.
  const both = rows.filter((row) => row.agree !== null);
  const one = rows.filter((row) => row.agree === null && (row.friend !== null || row.you !== null));
  const neither = rows.filter((row) => row.friend === null && row.you === null);
  const agreed = both.filter((row) => row.agree).length;
  const friendCount = rows.filter((row) => row.friend).length;

  const issues = useMemo(() => {
    const byIssue = new Map<
      string,
      { label: string; icon: string; both: number; agreed: number }
    >();
    for (const row of rows) {
      if (row.agree === null) continue;
      const entry = byIssue.get(row.card.issue.id) ?? {
        label: row.card.issue.label,
        icon: row.card.issue.icon,
        both: 0,
        agreed: 0,
      };
      entry.both += 1;
      if (row.agree) entry.agreed += 1;
      byIssue.set(row.card.issue.id, entry);
    }
    return [...byIssue.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          You and a friend
        </h1>
        <p className="max-w-[68ch] text-base text-ink-2">
          Your friend answered {friendCount} of {plural(cards.length, "key vote")}.
        </p>
        <p className="inline-flex max-w-[68ch] items-start gap-2 text-sm text-ink-2">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Their answers are in this link after the # sign, which browsers never send to a server.
          This page reads them on your device and saves nothing.
        </p>
      </header>

      <section
        aria-labelledby="summary"
        className="flex flex-col gap-4 rounded-card bg-paper p-5 md:p-6"
      >
        <h2 id="summary" className="text-xl font-bold text-ink">
          Where you line up
        </h2>
        {!youAnswered ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base text-ink-2">
              Answer the key votes yourself to see where you and your friend agree. Your answers
              stay on this device.
            </p>
            <Button asChild size="lg" className="h-12 rounded-control px-6 text-base font-bold">
              <Link href="/swipe">Answer key votes</Link>
            </Button>
          </div>
        ) : both.length === 0 ? (
          <p className="text-base text-ink-2">
            You have not both answered the same key vote yet. Answer a few more to compare.
          </p>
        ) : (
          <>
            <p className="text-2xl font-extrabold tracking-tight text-ink tabular-nums md:text-3xl">
              You agree on {agreed} of {plural(both.length, "key vote")} you both answered
            </p>
            {/* The page's one sequence: the ovals fill in turn, 40 ms apart. */}
            <ul className="flex flex-wrap gap-1.5" aria-label="Agreement by key vote">
              {both.map((row, index) => (
                <li
                  key={row.card.id}
                  className={row.agree ? undefined : "animate-oval-in"}
                  style={row.agree ? undefined : { animationDelay: `${index * STAGGER_MS}ms` }}
                >
                  <Oval
                    filled={row.agree === true}
                    tone={row.agree ? "agree" : "split"}
                    checked={row.agree === true}
                    slashed={!row.agree}
                    size={26}
                    animate={false}
                    inkDelayMs={row.agree ? index * STAGGER_MS : undefined}
                    label={`${row.card.card.title}: ${row.agree ? "agree" : "split"}`}
                  />
                </li>
              ))}
            </ul>
            <ul className="grid max-w-3xl gap-x-10 gap-y-2 pt-1 sm:grid-cols-2">
              {issues.map((issue) => (
                <li key={issue.label} className="flex items-center gap-3 text-[15px]">
                  <IssueIcon name={issue.icon} className="size-5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 text-ink">{issue.label}</span>
                  <span className="shrink-0 text-ink-2 tabular-nums">
                    Agree on {issue.agreed} of {issue.both}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="by-card" className="flex flex-col gap-4">
        <h2 id="by-card" className="text-xl font-bold text-ink">
          Key vote by key vote
        </h2>
        {both.length > 0 && (
          <VoteGroup title="You both answered" rows={both} youAnswered={youAnswered} />
        )}
        {one.length > 0 && (
          <VoteGroup
            title={youAnswered ? "Only one of you answered" : "Your friend answered"}
            rows={one}
            youAnswered={youAnswered}
          />
        )}
        {neither.length > 0 && (
          <details className="group rounded-card bg-paper">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 text-base font-bold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-5 [&::-webkit-details-marker]:hidden">
              {youAnswered ? "Neither of you answered" : "Your friend did not answer"}
              <span className="flex items-center gap-2 font-normal text-ink-2 tabular-nums">
                {plural(neither.length, "key vote")}
                <ChevronDown
                  className="size-4 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>
            <div
              className={cn(
                columns(youAnswered),
                "hidden border-t border-hairline px-4 pt-3 text-sm font-bold text-ink-2 sm:px-5 md:grid",
              )}
              aria-hidden
            >
              <span />
              <span className="pl-[30px]">Friend</span>
              {youAnswered && <span className="pl-[30px]">You</span>}
            </div>
            <ul className="flex flex-col divide-y divide-hairline border-t border-hairline md:border-t-0">
              {neither.map((row) => (
                <VoteRow key={row.card.id} row={row} youAnswered={youAnswered} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {youAnswered && (
        <MembersForBoth
          yours={yours}
          friends={friendStances}
          cards={cards}
          record={record}
          members={members}
        />
      )}

      {youAnswered && (
        <section aria-labelledby="send-back" className="flex flex-col gap-3">
          <h2 id="send-back" className="text-xl font-bold text-ink">
            Send yours back
          </h2>
          <CreateFriendCompareLink />
        </section>
      )}
    </div>
  );
}

function VoteGroup({
  title,
  rows,
  youAnswered,
}: {
  title: string;
  rows: Row[];
  youAnswered: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* The group's heading is also the header of its Friend and You columns from 768px. */}
      <div className={cn(columns(youAnswered), "items-end px-4 sm:px-5")}>
        <h3 className="text-base font-bold text-ink-2 tabular-nums">
          {title} <span className="font-normal">({rows.length})</span>
        </h3>
        <span className="hidden pl-[30px] text-sm font-bold text-ink-2 md:block" aria-hidden>
          Friend
        </span>
        {youAnswered && (
          <span className="hidden pl-[30px] text-sm font-bold text-ink-2 md:block" aria-hidden>
            You
          </span>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-hairline rounded-card bg-paper">
        {rows.map((row) => (
          <VoteRow key={row.card.id} row={row} youAnswered={youAnswered} />
        ))}
      </ul>
    </div>
  );
}

/** The key vote, Friend, You, and result columns, shared by the group headings and the rows. */
const columns = (youAnswered: boolean) =>
  cn(
    "grid gap-x-6",
    youAnswered
      ? "md:grid-cols-[minmax(0,1fr)_repeat(2,8.5rem)_5.5rem]"
      : "md:grid-cols-[minmax(0,1fr)_8.5rem]",
  );

function VoteRow({ row, youAnswered }: { row: Row; youAnswered: boolean }) {
  return (
    <li className={cn(columns(youAnswered), "gap-y-3 px-4 py-4 sm:px-5 md:items-center")}>
      <div className="flex min-w-0 items-start gap-3">
        <IssueIcon name={row.card.issue.icon} className="mt-0.5 size-5 shrink-0 text-ink-3" />
        <div className="min-w-0">
          <p className="font-bold text-ink">{row.card.card.title}</p>
          <p className="text-sm text-ink-2">{row.card.issue.label}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-8 md:contents">
        {/* A friend's answers are ink; the voter's own are marigold ("you"). */}
        <AnswerMark who="Friend" side={row.friend} mine={false} />
        {youAnswered && <AnswerMark who="You" side={row.you} />}
        {youAnswered && row.agree !== null && (
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            <Oval
              filled={row.agree}
              tone={row.agree ? "agree" : "split"}
              checked={row.agree === true}
              slashed={!row.agree}
              size={22}
              animate={false}
            />
            <span className={row.agree ? "text-agree" : "text-split"}>
              {row.agree ? "Agree" : "Split"}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}

interface Pair {
  member: MemberView;
  you: Match;
  friend: Match;
}

/** A match in its own column: the plain count first ("7 of 8"), the score under it ("83%"). */
function ScoreCell({ who, match }: { who: string; match: Match }) {
  return (
    <span
      className="flex w-16 flex-col items-end gap-0.5 text-right tabular-nums sm:w-24"
      data-fact="match"
      data-receipt-id="method-match"
    >
      <span className="text-base leading-snug font-bold whitespace-nowrap text-ink">
        <span className="sr-only">{` ${who}: agrees on `}</span>
        {match.agreements} of {match.n}
        <span className="sr-only">{` ${match.n === 1 ? "vote" : "votes"}.`}</span>
      </span>
      <span className="text-sm leading-snug whitespace-nowrap text-ink-2">
        <span className="sr-only">Match score </span>
        {Math.round((match.score ?? 0) * 100)}%<span className="sr-only"> (weighted)</span>
      </span>
    </span>
  );
}

function MembersForBoth({
  yours,
  friends,
  cards,
  record,
  members,
}: {
  yours: readonly Stance[];
  friends: readonly Stance[];
  cards: CardView[];
  record: KeyVoteRecord;
  members: MemberView[];
}) {
  const ranked = useMemo(() => {
    const keyVotes = scoreKeyVotes(cards);
    const all: Pair[] = [];
    for (const member of members) {
      if (!member.serving) continue;
      const you = matchPerson(member.id, yours, keyVotes, record);
      if (you.score === null || you.n < LOW_CONFIDENCE_N) continue;
      const friend = matchPerson(member.id, friends, keyVotes, record);
      if (friend.score === null || friend.n < LOW_CONFIDENCE_N) continue;
      all.push({ member, you, friend });
    }
    const floor = (pair: Pair) => Math.min(pair.you.score!, pair.friend.score!);
    const sum = (pair: Pair) => pair.you.score! + pair.friend.score!;
    const top = all
      .sort(
        (a, b) =>
          floor(b) - floor(a) ||
          sum(b) - sum(a) ||
          a.member.lastName.localeCompare(b.member.lastName),
      )
      .slice(0, MEMBERS_SHOWN);
    // Members who show the same two percents share a rank.
    const shown = (pair: Pair) =>
      `${Math.round(pair.you.score! * 100)}|${Math.round(pair.friend.score! * 100)}`;
    return top.map((pair, index) => ({
      ...pair,
      rank:
        index > 0 && shown(top[index - 1]!) === shown(pair)
          ? top.findIndex((other) => shown(other) === shown(pair)) + 1
          : index + 1,
    }));
  }, [yours, friends, cards, record, members]);

  return (
    <section aria-labelledby="both" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="both" className="text-xl font-bold text-ink">
          Members who match you both
        </h2>
        <p className="text-sm text-ink-2">
          Ranked by the lower of your two scores, among members who share at least{" "}
          {LOW_CONFIDENCE_N} votes with each of you. {SCORE_NOTE}{" "}
          <Link
            href="/methodology#match"
            className="font-bold text-ink underline underline-offset-4"
          >
            How scores work
          </Link>
        </p>
      </div>
      {ranked.length > 0 ? (
        <div className="overflow-hidden rounded-card bg-paper">
          <div
            className="flex items-center justify-end gap-3 border-b border-hairline px-4 py-2.5 text-sm font-bold text-ink-2 sm:px-5"
            aria-hidden
          >
            <span className="w-16 text-right sm:w-24">You</span>
            <span className="w-16 text-right sm:w-24">Friend</span>
          </div>
          <ol className="flex flex-col divide-y divide-hairline">
            {ranked.map(({ member, you, friend, rank }) => (
              <li key={member.id}>
                <MemberRow
                  member={member}
                  rank={rank}
                  trailing={
                    <span className="flex shrink-0 gap-3">
                      <ScoreCell who="You" match={you} />
                      <ScoreCell who="Friend" match={friend} />
                    </span>
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="rounded-card bg-paper p-5 text-base text-ink-2">
          No member shares {LOW_CONFIDENCE_N} votes with both of you yet. Answer a few more votes.
        </p>
      )}
    </section>
  );
}
