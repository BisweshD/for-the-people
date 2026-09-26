"use client";

import type { BallotChoice, BallotPlan, Match } from "@for-the-people/core/client";
import { BadgeCheck, ChevronDown, FileClock } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { CandidateRow, OtherFilingRow, type OpenReceipt } from "@/components/ballot/candidate-row";
import { Oval } from "@/components/oval";
import { ReceiptSheet } from "@/components/receipt/receipt-sheet";
import { Button } from "@/components/ui/button";
import {
  fecListNote,
  GENERAL_ELECTION_ID,
  raceMoneyDate,
  raceTitle,
  STATE_RACE_NOTES,
  type BallotResponse,
  type RaceView,
  type StateOfficeView,
} from "@/lib/ballot";
import { districtLabel, formatDate, STATE_NAMES } from "@/lib/format";
import { hasRecord, matchPerson, scoreKeyVotes } from "@/lib/matching";
import { SCORE_NOTE } from "@/lib/score-note";
import type { CardView } from "@/lib/views";
import { useVoter, voterActions } from "@/lib/voter-store";
import { cn } from "@/lib/utils";

interface Draft {
  choice: BallotChoice | null;
  note: string;
}

const sameChoice = (a: BallotChoice | null, b: BallotChoice | null) =>
  a?.kind === b?.kind &&
  (a?.kind !== "candidacy" || (b?.kind === "candidacy" && a.candidacyId === b.candidacyId));

const isChoiceIn = (race: RaceView, choice: BallotChoice) =>
  choice.kind === "undecided" ||
  race.candidates.some((candidate) => candidate.candidacyId === choice.candidacyId);

/** The saved entry for a race. A saved pick that is no longer a choice (not on this race's list) is dropped. */
function savedDraft(plan: BallotPlan | null, race: RaceView): Draft & { stale: boolean } {
  const entry =
    plan?.electionId === GENERAL_ELECTION_ID
      ? plan.entries.find((candidate) => candidate.raceId === race.id)
      : undefined;
  const stale = entry ? !isChoiceIn(race, entry.choice) : false;
  return { choice: entry && !stale ? entry.choice : null, note: entry?.note ?? "", stale };
}

const headingIdFor = (race: RaceView) => `race-${race.id.replace(/[^A-Za-z0-9]/g, "-")}`;

/** BallotPlan: a pick or "Undecided" per race, with an optional note, saved on this device. */
export function BallotPlanForm({
  ballot,
  cards,
  alternates,
  office,
}: {
  ballot: BallotResponse;
  cards: CardView[];
  /** House districts that depend on a court ruling, labeled by which map they belong to. */
  alternates: Record<number, string>;
  /** The state's election office, where a voter checks a list For The People does not have. */
  office: StateOfficeView | null;
}) {
  const voter = useVoter();
  const keyVotes = useMemo(() => scoreKeyVotes(cards), [cards]);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [receipt, setReceipt] = useState<OpenReceipt | null>(null);
  const reasonId = useId();

  const matches = useMemo(() => {
    const result = new Map<string, Match | null>();
    for (const race of ballot.races) {
      for (const candidate of [...race.candidates, ...race.otherFilings]) {
        const personId = candidate.personId;
        if (!personId || result.has(personId)) continue;
        result.set(
          personId,
          hasRecord(ballot.record, personId)
            ? matchPerson(personId, voter.stances, keyVotes, ballot.record)
            : null,
        );
      }
    }
    return result;
  }, [ballot, voter.stances, keyVotes]);

  const draftFor = (race: RaceView): Draft => edits[race.id] ?? savedDraft(voter.ballotPlan, race);
  const isDirty = (race: RaceView) => {
    const edit = edits[race.id];
    if (!edit) return false;
    const saved = savedDraft(voter.ballotPlan, race);
    return !sameChoice(edit.choice, saved.choice) || edit.note.trim() !== saved.note.trim();
  };
  const dirty = ballot.races.filter(isDirty);

  const update = (race: RaceView, patch: Partial<Draft>) =>
    setEdits((current) => ({ ...current, [race.id]: { ...draftFor(race), ...patch } }));

  const save = () => {
    for (const race of ballot.races) {
      const draft = draftFor(race);
      if (!draft.choice) continue;
      voterActions.saveBallotChoice(
        GENERAL_ELECTION_ID,
        race.id,
        draft.choice,
        draft.note.trim() ? draft.note.trim().slice(0, 280) : null,
      );
    }
    setEdits({});
    toast.success("Saved to your ballot");
  };

  const decided = ballot.races.filter((race) => draftFor(race).choice !== null).length;
  const total = ballot.races.length;
  const racesWord = total === 1 ? "race" : "races";
  const canSave = dirty.length > 0;
  const reason = canSave
    ? null
    : decided === 0
      ? "Pick a candidate or Undecided in a race first."
      : "Everything is saved. Change a pick or a note to save again.";

  const scored = [...matches.values()].some((match) => match !== null && match.score !== null);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {/* The page's one spelled-out name for the FEC, and its one explanation of the match
          percent beside its one method link. */}
      <p className="max-w-[68ch] type-meta text-ink-2">
        Money raised and candidate filings come from the Federal Election Commission (FEC).
        {scored && (
          <>
            {" "}
            {SCORE_NOTE}{" "}
            <Link
              href="/methodology#match"
              className="font-bold text-ink underline underline-offset-4"
            >
              How scores work
            </Link>
          </>
        )}
      </p>
      {total > 1 && (
        <nav aria-label="Races on your ballot" className="-mx-1 flex flex-wrap gap-2">
          {ballot.races.map((race) => {
            const planned = draftFor(race).choice !== null;
            return (
              <a
                key={race.id}
                href={`#${headingIdFor(race)}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-hairline bg-paper px-3.5 text-sm font-bold text-ink transition-colors hover:border-ink-3"
              >
                <Oval filled={planned} size={16} />
                {race.chamber === "senate"
                  ? `U.S. Senate${race.special ? " (special)" : ""}`
                  : `U.S. House, ${districtLabel(race.state, race.district)}`}
                <span className="sr-only">{planned ? " (planned)" : " (not planned yet)"}</span>
              </a>
            );
          })}
        </nav>
      )}

      {ballot.races.map((race, index) => (
        <RaceSection
          key={race.id}
          race={race}
          order={index}
          alternate={race.district !== null ? alternates[race.district] : undefined}
          office={office}
          draft={draftFor(race)}
          dirty={isDirty(race)}
          stale={!edits[race.id] && savedDraft(voter.ballotPlan, race).stale}
          matches={matches}
          onChange={(patch) => update(race, patch)}
          onReceipt={setReceipt}
        />
      ))}

      <div
        className={cn(
          "flex flex-col gap-3 rounded-card border border-hairline bg-paper p-4 sm:flex-row sm:items-center sm:justify-between md:px-5",
          canSave && "sticky bottom-24 z-30 animate-card-rise shadow-3 md:bottom-6",
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base font-bold text-ink tabular-nums" aria-live="polite">
            {canSave
              ? `Unsaved changes in ${dirty.length} ${dirty.length === 1 ? "race" : "races"}`
              : `${decided} of ${total} ${racesWord} planned, saved on this device`}
          </p>
          {reason && (
            <p id={reasonId} className="type-meta text-ink-2">
              {reason}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          onClick={save}
          disabled={!canSave}
          aria-describedby={reason ? reasonId : undefined}
          className="h-12 shrink-0 rounded-control px-6 text-base font-bold disabled:border-hairline disabled:bg-paper disabled:text-ink-3 disabled:opacity-100"
        >
          Save my ballot
        </Button>
      </div>

      <ReceiptSheet
        open={receipt !== null}
        onOpenChange={(open) => !open && setReceipt(null)}
        subject={receipt?.subject ?? ""}
        items={receipt?.items ?? []}
        method={receipt?.method ?? ""}
      />
    </div>
  );
}

/**
 * Where this race's names come from, said once under its heading, with the state's page as the Receipt.
 * Without a state list the FEC filings stand in, alphabetical and complete, and the note says so plainly, with the state's election office one tap away.
 */
function ListLine({ race, office }: { race: RaceView; office: StateOfficeView | null }) {
  const { status, receipt, note } = race.list;
  const count = race.candidates.length;
  const link = (text: string) =>
    receipt && (
      <a
        href={receipt.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
        data-fact="candidate-list"
        data-receipt-id={receipt.sourceId}
      >
        {text}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  const source = receipt && link(receipt.publisher);
  const read = receipt ? `, read ${formatDate(receipt.retrievedAt.slice(0, 10))}` : "";

  if (status === "certified" || status === "official-primary-results") {
    return (
      <div className="flex items-start gap-2.5 type-meta text-ink-2">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
        <div className="flex flex-col gap-1">
          <p>
            <span className="font-bold text-ink">
              {status === "certified"
                ? "On the November ballot, certified by "
                : "On the November ballot, from official primary results, "}
            </span>
            {source}
            {read}.
          </p>
          {status === "official-primary-results" && (
            <p>
              The list names each party&apos;s nominee. Independent and minor-party candidates may
              be missing, so check your sample ballot.
            </p>
          )}
        </div>
      </div>
    );
  }
  // No state list: the FEC filings stand in, and the race says so first, before any name.
  const stateName = STATE_NAMES[race.state];
  return (
    <div className="flex max-w-[76ch] flex-col gap-2 rounded-control bg-canvas px-3.5 py-3 type-meta text-ink-2 ring-1 ring-hairline md:px-4">
      <p className="flex items-start gap-2 text-base leading-snug font-bold text-ink">
        <FileClock className="mt-0.5 size-5 shrink-0" aria-hidden />
        Official candidate list not available yet
      </p>
      <p className="text-base text-ink tabular-nums">{fecListNote(count)}</p>
      <p>
        Check who is on your ballot with the{" "}
        {office ? (
          <a
            href={office.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-ink underline decoration-ink-3 underline-offset-4 hover:decoration-ink"
          >
            {stateName} election office
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          `${stateName} election office`
        )}
        .
      </p>
      {status === "pending" && (note || receipt) && (
        <p className="border-t border-hairline pt-2">
          {note ? `${note} ` : ""}
          {receipt && (
            <>
              Last checked on the {link("state's candidate page")},{" "}
              {formatDate(receipt.retrievedAt.slice(0, 10))}.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function PlanStatus({ draft, dirty }: { draft: Draft; dirty: boolean }) {
  const label = dirty
    ? "Not saved yet"
    : draft.choice?.kind === "candidacy"
      ? "Saved"
      : draft.choice?.kind === "undecided"
        ? "Saved as undecided"
        : "Not planned yet";
  return (
    <p
      className={cn(
        "shrink-0 rounded-control px-2.5 py-1 text-sm font-bold",
        dirty ? "bg-you-soft text-ink" : draft.choice ? "bg-canvas text-ink-2" : "text-ink-2",
      )}
    >
      {label}
    </p>
  );
}

function RaceSection({
  race,
  order,
  alternate,
  office,
  draft,
  dirty,
  stale,
  matches,
  onChange,
  onReceipt,
}: {
  race: RaceView;
  order: number;
  alternate: string | undefined;
  office: StateOfficeView | null;
  draft: Draft;
  dirty: boolean;
  /** A saved pick that is no longer among the choices. */
  stale: boolean;
  matches: Map<string, Match | null>;
  onChange: (patch: Partial<Draft>) => void;
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  const title = raceTitle(race);
  const headingId = headingIdFor(race);
  const selectedId = draft.choice?.kind === "candidacy" ? draft.choice.candidacyId : null;
  // Every choice shows, in alphabetical order: collapsing a long list hid whole parties below the fold.
  const note = STATE_RACE_NOTES[race.state]?.[race.chamber];
  const undecidedId = `${headingId}-undecided`;
  const noteId = `${headingId}-note`;
  const offset = order * 4;
  const others = race.otherFilings;
  // One "Raised through" date for the race; a row names its own date only when it differs.
  const everyone = [...race.candidates, ...others];
  const moneyDate = raceMoneyDate(everyone);
  const moneyReceipt = everyone.find((candidate) => candidate.finance?.asOf === moneyDate)?.finance
    ?.receipt.sourceId;

  return (
    <section
      aria-labelledby={headingId}
      className="scroll-mt-24 overflow-hidden rounded-card border border-hairline bg-paper"
    >
      <div className="mx-4 mt-3 h-0.5 bg-ink md:mx-6" aria-hidden />
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3 md:px-6 md:pt-5">
        <div className="flex items-start justify-between gap-3">
          <h3
            id={headingId}
            className="text-xl font-bold text-ink md:text-2xl"
            data-fact="race"
            data-receipt-id={race.receipt.sourceId}
          >
            {title}
          </h3>
          <PlanStatus draft={draft} dirty={dirty} />
        </div>
        {alternate && <p className="text-sm font-bold text-ink">{alternate}.</p>}
        <ListLine race={race} office={office} />
        {note && (
          <p className="max-w-[68ch] type-meta text-ink-2">
            {note.text}{" "}
            <a
              href={note.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-bold text-ink-2 underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              Source: {note.source.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
        {moneyDate && (
          <p
            className="type-meta text-ink-2 tabular-nums"
            data-fact="finance-date"
            data-receipt-id={moneyReceipt}
          >
            Raised through {formatDate(moneyDate)} unless noted.
          </p>
        )}
        {stale && (
          <p className="rounded-control bg-you-soft px-3 py-2 text-sm text-ink" role="note">
            The pick you saved earlier is no longer on this race&apos;s list. Pick again.
          </p>
        )}
      </div>

      <fieldset className="border-t border-hairline">
        <legend className="sr-only">Your pick for {title}</legend>
        <ul className="flex flex-col divide-y divide-hairline">
          {race.candidates.map((candidate, index) => (
            <CandidateRow
              key={candidate.candidacyId}
              candidate={candidate}
              match={candidate.personId ? (matches.get(candidate.personId) ?? null) : null}
              raceTitle={title}
              moneyDate={moneyDate}
              status={race.list.status}
              name={headingId}
              checked={candidate.candidacyId === selectedId}
              index={offset + index}
              onSelect={() =>
                onChange({ choice: { kind: "candidacy", candidacyId: candidate.candidacyId } })
              }
              onReceipt={onReceipt}
            />
          ))}
          <li
            className={cn(
              "px-3 py-2.5 transition-colors sm:px-5",
              draft.choice?.kind === "undecided" && "bg-canvas",
            )}
            style={{ "--row": offset + race.candidates.length } as React.CSSProperties}
          >
            {/* The same first column as the candidate rows, so the ovals line up. */}
            <label
              htmlFor={undecidedId}
              className="grid cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-2.5 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-4"
            >
              <input
                id={undecidedId}
                type="radio"
                name={headingId}
                checked={draft.choice?.kind === "undecided"}
                onChange={() => onChange({ choice: { kind: "undecided" } })}
                className="peer sr-only"
              />
              <span className="grid h-11 animate-oval-in place-items-center rounded-control peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                <Oval filled={draft.choice?.kind === "undecided"} size={28} />
              </span>
              <span className="flex flex-col">
                <span className="text-base font-bold text-ink">Undecided</span>
                <span className="type-meta text-ink-2">
                  Decide later. Your cheat sheet will say so.
                </span>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>

      {others.length > 0 && (
        <details className="group border-t border-hairline">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-bold text-ink md:px-6 [&::-webkit-details-marker]:hidden">
            <span>Other FEC filings (not on the state&apos;s list)</span>
            <span className="flex items-center gap-2 text-ink-2 tabular-nums">
              {others.length}
              <ChevronDown
                className="size-4 transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </span>
          </summary>
          <div className="px-4 pb-3 md:px-6">
            <p className="max-w-[68ch] type-meta text-ink-2">
              {others.length === 1 ? "This person" : "These people"} filed with the FEC for this
              seat but {others.length === 1 ? "is" : "are"} not on{" "}
              {race.list.status === "certified"
                ? `${STATE_NAMES[race.state]}'s certified list`
                : "the official primary results as a nominee"}
              , so {others.length === 1 ? "is" : "they are"} not a choice in your plan.
            </p>
            <ul className="flex flex-col divide-y divide-hairline">
              {others.map((candidate) => (
                <OtherFilingRow
                  key={candidate.candidacyId}
                  candidate={candidate}
                  match={candidate.personId ? (matches.get(candidate.personId) ?? null) : null}
                  raceTitle={title}
                  moneyDate={moneyDate}
                  onReceipt={onReceipt}
                />
              ))}
            </ul>
          </div>
        </details>
      )}

      <div className="border-t border-hairline px-4 pt-5 pb-4 md:px-6">
        <label htmlFor={noteId} className="text-sm font-bold text-ink">
          Note for yourself (optional)
        </label>
        <textarea
          id={noteId}
          value={draft.note}
          maxLength={280}
          rows={3}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder={`Anything to remember about ${race.chamber === "senate" ? "this Senate race" : `the ${districtLabel(race.state, race.district)} race`}`}
          className="mt-1.5 min-h-16 w-full rounded-control border border-input bg-paper px-3 py-2 text-base font-normal text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>
    </section>
  );
}
