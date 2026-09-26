"use client";

import type { IssueMatch, Match, StateCode } from "@for-the-people/core/client";
import type { KeyVoteRecord } from "@for-the-people/data/read";
import { Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { memo, useMemo, useRef, useState } from "react";
import {
  activeCount,
  ActiveFilters,
  FiltersButton,
  type FilterChange,
  type FilterValues,
} from "@/components/explore/explore-filters";
import { IssueRail, type IssueChip } from "@/components/explore/issue-rail";
import { MemberRow } from "@/components/member-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { exploreParams } from "@/lib/explore-params";
import { rankMembers, rankingSentence, type Ranking, type Scored } from "@/lib/explore-model";
import { formatInteger, STATE_NAMES } from "@/lib/format";
import { isYourMember } from "@/lib/your-members";
import { matchPerson, scoreKeyVotes } from "@/lib/matching";
import { SCORE_NOTE } from "@/lib/score-note";
import { cn } from "@/lib/utils";
import type { CardView, MemberView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";

// The map, the issue's key votes, and the phone filter sheet each load only when they show.
const MapPanel = dynamic(
  () => import("@/components/explore/map-panel").then((module) => module.MapPanel),
  { ssr: false, loading: () => <Skeleton className="h-[520px] w-full rounded-card" /> },
);
const IssuePanel = dynamic(
  () => import("@/components/explore/issue-panel").then((module) => module.IssuePanel),
  { ssr: false, loading: () => <Skeleton className="h-44 w-full rounded-card" /> },
);
// The desktop filter row: phones never show it (they use the sheet), so they never load it.
const FilterControls = dynamic(
  () => import("@/components/explore/filter-controls").then((module) => module.FilterControls),
  { ssr: false, loading: () => <Skeleton className="h-[50px] w-full max-w-3xl rounded-control" /> },
);
const FiltersSheet = dynamic(
  () => import("@/components/explore/filters-sheet").then((module) => module.FiltersSheet),
  { ssr: false },
);

const PAGE = 24;
/** Rows that animate in when the list changes; the rest appear at once. */
const ANIMATED_ROWS = 8;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** A Match narrowed to one issue area, so the row shows agreement on that issue only. */
function issueOnly(match: Match, issue: IssueMatch): Match {
  return {
    ...match,
    score: issue.score,
    n: issue.n,
    agreements: issue.agreements,
    splits: issue.n - issue.agreements,
    byIssue: [issue],
    comparisons: match.comparisons.filter((comparison) => comparison.issueArea === issue.issueArea),
  };
}

interface Row {
  member: MemberView;
  /** The match the row shows and ranks by: overall, or on the selected issue. */
  shown: Match | null;
  scored: Scored | null;
  /** One of the voter's own members of Congress, pinned first with a "Yours" tag. */
  yours?: boolean;
}

/** "members", "senators", "Republican House members": who is in view, for the map's title. */
function scopeNoun(chamber: FilterValues["chamber"], party: FilterValues["party"]): string {
  const who = chamber === "senate" ? "senators" : chamber === "house" ? "House members" : "members";
  const prefix =
    party === "D"
      ? "Democratic "
      : party === "R"
        ? "Republican "
        : party === "I"
          ? "independent "
          : "";
  return `${prefix}${who}`;
}

/**
 * Explore: the issue rail, filters in the URL, a ranked member list, and a map
 * that follows the filters. Matches are computed here, on the device.
 */
export function ExploreView({
  members,
  cards,
  record,
  issues,
  partyUnity,
}: {
  members: MemberView[];
  cards: CardView[];
  record: KeyVoteRecord;
  issues: IssueChip[];
  /** personId to [votes with their party, eligible votes] (method-party-unity). */
  partyUnity: Record<string, [number, number]>;
}) {
  const [params, setParams] = useQueryStates(exploreParams, { scroll: false });
  const voter = useVoter();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [highlight, setHighlight] = useState<StateCode | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetUsed, setSheetUsed] = useState(false);
  const results = useRef<HTMLDivElement>(null);

  const filters: FilterValues = {
    chamber: params.chamber,
    party: params.party,
    state: params.state,
  };
  const change = (next: FilterChange) => void setParams(next);
  const clear = () => void setParams({ chamber: null, party: null, state: null });

  const keyVotes = useMemo(() => scoreKeyVotes(cards), [cards]);
  const decided = useMemo(
    () => voter.stances.filter((stance) => stance.choice !== "Skip"),
    [voter.stances],
  );
  const issue = issues.find((candidate) => candidate.id === params.issue) ?? null;
  const issueCards = useMemo(
    () => (issue ? cards.filter((card) => card.issue.id === issue.id) : []),
    [cards, issue],
  );
  const answeredOnIssue = decided.filter((stance) =>
    issueCards.some((card) => card.id === stance.keyVoteId),
  ).length;
  const ranking: Ranking =
    decided.length === 0 ? "name" : issue && answeredOnIssue > 0 ? "issue" : "overall";

  const matches = useMemo(
    () =>
      decided.length > 0
        ? new Map(
            members.map((member) => [
              member.id,
              matchPerson(member.id, voter.stances, keyVotes, record),
            ]),
          )
        : null,
    [members, decided.length, voter.stances, keyVotes, record],
  );

  const rows = useMemo<Row[]>(
    () =>
      members.map((member) => {
        const match = matches?.get(member.id) ?? null;
        if (ranking !== "issue" || !match || !issue) return { member, shown: match, scored: match };
        const onIssue = match.byIssue.find((entry) => entry.issueArea === issue.id) ?? null;
        return {
          member,
          shown: onIssue ? issueOnly(match, onIssue) : null,
          scored: onIssue,
        };
      }),
    [members, matches, ranking, issue],
  );

  // Everything the chamber, party, and issue filters keep; the map shows these across all states.
  const scoped = useMemo(
    () =>
      rows.filter(
        ({ member, scored }) =>
          (!params.chamber || member.chamber === params.chamber) &&
          (!params.party || member.party === params.party) &&
          (ranking !== "issue" || (scored?.n ?? 0) > 0),
      ),
    [rows, params.chamber, params.party, ranking],
  );
  // The voter's own members lead the list (when they pass the filters), then everyone in rank order.
  const listed = useMemo(() => {
    const ranked = rankMembers(
      scoped.filter(({ member }) => !params.state || member.state === params.state),
      ranking,
    );
    const yours = ranked.filter(({ member }) => isYourMember(member, voter.location));
    return yours.length > 0
      ? [
          ...yours.map((row) => ({ ...row, yours: true })),
          ...ranked.filter((row) => !yours.includes(row)),
        ]
      : ranked;
  }, [scoped, params.state, ranking, voter.location]);
  const leftOut =
    ranking === "issue"
      ? rows.filter(
          ({ member, scored }) =>
            (scored?.n ?? 0) === 0 &&
            (!params.chamber || member.chamber === params.chamber) &&
            (!params.party || member.party === params.party) &&
            (!params.state || member.state === params.state),
        ).length
      : 0;

  const mapMode = ranking === "name" ? "party" : "match";
  const mapEntries = useMemo(
    () =>
      scoped.map(({ member, scored }) => {
        const unity = partyUnity[member.id];
        return {
          state: member.state,
          value:
            mapMode === "match"
              ? (scored?.score ?? null)
              : unity && unity[1] > 0
                ? unity[0] / unity[1]
                : null,
        };
      }),
    [scoped, mapMode, partyUnity],
  );

  const toggleMap = () => {
    setMapOpen((open) => !open);
    // Bring the map (or the list) to the top of the screen, where the result of the tap shows.
    requestAnimationFrame(() => {
      const top = results.current?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > window.innerHeight / 2)
        results.current?.scrollIntoView({ block: "start" });
    });
  };

  const count = listed.length;
  const countLabel = `${formatInteger(count)} ${plural(count, "member", "members")}`;
  const sentence = rankingSentence({
    ranking,
    answered: ranking === "issue" ? answeredOnIssue : decided.length,
    issueLabel: issue?.label ?? null,
  });
  const choiceKey = `${params.issue}|${params.chamber}|${params.party}|${params.state}`;
  const listKey = `${choiceKey}|${ranking}`;
  const filtered = activeCount(filters) > 0;
  // Rows settle in only when the reader changes the issue or a filter, never on first paint (nor
  // when saved answers arrive from the device a moment after it).
  const [shownChoice, setShownChoice] = useState(choiceKey);
  const [reordered, setReordered] = useState(false);
  if (shownChoice !== choiceKey) {
    setShownChoice(choiceKey);
    setReordered(true);
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <IssueRail
        issues={issues}
        selected={issue?.id ?? null}
        onSelect={(id) => void setParams({ issue: id })}
      />

      {wide && (
        <FilterControls values={filters} onChange={change} layout="inline">
          {filtered && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-[15px] font-bold text-ink underline underline-offset-4 can-hover:bg-badge"
            >
              Clear filters
            </button>
          )}
        </FilterControls>
      )}

      <div
        ref={results}
        className="grid scroll-mt-20 gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_440px]"
      >
        <div className="flex min-w-0 flex-col gap-5">
          {issue && <IssuePanel label={issue.label} cards={issueCards} stances={voter.stances} />}
          <section aria-labelledby="members-title" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:min-h-0">
                <h2 id="members-title" className="text-xl font-bold text-ink tabular-nums">
                  {countLabel}
                  {params.state ? ` from ${STATE_NAMES[params.state]}` : ""}
                </h2>
                <div className="flex items-center gap-2 lg:hidden">
                  <button
                    type="button"
                    onClick={toggleMap}
                    aria-pressed={mapOpen}
                    // A secondary control; pressed (the map showing), it takes the selected ink fill.
                    className={cn(
                      "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold",
                      mapOpen
                        ? "border-ink bg-ink text-paper"
                        : "border-input bg-paper text-ink can-hover:bg-badge",
                    )}
                  >
                    <MapIcon className="size-4" aria-hidden />
                    {mapOpen ? "Show list" : "Show map"}
                  </button>
                  <FiltersButton
                    count={activeCount(filters)}
                    open={sheetOpen}
                    onOpen={() => {
                      setSheetUsed(true);
                      setSheetOpen(true);
                    }}
                  />
                </div>
              </div>
              <p className="max-w-[62ch] text-[15px] text-ink-2 tabular-nums">
                <Sentence text={sentence.text} action={issue ? null : sentence.action} />
                {leftOut > 0 &&
                  ` ${formatInteger(leftOut)} ${plural(leftOut, "member", "members")} with no vote on it ${plural(leftOut, "is", "are")} not listed.`}
                {ranking !== "name" && ` ${SCORE_NOTE}`}
              </p>
            </div>
            <ActiveFilters
              values={filters}
              onChange={change}
              className="-mx-4 no-scrollbar overflow-x-auto px-4 md:mx-0 md:px-0 lg:hidden"
            />
            <div className={cn(mapOpen && "hidden lg:block")}>
              {count > 0 ? (
                <MemberList
                  key={listKey}
                  rows={listed}
                  animate={reordered}
                  showScore={ranking !== "name"}
                  highlight={highlight}
                  onHighlight={setHighlight}
                />
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-card bg-paper p-5">
                  <p className="text-base text-ink-2">No members match these filters.</p>
                  <button
                    type="button"
                    onClick={() =>
                      void setParams({ chamber: null, party: null, state: null, issue: null })
                    }
                    className="inline-flex h-11 items-center rounded-control border border-input bg-paper px-4 text-[15px] font-bold text-ink can-hover:bg-badge"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {(wide || mapOpen) && (
          <div className="lg:sticky lg:top-24 lg:self-start">
            <MapPanel
              mode={mapMode}
              topic={ranking === "issue" ? issue!.label.toLowerCase() : null}
              scope={scopeNoun(params.chamber, params.party)}
              entries={mapEntries}
              selected={params.state}
              highlighted={highlight}
              onHighlight={setHighlight}
              onSelect={(code) => void setParams({ state: params.state === code ? null : code })}
            />
          </div>
        )}
      </div>

      {sheetUsed && (
        <FiltersSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          values={filters}
          onChange={change}
          onClear={clear}
          resultLabel={`Show ${countLabel}`}
        />
      )}
    </div>
  );
}

/** The ranking sentence, with its call to answer key votes (when it has one) as a link. */
function Sentence({ text, action }: { text: string; action: string | null }) {
  if (!action) return text;
  const at = text.indexOf(action);
  return (
    <>
      {text.slice(0, at)}
      <Link href="/swipe" className="font-bold text-ink underline underline-offset-4">
        {action}
      </Link>
      {text.slice(at + action.length)}
    </>
  );
}

function MemberList({
  rows,
  animate,
  showScore,
  highlight,
  onHighlight,
}: {
  rows: Row[];
  /** Stagger the first rows in (after the reader changed the list). */
  animate: boolean;
  showScore: boolean;
  highlight: StateCode | null;
  onHighlight: (code: StateCode | null) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const shown = rows.slice(0, limit);
  const next = Math.min(PAGE, rows.length - limit);
  return (
    <>
      {/* Two columns of rows between 768 and 1024, where the map is not beside the list. */}
      <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-card bg-paper md:max-lg:grid md:max-lg:grid-cols-2 md:max-lg:divide-y-0">
        {shown.map((row, index) => (
          <ExploreRow
            key={row.member.id}
            row={row}
            showScore={showScore}
            highlighted={highlight === row.member.state}
            onHighlight={onHighlight}
            enter={animate && index < ANIMATED_ROWS ? index : null}
          />
        ))}
      </ul>
      {next > 0 && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-sm text-ink-2 tabular-nums">
            Showing {formatInteger(limit)} of {formatInteger(rows.length)}
          </p>
          <button
            type="button"
            onClick={() => setLimit((current) => current + PAGE)}
            className="inline-flex h-12 w-full items-center justify-center rounded-control border border-input bg-paper text-base font-bold text-ink can-hover:bg-badge"
          >
            Show {next} more
          </button>
        </div>
      )}
    </>
  );
}

const ExploreRow = memo(function ExploreRow({
  row,
  showScore,
  highlighted,
  onHighlight,
  enter,
}: {
  row: Row;
  showScore: boolean;
  highlighted: boolean;
  onHighlight: (code: StateCode | null) => void;
  /** Position in the entering stagger, or null to appear at once. */
  enter: number | null;
}) {
  const { member, shown } = row;
  return (
    <li
      data-member-row
      className={cn(
        "transition-colors duration-150 md:max-lg:border-b md:max-lg:border-hairline md:max-lg:odd:border-r",
        highlighted && "bg-accent",
        enter !== null && "motion-safe:animate-row-in",
      )}
      style={enter !== null ? { animationDelay: `${enter * 35}ms` } : undefined}
      onPointerEnter={() => onHighlight(member.state)}
      onPointerLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(member.state)}
      onBlur={() => onHighlight(null)}
    >
      <MemberRow member={member} match={showScore ? shown : undefined} yours={row.yours} />
    </li>
  );
});
