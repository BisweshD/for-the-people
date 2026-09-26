"use client";

import {
  personIdToSlug,
  type Chamber,
  type Match,
  type Position,
} from "@for-the-people/core/client";
import { BookOpen, ChevronDown, Columns2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { MatchScore } from "@/components/match-score";
import { SCORE_NOTE } from "@/lib/score-note";
import { OfficeText } from "@/components/office-text";
import { AgreementGlyph } from "@/components/agreement-glyph";
import { PositionGlyph } from "@/components/rollcall/position-cell";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import { Badge } from "@/components/ui/badge";
import { RollCallLink } from "@/components/ask/receipts";
import type {
  AskKeyVote,
  AskPerson,
  AskSide,
  AskVote,
  CompareOutput,
  GetPersonOutput,
  MeasureOutput,
  MethodOutput,
  MoneyOutput,
  RollCallOutput,
} from "@/lib/ask-types";
import {
  chamberName,
  formatDate,
  formatDollarsCompact,
  formatInteger,
  formatShare,
} from "@/lib/format";
import type { RollCallView } from "@/lib/views";
import { cn } from "@/lib/utils";

/**
 * The results Ask For The People answers with. Each shows full tool results as a
 * labeled section of the answer (no boxes inside boxes), and every fact carries its receipt.
 */

const POSITION_TEXT: Record<Position, string> = {
  Yea: "Voted Yea",
  Nay: "Voted Nay",
  Present: "Voted Present",
  NotVoting: "Did not vote",
};

/** The vote in the row's right-hand column, beside The Board's cell. */
const POSITION_SHORT_LABEL: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "Did not vote",
};

const POSITION_SHORT: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "did not vote",
};

/** One labeled part of an answer: a small label over a hairline, then the records. */
export function ResultSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 border-t border-hairline pt-4", className)}>
      <h3 className="text-sm font-semibold text-ink-2">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The voter's match with a member, only for a question asked with "Use my answers" on: the same
 * numbers the answer's sentence reads. Otherwise there is no match to show.
 */
function sharedMatch(person: AskPerson): Match | null {
  const shared = person.sharedMatch;
  if (!shared) return null;
  return {
    personId: person.member.id as Match["personId"],
    score: shared.score,
    n: shared.n,
    agreements: shared.agreements,
    splits: shared.n - shared.agreements,
    byIssue: [],
    comparisons: [],
  };
}

/** A member as one row: portrait, name with the party tag beside it, office, and your match. */
function PersonRow({ person }: { person: AskPerson }) {
  const match = sharedMatch(person);
  const { member } = person;
  return (
    <Link
      href={`/people/${personIdToSlug(member.id)}`}
      data-fact="term"
      data-receipt-id={person.receiptId}
      className="-mx-2 grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-control p-2 transition-transform duration-150 hover:bg-accent active:scale-[0.99] sm:grid-cols-[56px_minmax(0,1fr)_auto]"
    >
      <Portrait
        portrait={member.portrait}
        name={member.name}
        sizes="56px"
        className="w-14 rounded-control"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base leading-snug font-bold text-ink">{member.name}</span>
          <PartyTag party={member.party} />
        </span>
        <span className="text-sm text-ink-2">
          <OfficeText member={member} />
        </span>
      </span>
      {match && (
        <MatchScore
          match={match}
          roll={false}
          className="col-start-2 sm:col-start-3 sm:items-end sm:text-right"
        />
      )}
    </Link>
  );
}

export function PeopleList({
  people,
  title,
  empty,
}: {
  people: AskPerson[];
  title: string;
  empty: string;
}) {
  return (
    <ResultSection title={title}>
      {people.length === 0 ? (
        <p className="text-base text-ink-2">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {people.map((person) => (
            <li key={person.member.id}>
              <PersonRow person={person} />
            </li>
          ))}
        </ul>
      )}
      {/* A percent beside a raw count needs the same one-line explanation as every other page. */}
      {people.some((person) => person.sharedMatch) && (
        <p className="text-sm text-ink-2">
          {SCORE_NOTE}{" "}
          <Link
            href="/methodology#match"
            className="font-semibold text-ink underline underline-offset-4"
          >
            How scores work
          </Link>
        </p>
      )}
    </ResultSection>
  );
}

/** A row of figures split by hairlines, each with its label and context line. */
function Figures({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    note?: string;
    fact: string;
    receipt: string;
  }>;
}) {
  return (
    <dl
      className={cn(
        "grid divide-hairline",
        items.length === 3
          ? "grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          : "grid-cols-2 divide-x",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col gap-0.5 py-2 pr-4",
            items.length === 3
              ? "sm:py-0 sm:[&:not(:first-child)]:pl-4"
              : "py-0 [&:not(:first-child)]:pl-4",
          )}
          data-fact={item.fact}
          data-receipt-id={item.receipt}
        >
          <dt className="text-sm text-ink-2">{item.label}</dt>
          <dd className="text-2xl font-extrabold tracking-tight text-ink tabular-nums">
            {item.value}
          </dd>
          {item.note && <dd className="text-sm text-ink-2 tabular-nums">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function MemberRecord({ output }: { output: GetPersonOutput }) {
  const { person, record } = output;
  if (!person)
    return (
      <ResultSection title="Member">
        <p className="text-base text-ink-2">No record yet.</p>
      </ResultSection>
    );
  return (
    <ResultSection title="Member and voting record">
      <PersonRow person={person} />
      {record ? (
        <Figures
          items={[
            {
              label: "Voted with most of their party",
              value: record.partyUnityShare,
              note: `on ${formatInteger(record.partyUnityEligible)} votes where most of each party voted opposite ways`,
              fact: "party-unity",
              receipt: "method-party-unity",
            },
            {
              label: "Missed votes",
              value: record.missedShare,
              note: `${formatInteger(record.missedVotes)} of ${formatInteger(record.eligibleVotes)} ${chamberName(record.chamber)} votes held while in office`,
              fact: "missed-votes",
              receipt: "method-missed-votes",
            },
          ]}
        />
      ) : (
        <p className="text-base text-ink-2">No voting record yet.</p>
      )}
    </ResultSection>
  );
}

/** The key vote, the vote in words, and The Board's cell in a fixed 24 px column at the right edge. */
const VOTE_ROW = "grid grid-cols-[minmax(0,1fr)_24px_2.75rem] items-center gap-x-2.5";

/**
 * A member's vote on one key vote as one tappable receipt row: the title with its roll call under it,
 * then "Nay" and the Board cell. A member's vote is The Board's cell; a filled oval only ever means the
 * voter's own choice.
 */
function VoteRow({ vote, name }: { vote: AskVote; name: string }) {
  const { side } = vote;
  const heldIn = vote.heldOnlyRollCall;
  // A key vote with only the other chamber's roll call: a chip, never "did not vote" (that means Not
  // Voting), and the roll call it was held in as the receipt.
  if (!side && vote.heldOnlyIn && heldIn)
    return (
      <RollCallLink
        rollCall={heldIn}
        subject={vote.title}
        className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-2.5 hover:bg-accent"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-base leading-snug font-medium text-ink-2">{vote.title}</span>
          <span className="text-ink-2 tabular-nums underline decoration-hairline underline-offset-4">
            {chamberName(heldIn.chamber)} roll call {heldIn.number}, {formatDate(heldIn.date)}
          </span>
        </span>
        <Badge className="whitespace-nowrap">{chamberName(vote.heldOnlyIn)} vote only</Badge>
      </RollCallLink>
    );
  if (!side)
    return (
      <div className={cn(VOTE_ROW, "py-2.5")}>
        <span className="flex min-w-0 flex-col">
          <span className="leading-snug font-medium text-ink-2">{vote.title}</span>
          <span className="text-sm text-ink-2">No record yet</span>
        </span>
      </div>
    );
  return (
    <RollCallLink
      rollCall={side.rollCall}
      subject={`${name}'s vote on ${vote.title}`}
      className={cn(VOTE_ROW, "-mx-2 w-[calc(100%+1rem)] px-2 py-2.5 hover:bg-accent")}
    >
      <span className="flex min-w-0 flex-col">
        <span className="sr-only">
          {name}: {POSITION_TEXT[side.position]}.{" "}
        </span>
        <span className="text-base leading-snug font-semibold text-ink">{vote.title}</span>
        {/* ink-2, not ink-3: the line stays readable on the row's hover fill. */}
        <span className="text-ink-2 tabular-nums underline decoration-hairline underline-offset-4">
          {chamberName(side.rollCall.chamber)} roll call {side.rollCall.number},{" "}
          {formatDate(side.rollCall.date)}
        </span>
      </span>
      {/* The Board's cell, then its word ("[N] Nay"), as on profiles, Duel and roll calls. */}
      <span data-position-cell className="flex">
        <PositionGlyph position={side.position} className="size-6 text-xs" />
      </span>
      <span className="font-semibold whitespace-nowrap text-ink" aria-hidden>
        {POSITION_SHORT_LABEL[side.position]}
      </span>
    </RollCallLink>
  );
}

export function VoteList({
  person,
  votes,
  counted,
  issueLabel,
}: {
  person: AskPerson | null;
  votes: AskVote[];
  /** How many key votes the answer counted; more than are listed only when the model asked for fewer. */
  counted: number;
  issueLabel: string | null;
}) {
  const name = person?.member.name ?? "This member";
  // The votes the member cast come first; key votes with no vote from them follow, in order. Key votes
  // held only in the other chamber fold into one closed group per chamber at the end.
  const heldIn = (vote: AskVote): Chamber | null =>
    !vote.side && vote.heldOnlyRollCall ? vote.heldOnlyIn : null;
  const listed = [
    ...votes.filter((vote) => vote.side),
    ...votes.filter((vote) => !vote.side && !heldIn(vote)),
  ];
  const chambers = [...new Set(votes.flatMap((vote) => heldIn(vote) ?? []))];
  return (
    <ResultSection title={issueLabel ? `Key votes on ${issueLabel.toLowerCase()}` : "Key votes"}>
      {votes.length < counted && (
        <p className="text-sm text-ink-2 tabular-nums">
          Showing {votes.length} of the {counted} key votes counted in the answer.
        </p>
      )}
      {votes.length === 0 ? (
        <p className="text-base text-ink-2">No record yet of a key vote on this.</p>
      ) : (
        <div className="flex flex-col divide-y divide-hairline">
          {listed.length > 0 && (
            <ul className="flex flex-col divide-y divide-hairline">
              {listed.map((vote) => (
                <li key={vote.keyVoteId}>
                  <VoteRow vote={vote} name={name} />
                </li>
              ))}
            </ul>
          )}
          {chambers.map((chamber) => (
            <HeldElsewhere
              key={chamber}
              chamber={chamber}
              votes={votes.filter((vote) => heldIn(vote) === chamber)}
              name={name}
            />
          ))}
        </div>
      )}
    </ResultSection>
  );
}

/**
 * Key votes with only the other chamber's roll call, as one closed group: "7 key votes have only a
 * House roll call". Opened, it lists the same rows, each with that roll call as its receipt.
 */
function HeldElsewhere({
  chamber,
  votes,
  name,
}: {
  chamber: Chamber;
  votes: AskVote[];
  name: string;
}) {
  return (
    <details className="group">
      <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-2 py-2.5 text-base font-medium text-ink-2 hover:bg-accent hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="tabular-nums">
          {votes.length} key {votes.length === 1 ? "vote has" : "votes have"} only a{" "}
          {chamberName(chamber)} roll call
        </span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {votes.map((vote) => (
          <li key={vote.keyVoteId}>
            <VoteRow vote={vote} name={name} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function Totals({
  totals,
}: {
  totals: { yea: number; nay: number; present: number; notVoting: number };
}) {
  return (
    <span className="text-sm text-ink-2 tabular-nums">
      {formatInteger(totals.yea)} Yea, {formatInteger(totals.nay)} Nay
      {totals.present ? `, ${formatInteger(totals.present)} Present` : ""},{" "}
      {formatInteger(totals.notVoting)} not voting
    </span>
  );
}

export function KeyVoteList({
  keyVotes,
  issueLabel,
}: {
  keyVotes: AskKeyVote[];
  issueLabel: string | null;
}) {
  return (
    <ResultSection title={issueLabel ? `Key votes on ${issueLabel.toLowerCase()}` : "Key votes"}>
      {keyVotes.length === 0 ? (
        <p className="text-base text-ink-2">No record yet of a key vote on this.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {keyVotes.map((keyVote) => (
            <li key={keyVote.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <p className="font-semibold text-ink">{keyVote.title}</p>
              <p className="max-w-[68ch] text-sm text-ink-2">{keyVote.whatItDoes}</p>
              <ul className="flex flex-col">
                {keyVote.rollCalls.map((rollCall) => (
                  <li key={rollCall.id} className="flex flex-wrap items-center gap-x-3">
                    <RollCallLink rollCall={rollCall} subject={keyVote.title} />
                    <Totals totals={rollCall.totals} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </ResultSection>
  );
}

export function RollCallCard({ output }: { output: RollCallOutput }) {
  const { rollCall, measure, byParty } = output;
  if (!rollCall)
    return (
      <ResultSection title="Roll call">
        <p className="text-base text-ink-2">No record yet of that roll call.</p>
      </ResultSection>
    );
  const subject = measure ? `${measure.label}: ${measure.title}` : rollCall.question;
  return (
    <ResultSection title={`${chamberName(rollCall.chamber)} roll call ${rollCall.number}`}>
      <div className="flex flex-col gap-1">
        {measure && <p className="font-semibold text-ink">{subject}</p>}
        <p className="text-sm text-ink-2">
          {rollCall.question}: {rollCall.result}
        </p>
        <Totals totals={rollCall.totals} />
      </div>
      {byParty.length > 0 && (
        <table className="w-full max-w-md text-sm tabular-nums">
          <caption className="sr-only">Votes by party</caption>
          <thead>
            <tr className="text-left text-ink-2">
              <th scope="col" className="py-1 font-semibold">
                Party
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Yea
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Nay
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Not voting
              </th>
            </tr>
          </thead>
          <tbody>
            {byParty.map((tally) => (
              <tr
                key={tally.party}
                className="border-t border-hairline"
                data-fact="party-tally"
                data-receipt-id={rollCall.receipt.sourceId}
              >
                <td className="py-1.5">
                  <PartyTag party={tally.party} />
                </td>
                <td className="py-1.5 text-right text-ink">{formatInteger(tally.yea)}</td>
                <td className="py-1.5 text-right text-ink">{formatInteger(tally.nay)}</td>
                <td className="py-1.5 text-right text-ink-2">
                  {formatInteger(tally.notVoting + tally.present)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <RollCallLink rollCall={rollCall} subject={subject} />
    </ResultSection>
  );
}

export function MeasureList({ output }: { output: MeasureOutput }) {
  if (output.measures.length === 0)
    return (
      <ResultSection title="Bill">
        <p className="text-base text-ink-2">
          No record yet of a bill by that name in this Congress.
        </p>
      </ResultSection>
    );
  return (
    <>
      {output.measures.map((measure) => (
        <ResultSection key={measure.id} title={measure.label}>
          <div
            className="flex flex-col gap-1"
            data-fact="measure"
            data-receipt-id={measure.receiptId}
          >
            <p className="text-lg leading-snug font-bold text-ink">{measure.title}</p>
            <p className="text-sm text-ink-2 tabular-nums">
              {measure.becameLaw ? "Became law" : "Latest action"}{" "}
              {formatDate(measure.latestActionDate)}
            </p>
          </div>
          {measure.crsSummary ? (
            <div data-fact="crs-summary" data-receipt-id={measure.crsSummary.sourceId}>
              <p className="max-w-[68ch] font-serif text-base leading-relaxed text-ink">
                {measure.crsSummary.text}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                Congressional Research Service summary, {formatDate(measure.crsSummary.date)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-2">No official summary yet.</p>
          )}
          {measure.rollCalls.length > 0 ? (
            <ul className="flex flex-col">
              {measure.rollCalls.map((rollCall) => (
                <li key={rollCall.id} className="flex flex-wrap items-center gap-x-3">
                  <RollCallLink
                    rollCall={rollCall}
                    subject={`${measure.label}: ${measure.title}`}
                  />
                  <span className="text-sm text-ink-2">{rollCall.result}</span>
                  <Totals totals={rollCall.totals} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No recorded vote yet.</p>
          )}
        </ResultSection>
      ))}
    </>
  );
}

function CompareHead({ person }: { person: AskPerson | null }) {
  if (!person) return <p className="text-sm text-ink-2">No record yet</p>;
  return (
    <div
      className="flex min-w-0 items-center gap-3"
      data-fact="term"
      data-receipt-id={person.receiptId}
    >
      <Portrait
        portrait={person.member.portrait}
        name={person.member.name}
        sizes="48px"
        className="w-12 shrink-0 rounded-control"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="leading-snug font-bold text-ink">{person.member.name}</p>
        <PartyTag party={person.member.party} />
      </div>
    </div>
  );
}

/** "Fetterman: Yea" with the ballot oval, the way Vote Duel names each side. */
function NamedSide({ side, who }: { side: AskSide | null; who: string }) {
  if (!side)
    return (
      <span className="inline-flex min-h-6 items-center text-sm text-ink-2">{who}: no vote</span>
    );
  return (
    <span className="inline-flex min-h-6 items-center gap-2 text-sm">
      <PositionGlyph position={side.position} />
      <span className="font-semibold text-ink">
        {who}: {POSITION_SHORT[side.position]}
      </span>
    </span>
  );
}

/** The roll calls behind a compare row: one line when both voted on the same roll call. */
function rowRollCalls(row: CompareOutput["rows"][number]): RollCallView[] {
  const calls = [row.a?.rollCall, row.b?.rollCall].filter(
    (rollCall): rollCall is RollCallView => rollCall !== undefined,
  );
  return calls.filter((rollCall, index) => calls.findIndex((c) => c.id === rollCall.id) === index);
}

export function CompareStrip({ output }: { output: CompareOutput }) {
  const { a, b, shared, same } = output;
  const rows = output.rows.filter((row) => row.a || row.b);
  const unvoted = output.rows.length > rows.length;
  const aWho = a?.member.lastName ?? "First member";
  const bWho = b?.member.lastName ?? "Second member";
  return (
    <ResultSection title="Side by side">
      <div className="grid grid-cols-2 gap-3">
        <CompareHead person={a} />
        <CompareHead person={b} />
      </div>
      <p
        className="text-base text-ink tabular-nums"
        data-fact="compare"
        data-receipt-id="method-compare"
      >
        {shared === 0 ? (
          "No record yet of key votes where both voted Yea or Nay."
        ) : (
          <>
            Took the same side on <strong className="font-extrabold">{same}</strong> of {shared} key
            votes where both voted Yea or Nay.
          </>
        )}
      </p>
      <ul className="flex flex-col divide-y divide-hairline">
        {rows.map((row) => (
          <li key={row.keyVoteId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">{row.title}</p>
              {row.sameSide !== null && (
                <AgreementGlyph agree={row.sameSide} className="shrink-0">
                  {row.sameSide ? "Same side" : "Split"}
                </AgreementGlyph>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <NamedSide side={row.a} who={aWho} />
              <NamedSide side={row.b} who={bWho} />
            </div>
            <div className="-my-1.5 flex flex-wrap gap-x-4">
              {rowRollCalls(row).map((rollCall) => (
                <RollCallLink key={rollCall.id} rollCall={rollCall} subject={row.title} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      {unvoted && (
        <p className="text-sm text-ink-2">
          Key votes neither member has a recorded vote on are not shown.
        </p>
      )}
      {a && b && (
        <Link
          href={`/duel?a=${personIdToSlug(a.member.id)}&b=${personIdToSlug(b.member.id)}`}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
        >
          <Columns2 className="size-4" aria-hidden />
          Open in Vote Duel
        </Link>
      )}
    </ResultSection>
  );
}

export function MoneyMini({ output }: { output: MoneyOutput }) {
  const name = output.person?.member.name;
  return (
    <ResultSection
      title={`Money, ${output.cycle - 1}–${String(output.cycle).slice(2)} reporting period`}
    >
      {output.status === "no-record" ? (
        <p className="text-base text-ink-2">
          No record yet. {name ? `Campaign finance totals for ${name}` : "Campaign finance totals"}{" "}
          from the Federal Election Commission appear here once they are loaded.
        </p>
      ) : (
        output.summaries.map((summary) => (
          <div key={summary.financeCommitteeId} className="flex flex-col gap-2">
            <Figures
              items={[
                {
                  label: "Raised",
                  value: formatDollarsCompact(summary.receipts),
                  fact: "finance",
                  receipt: summary.sourceId,
                },
                {
                  label: "From individuals",
                  value: formatDollarsCompact(summary.individual),
                  fact: "finance",
                  receipt: summary.sourceId,
                },
                {
                  label: `Cash on hand, ${formatDate(summary.asOf)}`,
                  value: formatDollarsCompact(summary.cashOnHand),
                  fact: "finance",
                  receipt: summary.sourceId,
                },
              ]}
            />
            {summary.receipts > 0 && (
              <p className="text-sm text-ink-2 tabular-nums">
                {formatShare(summary.individual, summary.receipts)} of the money raised came from
                individual people.
              </p>
            )}
          </div>
        ))
      )}
    </ResultSection>
  );
}

export function MethodNote({ output }: { output: MethodOutput }) {
  return (
    <ResultSection title="Method">
      <div className="flex flex-col gap-2" data-fact="method" data-receipt-id={output.id}>
        <p className="font-bold text-ink">{output.title}</p>
        <p className="max-w-[68ch] font-serif text-base leading-relaxed text-ink">
          {output.summary}
        </p>
      </div>
      <Link
        href={output.href as `/methodology#${string}`}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
      >
        <BookOpen className="size-4" aria-hidden />
        Read the full method
      </Link>
    </ResultSection>
  );
}

/** One quiet line under the suggestions, only while the demo model answers. */
export function DemoNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-sm leading-5 text-ink-2", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold text-ink-2">Demo answers.</strong> The sentences come from
        fixed templates; every record and receipt is real.
      </span>
    </p>
  );
}
