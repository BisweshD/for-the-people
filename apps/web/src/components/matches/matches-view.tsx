"use client";

import { LOW_CONFIDENCE_N, type Match, type Weight } from "@for-the-people/core/client";
import type { KeyVoteRecord } from "@for-the-people/data/read";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AgreementStrip } from "@/components/agreement-strip";
import { Button } from "@/components/ui/button";
import type { DistrictOption } from "@/components/ballot/address-form";
import { IssueIcon } from "@/components/issue-icon";
import { MatchScore, ScoreWhy } from "@/components/match-score";
import { MemberRow, profileHref } from "@/components/member-row";
import { OfficeText } from "@/components/office-text";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import { CreateFriendCompareLink } from "@/components/share/create-friend-compare-link";
import { MatchShareButton } from "@/components/share/match-share-button";
import { WeightsList, type Answered, type ChangeWeight } from "@/components/matches/weights-list";
import { useFlip } from "@/hooks/use-flip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { fadeMask, useScrollEdges } from "@/hooks/use-scroll-edges";
import { formatInteger } from "@/lib/format";
import {
  groupTies,
  issueAgreement,
  tieCounts,
  tieExplainer,
  tieNote,
  type RankedEntry,
  type Tier,
} from "@/lib/match-groups";
import { matchPerson, scoreKeyVotes } from "@/lib/matching";
import { isYourMember } from "@/lib/your-members";
import { SCORE_NOTE } from "@/lib/score-note";
import { scrollWindowTo } from "@/lib/scroll";
import { cn } from "@/lib/utils";
import type { CardView, MemberView } from "@/lib/views";
import { useVoter, voterActions } from "@/lib/voter-store";

type Ranked = RankedEntry<MemberView>;
type IssueLabels = ReadonlyMap<string, { label: string; icon: string }>;

const WeightsSheetPanel = dynamic(
  () => import("@/components/matches/weights-sheet").then((module) => module.WeightsSheetPanel),
  { ssr: false },
);
// Only a voter with no saved location sees the address form, so only they load it.
const AddressForm = dynamic(
  () => import("@/components/ballot/address-form").then((module) => module.AddressForm),
  { ssr: false },
);

/** How many members the closest and least-alike lists aim to show before stopping at a tier boundary. */
const CLOSEST_TARGET = 12;
const LEAST_TARGET = 5;
/** A tie longer than this shows its first names and a button for the rest. */
const TIER_PREVIEW = 6;
/** Weights the side rail shows before its "N more votes" row: four fit a 900px-tall screen. */
const RAIL_PREVIEW = 4;
/** The sticky site header plus a little air: where the top group lands after a weight change. */
const HEADER_OFFSET = 96;
const SCROLL_MS = 320;

/** Match reveal. Scores are computed here, on the device. */
export function MatchesView({
  cards,
  record,
  members,
  districtOptions,
}: {
  cards: CardView[];
  record: KeyVoteRecord;
  members: MemberView[];
  districtOptions: DistrictOption[];
}) {
  const voter = useVoter();
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const closestRef = useRef<HTMLElement>(null);
  // Rows glide to their new places when a weight change reorders the list.
  useFlip(listRef, !reduce);
  const keyVotes = useMemo(() => scoreKeyVotes(cards), [cards]);
  const decided = voter.stances.filter((stance) => stance.choice !== "Skip");

  const ranked = useMemo(
    () =>
      members
        .filter((member) => member.serving)
        .map((member) => ({
          member,
          match: matchPerson(member.id, voter.stances, keyVotes, record),
        })),
    [members, voter.stances, keyVotes, record],
  );

  // The House member first, then the senators.
  const mine = useMemo(
    () =>
      ranked
        .filter(({ member }) => isYourMember(member, voter.location))
        .toSorted(
          (a, b) => Number(a.member.chamber === "senate") - Number(b.member.chamber === "senate"),
        ),
    [ranked, voter.location],
  );
  const mineIds = useMemo(() => new Set(mine.map(({ member }) => member.id)), [mine]);

  const { closest, least } = useMemo(() => {
    const confident = ranked
      .filter(({ match }) => match.score !== null && match.n >= LOW_CONFIDENCE_N)
      .toSorted(
        (a, b) =>
          (b.match.score ?? 0) - (a.match.score ?? 0) ||
          b.match.n - a.match.n ||
          a.member.lastName.localeCompare(b.member.lastName),
      );
    const closest = groupTies(confident, CLOSEST_TARGET);
    const shown = new Set(closest.flatMap((tier) => tier.entries.map(({ member }) => member.id)));
    const least = groupTies(
      confident.toReversed().filter(({ member }) => !shown.has(member.id)),
      LEAST_TARGET,
    );
    return { closest, least };
  }, [ranked]);

  // A weight change first brings the top group into view, then saves, so the reorder plays where
  // the reader can see it. Changes made during that scroll are saved together when it ends.
  const queued = useRef<Array<() => void>>([]);
  const scrolling = useRef<Promise<void> | null>(null);
  const changeWeight: ChangeWeight = (keyVoteId, weight: Weight) => {
    const save = () => voterActions.setWeight(keyVoteId, weight);
    const target = closestRef.current;
    if (scrolling.current) {
      queued.current.push(save);
      return scrolling.current;
    }
    const top = target?.getBoundingClientRect().top;
    if (top === undefined || (top >= HEADER_OFFSET - 8 && top <= window.innerHeight * 0.5)) {
      save();
      return Promise.resolve();
    }
    queued.current.push(save);
    scrolling.current = scrollWindowTo(window.scrollY + top - HEADER_OFFSET, reduce ? 0 : SCROLL_MS)
      .then(() => {
        const saves = queued.current;
        queued.current = [];
        for (const pending of saves) pending();
      })
      .finally(() => {
        scrolling.current = null;
      });
    return scrolling.current;
  };

  if (decided.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-card bg-paper p-8 text-center">
        <h1 className="text-3xl font-bold text-ink">Your matches</h1>
        <p className="text-base text-ink-2">
          Answer a few votes first. Matches compare your answers with how each member actually
          voted.
        </p>
        <Button asChild size="lg">
          <Link href="/swipe">Start answering</Link>
        </Button>
      </div>
    );
  }

  const answeredCards = cards
    .map((card) => ({
      card,
      stance: voter.stances.find((stance) => stance.keyVoteId === card.id),
    }))
    .filter(
      (entry): entry is { card: CardView; stance: NonNullable<typeof entry.stance> } =>
        entry.stance !== undefined && entry.stance.choice !== "Skip",
    );

  const unanswered = cards.filter(
    (card) => !voter.stances.some((stance) => stance.keyVoteId === card.id),
  ).length;
  const issueLabels: IssueLabels = new Map(
    cards.map((card) => [card.issue.id, { label: card.issue.label, icon: card.issue.icon }]),
  );
  const serving = members.filter((member) => member.serving).length;
  const [top, ...rest] = closest;
  const topIsSingle = top !== undefined && top.entries.length === 1;
  // The list under the headline: everyone after a single top match, or the top tie's rows too.
  const listed = topIsSingle ? rest : closest;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
      <div ref={listRef} className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Your matches
          </h1>
          <p className="max-w-2xl text-base text-ink-2">
            Based on your {decided.length} Yea or Nay {decided.length === 1 ? "answer" : "answers"}.
            A match counts only votes where you and the member both took a side.{" "}
            {top === undefined && `${SCORE_NOTE} `}
            <Link
              href="/methodology#match"
              className="font-bold text-ink underline underline-offset-4"
            >
              How scores work
            </Link>
          </p>
          {/* On a phone the two actions stack, so "Compare with a friend" keeps its name on one line. */}
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <div className="lg:hidden">
              <WeightsSheet answered={answeredCards} onChange={changeWeight} />
            </div>
            <CreateFriendCompareLink compact />
          </div>
        </header>

        <section aria-labelledby="your-members" className="flex flex-col gap-3">
          <h2 id="your-members" className="text-xl font-bold text-ink">
            Your members of Congress
          </h2>
          {!voter.location ? (
            <div className="flex flex-col gap-3">
              <p className="max-w-2xl text-base text-ink-2">
                Add your address to see how your House member and your two senators match you.
              </p>
              <AddressForm districtOptions={districtOptions} />
            </div>
          ) : mine.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-card bg-paper">
              {mine.map((entry) => (
                <li key={entry.member.id}>
                  <YourMemberRow entry={entry} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-card bg-paper p-5 text-base text-ink-2">
              No record yet of your members voting on the key votes.
            </p>
          )}
        </section>

        <p className="sr-only" aria-live="polite">
          {top
            ? top.entries.length === 1
              ? `Closest match: ${top.entries[0]!.member.name}, ${top.entries[0]!.match.agreements} of ${top.entries[0]!.match.n} votes.`
              : `Closest match: ${top.entries.length} members tied. ${tieExplainer(
                  top.percent,
                  top.entries.map((entry) => entry.match),
                )}`
            : ""}
        </p>
        <section
          ref={closestRef}
          aria-labelledby="closest"
          className="flex scroll-mt-24 flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id="closest" className="text-xl font-bold text-ink">
              Closest to you in Congress
            </h2>
            <p className="text-base text-ink-2">
              Members who share at least {LOW_CONFIDENCE_N} of your votes, highest match first.
            </p>
          </div>
          {top === undefined ? (
            <p className="rounded-card bg-paper p-5 text-base text-ink-2">
              No member shares {LOW_CONFIDENCE_N} votes with you yet. Answer a few more.
            </p>
          ) : (
            <>
              {topIsSingle ? (
                <TopMatch entry={top.entries[0]!} labels={issueLabels} />
              ) : (
                <TopTie tier={top} labels={issueLabels} />
              )}
              {!topIsSingle && unanswered > 0 && (
                <div className="flex flex-col gap-3 rounded-card border border-hairline p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <p className="text-base text-ink-2">
                    Answer {unanswered} more {unanswered === 1 ? "vote" : "votes"} to tell these
                    members apart.
                  </p>
                  <Button asChild>
                    <Link href="/swipe">Keep answering</Link>
                  </Button>
                </div>
              )}
              {listed.length > 0 && (
                <RankList
                  note
                  tiers={listed}
                  yours={mineIds}
                  label={topIsSingle ? "More close matches" : "Closest matches"}
                />
              )}
            </>
          )}
        </section>

        {least.length > 0 && (
          <section aria-labelledby="least" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="least" className="text-xl font-bold text-ink">
                Least like you
              </h2>
              <p className="text-base text-ink-2">
                Members who voted the other way most often on the votes you answered.
              </p>
            </div>
            <RankList tiers={least} yours={mineIds} label="Least like you" />
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-card bg-paper p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">2026 candidates</h2>
            <p className="text-base text-ink-2">
              Candidates with no voting record in this Congress have no votes to compare, so they
              get no score. See the candidates where you vote.
            </p>
          </div>
          <Button asChild variant="outline" size="lg">
            <Link href="/ballot">{voter.location ? "Open your ballot" : "Find your ballot"}</Link>
          </Button>
        </section>

        <Button asChild variant="outline" size="lg" className="w-full tabular-nums sm:w-fit">
          <Link href="/explore">See all {formatInteger(serving)} members</Link>
        </Button>
      </div>

      <WeightsRail answered={answeredCards} onChange={changeWeight} />
    </div>
  );
}

/**
 * The weights beside the list at 1024 and wider: a header with the answer count that stays put, the
 * first few weights, and a "N more votes" row that shows the rest. The list scrolls under the header
 * when it outgrows the screen; a hairline, never a fade, marks an edge where more weights wait.
 */
function WeightsRail({ answered, onChange }: { answered: Answered[]; onChange: ChangeWeight }) {
  const scroller = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scroller, "y");
  const [open, setOpen] = useState(false);
  const hidden = open ? 0 : Math.max(0, answered.length - RAIL_PREVIEW);
  const shown = hidden > 0 ? answered.slice(0, RAIL_PREVIEW) : answered;
  return (
    <aside
      aria-labelledby="weights-rail"
      className="hidden lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-120px)] lg:flex-col lg:self-start lg:overflow-hidden lg:rounded-card lg:bg-paper"
    >
      <div
        className={cn(
          "flex shrink-0 flex-col gap-1 border-b px-5 pt-5 pb-4 transition-colors duration-200",
          edges.start ? "border-hairline" : "border-transparent",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="weights-rail" className="text-lg font-bold text-ink">
            Adjust what matters
          </h2>
          <span className="text-sm font-bold whitespace-nowrap text-ink-2 tabular-nums">
            {answered.length} {answered.length === 1 ? "answer" : "answers"}
          </span>
        </div>
        <p className="text-sm text-ink-2">
          Votes you care more about count more. The list reorders as you change them.
        </p>
      </div>
      <div
        ref={scroller}
        id="weights-rail-list"
        className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-5"
      >
        <WeightsList answered={shown} onChange={onChange} />
        {answered.length > RAIL_PREVIEW && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="weights-rail-list"
            onClick={() => setOpen((value) => !value)}
            className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 border-t border-hairline pt-3 text-left text-sm font-bold text-ink tabular-nums"
          >
            {open ? "Show fewer votes" : `${hidden} more ${hidden === 1 ? "vote" : "votes"}`}
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-ink-2 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      </div>
      <div
        aria-hidden
        className={cn(
          "h-px shrink-0 transition-colors duration-200",
          edges.end ? "bg-hairline" : "bg-transparent",
        )}
      />
    </aside>
  );
}

function WeightsSheet({ answered, onChange }: { answered: Answered[]; onChange: ChangeWeight }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        aria-expanded={open}
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
        className="w-full sm:w-auto"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Adjust what matters
      </Button>
      {used && (
        <WeightsSheetPanel
          open={open}
          onOpenChange={setOpen}
          answered={answered}
          onChange={onChange}
        />
      )}
    </>
  );
}

/**
 * One of the voter's own members, large: the portrait, the name, and the count first ("Agrees on 7
 * of 11 votes", rolling in once), the score under it, and one small oval per shared vote.
 */
function YourMemberRow({ entry }: { entry: Ranked }) {
  const { member, match } = entry;
  return (
    <Link
      href={profileHref(member)}
      className="group flex items-start gap-4 p-4 transition-colors duration-150 hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 sm:p-5"
    >
      <Portrait
        portrait={member.portrait}
        name={member.name}
        lastName={member.lastName}
        sizes="80px"
        decorative
        morph={member.id}
        className="w-16 shrink-0 rounded-control transition-transform duration-150 group-active:scale-[0.97] sm:w-20"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-lg leading-snug font-bold text-ink">
            {member.name}
            <PartyTag party={member.party} className="ml-1.5 align-[2px]" />
          </p>
          <p className="text-sm text-ink-2">
            <OfficeText member={member} />
          </p>
        </div>
        <MatchScore match={match} />
        <AgreementStrip comparisons={match.comparisons} />
      </div>
    </Link>
  );
}

function TopMatch({ entry, labels }: { entry: Ranked; labels: IssueLabels }) {
  const { member, match } = entry;
  return (
    <article
      data-flip={member.id}
      className="grid gap-5 rounded-card bg-paper p-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-5 md:grid-cols-[240px_minmax(0,1fr)]"
      aria-labelledby={`top-${member.id}`}
    >
      <Portrait
        portrait={member.portrait}
        name={member.name}
        lastName={member.lastName}
        sizes="(min-width: 768px) 240px, (min-width: 640px) 200px, 90vw"
        className="w-full max-w-[280px]"
        priority
      />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold text-ink-2">Your closest match</p>
          <div className="flex items-start justify-between gap-3">
            <h3 id={`top-${member.id}`} className="text-3xl leading-tight font-extrabold text-ink">
              {member.name}
            </h3>
            <PartyTag party={member.party} full />
          </div>
          <p className="text-base text-ink-2">
            <OfficeText member={member} />
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <MatchScore match={match} size="xl" />
          <ScoreWhy match={match} />
        </div>
        <AgreementStrip comparisons={match.comparisons} />
        <IssueChips matches={[match]} labels={labels} />
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button asChild size="lg" className="flex-1 sm:flex-none">
            <Link href={profileHref(member)}>See the votes</Link>
          </Button>
          <MatchShareButton member={member} match={match} label="Share" />
        </div>
      </div>
    </article>
  );
}

/**
 * A tie for the top: the count leads when every tied member shares it ("Agrees on 7 of 8 votes"),
 * otherwise the shared percent does; the tied members follow in the list below.
 */
function TopTie({ tier, labels }: { tier: Tier<MemberView>; labels: IssueLabels }) {
  const matches = tier.entries.map((entry) => entry.match);
  const uniform = tieCounts(matches).length === 1;
  const first = tier.entries[0]!.match;
  return (
    <div className="flex flex-col gap-4 rounded-card bg-paper p-4 sm:p-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-ink-2 tabular-nums">
          Tied for your closest match: {tier.entries.length} members
        </p>
        {uniform ? (
          <MatchScore match={first} size="xl" />
        ) : (
          <p
            className="text-3xl leading-tight font-extrabold tracking-tight text-ink tabular-nums sm:text-4xl"
            data-fact="match"
            data-receipt-id="method-match"
          >
            Match score {tier.percent}%
          </p>
        )}
        <ScoreWhy match={first} />
      </div>
      {uniform && <AgreementStrip comparisons={first.comparisons} />}
      <IssueChips matches={matches} labels={labels} />
    </div>
  );
}

/**
 * "Where you agree most": agreement by issue for the headline, the one place a reader asks "on
 * what?". Issues with fewer than 2 shared votes are left out. One scrolling row on phones, with a fade
 * where more chips wait; wrapped rows from 640px.
 */
function IssueChips({ matches, labels }: { matches: readonly Match[]; labels: IssueLabels }) {
  const rail = useRef<HTMLUListElement>(null);
  const edges = useScrollEdges(rail, "x");
  const issues = issueAgreement(matches);
  if (issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-ink">Where you agree most</p>
      <ul
        ref={rail}
        className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        style={fadeMask(edges, "x")}
        aria-label="Where you agree most"
        // A row that scrolls takes focus, so arrow keys can reach the chips past the edge.
        tabIndex={edges.start || edges.end ? 0 : undefined}
      >
        {issues.map((issue) => {
          const known = labels.get(issue.issueArea);
          return (
            <li
              key={issue.issueArea}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-control bg-canvas px-2.5 text-sm whitespace-nowrap text-ink-2 tabular-nums"
              data-fact="match"
              data-receipt-id="method-match"
            >
              {known && <IssueIcon name={known.icon} className="size-4 shrink-0 text-ink-2" />}
              <span className="font-bold text-ink">{known?.label ?? issue.issueArea}</span>
              <span className="whitespace-nowrap">{issue.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One continuous ranked list. A tie is marked, not boxed: a small "Tied at 74%" label and a 2px rule
 * down the left of its rows. With `note`, the first tie whose rows show different counts carries the
 * page's one short note on ties (the closest list has it; the least-alike list does not repeat it).
 * Rows that join the list after a change settle in; rows that stay glide to their new places (FLIP).
 */
function RankList({
  tiers,
  yours,
  label,
  note = false,
}: {
  tiers: Array<Tier<MemberView>>;
  yours: ReadonlySet<string>;
  label: string;
  note?: boolean;
}) {
  const ids = tiers.flatMap((tier) => tier.entries.map(({ member }) => member.id));
  const order = ids.join(",");
  const [shownOrder, setShownOrder] = useState(order);
  const [entered, setEntered] = useState<ReadonlySet<string>>(new Set());
  if (shownOrder !== order) {
    const before = new Set(shownOrder.split(","));
    setShownOrder(order);
    setEntered(new Set(ids.filter((id) => !before.has(id))));
  }
  const noted = note
    ? tiers.find(
        (tier) => tier.entries.length > 1 && tieNote(tier.entries.map((entry) => entry.match)),
      )?.key
    : undefined;
  const row = (entry: Ranked) => (
    <li
      key={entry.member.id}
      data-flip={entry.member.id}
      className={cn(entered.has(entry.member.id) && "motion-safe:animate-row-in")}
    >
      <MemberRow member={entry.member} match={entry.match} yours={yours.has(entry.member.id)} />
    </li>
  );
  return (
    <ul
      aria-label={label}
      className="flex flex-col divide-y divide-hairline overflow-hidden rounded-card bg-paper"
    >
      {tiers.map((tier) =>
        tier.entries.length === 1 ? (
          row(tier.entries[0]!)
        ) : (
          <TieGroup
            key={tier.key}
            tier={tier}
            note={tier.key === noted ? tieNote(tier.entries.map((entry) => entry.match)) : null}
            row={row}
          />
        ),
      )}
    </ul>
  );
}

function TieGroup({
  tier,
  note,
  row,
}: {
  tier: Tier<MemberView>;
  note: string | null;
  row: (entry: Ranked) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const visible = open ? tier.entries : tier.entries.slice(0, TIER_PREVIEW);
  const labelId = `tie-${tier.key}`;
  return (
    <li className="flex flex-col pt-3">
      <div className="flex flex-col gap-0.5 px-4 sm:px-5">
        <p
          id={labelId}
          className="text-sm font-bold text-ink-2 tabular-nums"
          data-fact="match"
          data-receipt-id="method-match"
        >
          Tied at {tier.percent}%
        </p>
        {note && <p className="max-w-[60ch] text-sm text-ink-2">{note}</p>}
      </div>
      <ul
        aria-labelledby={labelId}
        className="mt-1 ml-4 flex flex-col divide-y divide-hairline border-l-2 border-ink-3-graphic sm:ml-5"
      >
        {visible.map(row)}
      </ul>
      {tier.entries.length > TIER_PREVIEW && (
        <div className="px-4 py-3 sm:px-5">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="w-full tabular-nums"
          >
            {open ? "Show fewer" : `Show all ${tier.entries.length} members`}
          </Button>
        </div>
      )}
    </li>
  );
}
