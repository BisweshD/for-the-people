"use client";

import {
  LOW_CONFIDENCE_N,
  PARTY_NAMES,
  personIdToSlug,
  type Match,
} from "@for-the-people/core/client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Oval } from "@/components/oval";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import type { ReceiptItem } from "@/components/receipt/receipt-sheet";
import type { CandidateListStatus, CandidateView } from "@/lib/ballot";
import { formatDate, formatDollars, formatDollarsCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const FINANCE_METHOD =
  "Totals come from the FEC's summary file of all candidates for the 2026 election, which covers money raised in 2025 and 2026. It is built from each campaign's own reports to the FEC. For The People keeps totals only, never individual donors.";
const FILING_METHOD =
  "The FEC's list of candidates includes everyone who registered as a candidate for this seat. It does not show who won a primary or who dropped out.";
const INCUMBENT_METHOD =
  "Incumbent means the person holds this seat today, according to the official House and Senate member lists, not the FEC's own label.";
const STATE_LIST_METHOD =
  "Each state's election authority publishes who is on its general-election ballot. For The People reads that list from the state's official page and shows the names, parties and incumbents as the state prints them. Each name is paired with an FEC filing only when the first and last names agree (a common short form such as Chris for Christopher counts) and no middle initial or suffix disagrees, never by party alone. A name with no matching filing shows no money or record.";

export interface OpenReceipt {
  subject: string;
  items: ReceiptItem[];
  method: string;
}

const fecPage = (candidate: CandidateView) =>
  candidate.fecCandidateId
    ? `https://www.fec.gov/data/candidate/${candidate.fecCandidateId}/?cycle=2026`
    : (candidate.filing?.url ?? candidate.receipt.url);

function financeReceipt(candidate: CandidateView): ReceiptItem | null {
  const finance = candidate.finance;
  if (!finance) return null;
  return {
    title: "Campaign money totals, 2025–26",
    lines: [
      { label: "Total raised", value: formatDollars(finance.receipts) },
      { label: "From individuals", value: formatDollars(finance.individual) },
      { label: "Cash on hand", value: formatDollars(finance.cashOnHand) },
      { label: "Reports through", value: formatDate(finance.asOf) },
    ],
    receipt: finance.receipt,
    verified: null,
    href: fecPage(candidate),
  };
}

function filingReceipt(
  candidate: CandidateView,
  raceTitle: string,
  withIncumbent: boolean,
): ReceiptItem | null {
  if (!candidate.filing) return null;
  return {
    title: "FEC candidate filing",
    lines: [
      { label: "Race", value: raceTitle },
      { label: "FEC candidate ID", value: candidate.fecCandidateId ?? "Not listed" },
      { label: "Status", value: "Filed with the FEC" },
      ...(withIncumbent ? [{ label: "Incumbent", value: candidate.incumbent ? "Yes" : "No" }] : []),
    ],
    receipt: candidate.filing,
    verified: null,
    href: fecPage(candidate),
  };
}

const LIST_TITLE: Record<"certified" | "official-primary-results", string> = {
  certified: "Certified candidate list",
  "official-primary-results": "Official primary results",
};

function stateListReceipt(
  candidate: CandidateView,
  raceTitle: string,
  status: "certified" | "official-primary-results",
): ReceiptItem {
  return {
    title: LIST_TITLE[status],
    lines: [
      { label: "Race", value: raceTitle },
      {
        label: "On the list as",
        value: `${candidate.name}, ${candidate.partyLabel ?? PARTY_NAMES[candidate.party]}`,
      },
      {
        label: "Status",
        value:
          status === "certified"
            ? "On the November 3 ballot"
            : "Nominee in the official primary results",
      },
      { label: "Incumbent", value: candidate.incumbent ? "Yes" : "No" },
      {
        label: "FEC filing",
        value: candidate.fecCandidateId ?? "None found under this name",
      },
    ],
    receipt: candidate.receipt,
    verified: null,
    href: candidate.receipt.url,
  };
}

/** Where a row's receipts live: the state's list when it has one, and the FEC filing when there is one. */
export function candidateReceipts(
  candidate: CandidateView,
  raceTitle: string,
  status: CandidateListStatus,
): OpenReceipt {
  const onList = status === "certified" || status === "official-primary-results";
  const filing = filingReceipt(candidate, raceTitle, !onList);
  return {
    subject: candidate.name,
    items: [
      ...(onList ? [stateListReceipt(candidate, raceTitle, status)] : []),
      ...(filing ? [filing] : []),
    ],
    method: onList
      ? `${STATE_LIST_METHOD} ${FILING_METHOD}`
      : `${FILING_METHOD} ${INCUMBENT_METHOD}`,
  };
}

/**
 * Inline controls in a row's second line: 24px tall at least (WCAG 2.5.8), so a row stays two lines;
 * underlined, so the line still reads as text. The money column on the right, from 640px up, spans both
 * lines, so its controls grow to 44px there.
 */
const linkClass =
  "inline-flex min-h-6 items-center rounded-input text-sm underline decoration-hairline underline-offset-4 transition-colors hover:text-ink hover:decoration-ink";

const isMember = (candidate: CandidateView) =>
  candidate.personId !== null && !candidate.personId.startsWith("fec:");

/** A row's second line has a score to show (on phones it then takes the place of the money line). */
const hasScore = (match: Match | null) => match !== null && match.score !== null;

/**
 * Match on the device, for a candidate with a voting record on the key votes: oval, percent, and the
 * plain count it rests on ("4 of 9 votes"); what the percent weighs is said once, above the races. The
 * line links to their voting record. Without a shared vote it shows from 640px up only: on a phone the
 * money line takes its place, so every row stays two lines.
 */
function MatchLine({
  candidate,
  match,
  className,
}: {
  candidate: CandidateView;
  match: Match;
  className?: string;
}) {
  const record = isMember(candidate) && candidate.personId ? candidate.personId : null;
  if (match.score === null) {
    return (
      <p
        className={cn("hidden type-meta text-ink-2 sm:block", className)}
        data-fact="match"
        data-receipt-id="method-match"
      >
        {record ? (
          <Link href={`/people/${personIdToSlug(record)}`} className={cn(linkClass, "text-ink-2")}>
            No shared votes yet
            <span className="sr-only">: voting record for {candidate.name}</span>
          </Link>
        ) : (
          "No shared votes yet"
        )}
      </p>
    );
  }
  const percent = Math.round(match.score * 100);
  const low = match.n < LOW_CONFIDENCE_N;
  const body = (
    <>
      {/* The same ring as Matches: ink filled to the score, never a color for high or low. */}
      <Oval filled={false} fraction={match.score} size={20} stroke={2.25} animate={false} />
      <span>
        <span className="font-bold text-ink">
          {percent}%<span className="sr-only"> weighted</span> match
        </span>
        , {match.agreements} of {match.n} {match.n === 1 ? "vote" : "votes"}
        {low ? ", low confidence" : ""}
      </span>
    </>
  );
  return (
    <p
      className={cn("flex items-center type-meta text-ink-2 tabular-nums", className)}
      data-fact="match"
      data-receipt-id="method-match"
    >
      {record ? (
        <Link
          href={`/people/${personIdToSlug(record)}`}
          className={cn(linkClass, "gap-x-1.5 text-ink-2")}
        >
          {body}
          <span className="sr-only">: voting record for {candidate.name}</span>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-x-1.5">{body}</span>
      )}
    </p>
  );
}

/** "Jun 30" with ", 2026" from 640px up only; a date in another year always keeps its year. */
function ShortDate({ value }: { value: string }) {
  const text = formatDate(value);
  const cut = text.lastIndexOf(", ");
  if (cut < 0 || !value.startsWith("2026")) return <>{text}</>;
  return (
    <>
      {text.slice(0, cut)}
      <span className="max-sm:hidden">{text.slice(cut)}</span>
    </>
  );
}

/**
 * Money and receipts for one candidate. Shared by choices and the other FEC filings. The race header
 * says "Raised through <date> unless noted", so the money names its own date only when it differs.
 */
function CandidateFacts({
  candidate,
  raceTitle,
  moneyDate,
  status,
  onReceipt,
  className,
}: {
  candidate: CandidateView;
  raceTitle: string;
  moneyDate: string | null;
  status: CandidateListStatus;
  onReceipt: (receipt: OpenReceipt) => void;
  className?: string;
}) {
  const finance = financeReceipt(candidate);
  const receipts = candidateReceipts(candidate, raceTitle, status);
  const onList = status === "certified" || status === "official-primary-results";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 text-sm sm:*:min-h-11", className)}>
      {finance && candidate.finance ? (
        // The money line opens every Receipt for the row: the state's list, the filing, the totals.
        <button
          type="button"
          onClick={() =>
            onReceipt({
              subject: candidate.name,
              items: [...receipts.items, finance],
              method: `${receipts.method} ${FINANCE_METHOD}`,
            })
          }
          className={cn(linkClass, "text-left text-ink tabular-nums")}
          data-fact="finance"
          data-receipt-id={candidate.finance.receipt.sourceId}
        >
          {/* One inline run, so the button's flex layout keeps its spaces. The race header says
              "Raised through …", so on a phone the row drops the word and stays on one line; screen
              readers still hear it. */}
          <span>
            <span className="max-sm:sr-only">Raised </span>
            {formatDollarsCompact(candidate.finance.receipts)}
            {candidate.finance.asOf !== moneyDate && (
              <>
                {" through "}
                <ShortDate value={candidate.finance.asOf} />
              </>
            )}
          </span>
          <span className="sr-only">: receipts for {candidate.name}</span>
        </button>
      ) : (
        <>
          {/* One sentence, with only the record's name as the link: "No totals yet. See the FEC filing." */}
          <span className="inline-flex min-h-6 flex-wrap items-center gap-x-1 text-ink-2">
            <span>{candidate.filing ? "No FEC totals yet." : "No FEC filing found."}</span>
            {receipts.items.length > 0 && (
              <span>
                See the{" "}
                <button
                  type="button"
                  onClick={() => onReceipt(receipts)}
                  className={cn(linkClass, "text-ink-2")}
                >
                  {onList && status === "certified"
                    ? "state list"
                    : onList
                      ? "primary results"
                      : "FEC filing"}
                  <span className="sr-only">: receipt for {candidate.name}</span>
                </button>
                .
              </span>
            )}
          </span>
        </>
      )}
      {candidate.formerMember && (
        <a
          href={candidate.formerMember.bioguideUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(linkClass, "text-ink-2")}
        >
          Earlier service
          <span className="sr-only"> in Congress (Biographical Directory, opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

/** Line one: the name, the party tag, and "Incumbent" (a word, not another chip). */
function NameLine({ candidate, className }: { candidate: CandidateView; className?: string }) {
  const note = partyNote(candidate);
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2", className)}>
      <span className="text-base leading-snug font-bold text-ink">{candidate.name}</span>
      <PartyTag party={candidate.party} />
      {note && <span className="type-meta text-ink-2">{note}</span>}
      {candidate.incumbent && <span className="type-meta text-ink-2">Incumbent</span>}
    </span>
  );
}

/** The state's party label when the letter alone would hide it (for example "Forward Party" for O). */
const partyNote = (candidate: CandidateView) =>
  candidate.partyLabel && candidate.party === "O" ? candidate.partyLabel : null;

/**
 * Where a row's pieces sit. Rows are capped at 640px, so the money on the right stays near the name.
 * A candidate with a voting record on the key votes gets a portrait and two lines: the name, then the
 * match (on phones, the money when there is no score). From 640px up the money and receipts move to
 * their own column on the right. A candidate with no such record is one compact line from 640px up
 * (oval, name, party, money) with no portrait, the name right after the oval; on phones the money
 * wraps under the name.
 */
const LAYOUT = {
  /** A choice with a record: oval and portrait in the first two columns. */
  choice: {
    row: "grid grid-cols-[1.75rem_2.5rem_minmax(0,1fr)] items-center gap-x-2.5 sm:max-w-[40rem] sm:grid-cols-[2.75rem_2.75rem_minmax(0,1fr)_auto] sm:gap-x-4",
    oval: "row-span-2",
    first: "col-start-3 row-start-1 self-end",
    second: "col-start-3 row-start-2 min-w-0",
    facts: "sm:col-start-4 sm:row-span-2 sm:row-start-1",
  },
  /**
   * A choice without a record: no portrait column, so the name follows the oval and lines up with every
   * other compact row and with Undecided.
   */
  compact: {
    row: "grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-2.5 sm:max-w-[40rem] sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-4",
    oval: "row-span-2 sm:row-span-1",
    first: "col-start-2 row-start-1",
    second: "col-start-2 row-start-2 min-w-0",
    facts: "sm:col-start-3 sm:row-start-1",
  },
  /** Another FEC filing: no oval and no portrait, since it is not a choice. */
  filing: {
    row: "grid grid-cols-[minmax(0,1fr)] items-center sm:max-w-[40rem] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4",
    first: "col-start-1 row-start-1",
    second: "col-start-1 row-start-2 min-w-0",
    facts: "sm:col-start-2 sm:row-span-2 sm:row-start-1",
  },
} as const;

const factsPlacement = (layout: (typeof LAYOUT)[keyof typeof LAYOUT], scored: boolean) =>
  cn(layout.facts, "sm:flex-nowrap sm:justify-end", scored ? "hidden sm:flex" : layout.second);

export function CandidateRow({
  candidate,
  match,
  raceTitle,
  moneyDate,
  status,
  name,
  checked,
  index,
  onSelect,
  onReceipt,
}: {
  candidate: CandidateView;
  /** Null when the candidate has no voting record on the key votes. */
  match: Match | null;
  raceTitle: string;
  /** The race's "Raised through" date. */
  moneyDate: string | null;
  status: CandidateListStatus;
  /** Radio group name for this race. */
  name: string;
  checked: boolean;
  /** Position in the list, for the one staggered reveal when the ballot arrives. */
  index: number;
  onSelect: () => void;
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  const inputId = `pick-${candidate.candidacyId.replace(/[^A-Za-z0-9-]/g, "-")}`;
  const party = partyNote(candidate) ?? PARTY_NAMES[candidate.party];
  const layout = match ? LAYOUT.choice : LAYOUT.compact;

  return (
    <li
      className={cn("px-3 py-2.5 transition-colors sm:px-5", checked && "bg-canvas")}
      style={{ "--row": index } as CSSProperties}
      data-fact="candidacy"
      data-receipt-id={candidate.receipt.sourceId}
    >
      <div className={layout.row}>
        {/* The label lends its children to the row's grid: the oval, portrait and name all pick. */}
        <label htmlFor={inputId} className="contents cursor-pointer">
          <input
            id={inputId}
            type="radio"
            name={name}
            checked={checked}
            onChange={onSelect}
            aria-label={`${candidate.name}, ${party}${candidate.incumbent ? ", incumbent" : ""}`}
            className="peer sr-only"
          />
          <span
            className={cn(
              layout.oval,
              "grid h-11 animate-oval-in place-items-center rounded-control peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
            )}
          >
            <Oval filled={checked} size={28} />
          </span>
          {match && (
            <span className="row-span-2">
              <Portrait
                portrait={candidate.portrait}
                name={candidate.name}
                sizes="44px"
                className="w-full rounded-control"
              />
            </span>
          )}
          <NameLine candidate={candidate} className={layout.first} />
        </label>
        {match && (
          <MatchLine
            candidate={candidate}
            match={match}
            className={cn(LAYOUT.choice.second, "self-start")}
          />
        )}
        <CandidateFacts
          candidate={candidate}
          raceTitle={raceTitle}
          moneyDate={moneyDate}
          status={status}
          onReceipt={onReceipt}
          className={cn(factsPlacement(layout, hasScore(match)), "self-start sm:self-center")}
        />
      </div>
    </li>
  );
}

/** An FEC filer who is not on the state's list: facts only, no oval, because it is not a choice. */
export function OtherFilingRow({
  candidate,
  match,
  raceTitle,
  moneyDate,
  onReceipt,
}: {
  candidate: CandidateView;
  match: Match | null;
  raceTitle: string;
  moneyDate: string | null;
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  return (
    <li
      className={cn(LAYOUT.filing.row, "py-2.5")}
      data-fact="candidacy"
      data-receipt-id={candidate.receipt.sourceId}
    >
      <NameLine candidate={candidate} className={LAYOUT.filing.first} />
      {match && <MatchLine candidate={candidate} match={match} className={LAYOUT.filing.second} />}
      <CandidateFacts
        candidate={candidate}
        raceTitle={raceTitle}
        moneyDate={moneyDate}
        status="filed"
        onReceipt={onReceipt}
        className={factsPlacement(LAYOUT.filing, hasScore(match))}
      />
    </li>
  );
}
