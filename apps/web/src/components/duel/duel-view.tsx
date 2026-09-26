"use client";

import { personIdToSlug, type Position, type Stance } from "@for-the-people/core/client";
import { ChevronDown, FileText } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
} from "react";
import { AgreementGlyph } from "@/components/agreement-glyph";
import { monthGroups } from "@/components/duel/duel-lines";
import { DuelTimeline } from "@/components/duel/duel-timeline";
import { MemberSlot, type RosterMember } from "@/components/duel/member-picker";
import { Portrait } from "@/components/portrait";
import { PositionGlyph } from "@/components/rollcall/position-cell";
import { ShowMore } from "@/components/show-more";
import { Button, buttonVariants } from "@/components/ui/button";
import { RollingNumber } from "@/components/rolling-number";
import { ReceiptSheet, type ReceiptItem } from "@/components/receipt/receipt-sheet";
import { CARD_METHOD, rollCallReceipt } from "@/components/swipe/card-receipt";
import {
  keyVoteDuel,
  type DuelSplitView,
  type DuelView as DuelData,
  type KeyVoteDuelRow,
  type KeyVoteDuelSide,
} from "@/lib/duel";
import { chamberName, formatDate, formatShare } from "@/lib/format";
import { isPassageVote, plainVoteTitle } from "@/lib/outcomes";
import { stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CardView, MemberView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";

/** The voter's own marks: answers live on the device, so they load after hydration. */
const YouCell = lazy(() =>
  import("@/components/duel/you-marks").then((module) => ({ default: module.YouCell })),
);
const YouLineMarks = lazy(() =>
  import("@/components/duel/you-marks").then((module) => ({ default: module.YouLine })),
);

/** Split rows per page: 20 from tablet up, 10 on a phone. */
const SPLITS_PAGE = { phone: 10, wide: 20 } as const;

const POSITION_TEXT: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "Did not vote",
};

const DUEL_METHOD =
  "Both members' votes are copied from this official roll call. A split means one voted Yea and the other voted Nay.";

const subscribeNothing = () => () => {};

/** False on the server and during hydration, true afterwards: animations start only once the page is live. */
const useHydrated = () =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

interface OpenReceipt {
  subject: string;
  item: ReceiptItem;
  method: string;
}

/** Short names for the two sides: last names, or full names when the last names match. */
function sideNames(a: MemberView, b: MemberView): [string, string] {
  return a.lastName === b.lastName ? [a.name, b.name] : [a.lastName, b.lastName];
}

/** Vote Duel: two members' real votes side by side. */
export function DuelView({
  roster,
  a,
  b,
  missing,
  cards,
  positionsA,
  positionsB,
  duel,
}: {
  roster: RosterMember[];
  a: MemberView | null;
  b: MemberView | null;
  /** Slugs in the URL that match no member. */
  missing: string[];
  cards: CardView[];
  positionsA: Record<string, Position>;
  positionsB: Record<string, Position>;
  duel: DuelData | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  /**
   * A pick changes one side in the address (`?a=<slug>&b=<slug>`) and the server renders the new pair;
   * the page stays in place and dims while it loads. The router is enough here, so the Duel does not
   * carry a URL-state library in its first-load JavaScript.
   */
  const pick = (side: "a" | "b", id: string) =>
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set(side, personIdToSlug(id));
      router.replace(`/duel?${params.toString()}`, { scroll: false });
    });
  const [receipt, setReceipt] = useState<OpenReceipt | null>(null);
  const same = a !== null && b !== null && a.id === b.id;
  const ready = a !== null && b !== null && !same;

  return (
    <div className={cn("flex flex-col gap-10 transition-opacity", pending && "opacity-60")}>
      <section aria-label="Members to compare" className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <MemberSlot
            side="a"
            member={a}
            roster={roster}
            exclude={b?.id ?? null}
            pending={pending}
            onPick={(id) => pick("a", id)}
          />
          <MemberSlot
            side="b"
            member={b}
            roster={roster}
            exclude={a?.id ?? null}
            pending={pending}
            onPick={(id) => pick("b", id)}
          />
        </div>
        {missing.length > 0 && (
          <p className="type-meta text-ink-2" role="status">
            No member matches {missing.map((slug) => `"${slug}"`).join(" or ")}. Choose one from the
            list instead.
          </p>
        )}
        {same && (
          <p className="type-meta text-ink-2" role="status">
            Pick two different members to compare.
          </p>
        )}
      </section>

      {ready ? (
        <Duel
          key={`${a.id}-${b.id}`}
          a={a}
          b={b}
          cards={cards}
          positionsA={positionsA}
          positionsB={positionsB}
          duel={duel}
          onReceipt={setReceipt}
        />
      ) : (
        !same && (
          <p className="max-w-[68ch] rounded-card bg-paper p-5 text-base text-ink-2">
            Choose two members to see every roll call they both voted on, how often they voted the
            same way, and where they split.
          </p>
        )
      )}

      <ReceiptSheet
        open={receipt !== null}
        onOpenChange={(open) => !open && setReceipt(null)}
        subject={receipt?.subject ?? ""}
        items={receipt ? [receipt.item] : []}
        method={receipt?.method ?? ""}
      />
    </div>
  );
}

function Duel({
  a,
  b,
  cards,
  positionsA,
  positionsB,
  duel,
  onReceipt,
}: {
  a: MemberView;
  b: MemberView;
  cards: CardView[];
  positionsA: Record<string, Position>;
  positionsB: Record<string, Position>;
  duel: DuelData | null;
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  const names = useMemo(() => sideNames(a, b), [a, b]);
  const { stances } = useVoter();
  const rows = useMemo(
    () =>
      keyVoteDuel(cards, new Map(Object.entries(positionsA)), new Map(Object.entries(positionsB))),
    [cards, positionsA, positionsB],
  );
  const answered = stances.some((stance) => stance.choice !== "Skip");
  const [youLine, setYouLine] = useState<{ stances: readonly Stance[]; line: string } | null>(null);
  useEffect(() => {
    if (!answered) return;
    let cancelled = false;
    void import("@/components/duel/duel-you").then(({ voterLine }) => {
      if (cancelled) return;
      const line = voterLine(names, cards, stances, [
        { id: a.id, positions: positionsA },
        { id: b.id, positions: positionsB },
      ]);
      setYouLine({ stances, line });
    });
    return () => {
      cancelled = true;
    };
  }, [answered, cards, stances, names, a.id, b.id, positionsA, positionsB]);
  const line = answered && youLine?.stances === stances ? youLine.line : null;
  const shareRollCalls = duel !== null && duel.bothRecorded > 0;
  return (
    <>
      {shareRollCalls ? (
        <Scoreboard duel={duel} names={names} youLine={line} answered={answered} />
      ) : (
        <section
          aria-labelledby="no-shared"
          className="flex max-w-[68ch] flex-col gap-2 rounded-card bg-paper p-5"
        >
          <h2 id="no-shared" className="text-xl font-bold text-ink">
            No shared roll calls
          </h2>
          <p className="text-base text-ink-2">
            {a.chamber !== b.chamber
              ? `${names[0]} served in the ${chamberName(a.chamber)} and ${names[1]} in the ${chamberName(b.chamber)}, so they never voted on the same roll call. Below, each one's vote on the key-vote bills in their own chamber, compared on whether they voted for or against the bill.`
              : `${names[0]} and ${names[1]} have no roll call in this Congress that both were recorded on.`}
          </p>
          <YouLine line={line} answered={answered} />
        </section>
      )}
      <KeyVotes
        rows={rows}
        names={names}
        members={[a, b]}
        stances={answered ? stances : null}
        onReceipt={onReceipt}
      />
      {duel && duel.splits.length > 0 && (
        <Splits splits={duel.splits} names={names} members={[a, b]} onReceipt={onReceipt} />
      )}
    </>
  );
}

/**
 * The voter's own line under the headline, once the page is live (answers stay on the device). The line
 * keeps its height before then, so nothing below it moves.
 */
function YouLine({ line, answered }: { line: string | null; answered: boolean }) {
  const hydrated = useHydrated();
  return (
    <p className="flex min-h-7 flex-wrap items-center gap-x-2 text-lg font-bold text-ink">
      {hydrated && (
        <Suspense fallback={null}>
          <YouLineMarks line={line} answered={answered} />
        </Suspense>
      )}
    </p>
  );
}

function Scoreboard({
  duel,
  names,
  youLine,
  answered,
}: {
  duel: DuelData;
  names: [string, string];
  youLine: string | null;
  answered: boolean;
}) {
  const reduce = useReducedMotion();
  // The server and hydration render the real count; after that the count rolls up from 0 once.
  const hydrated = useHydrated();
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!hydrated || reduce) return;
    const frame = requestAnimationFrame(() => setRolling(true));
    return () => cancelAnimationFrame(frame);
  }, [hydrated, reduce]);
  const count = !hydrated || reduce || rolling ? duel.agreed : 0;
  const sentence = `${names[0]} and ${names[1]} agreed on ${duel.agreed} of ${duel.shared} shared ${duel.shared === 1 ? "vote" : "votes"}`;
  const range =
    duel.firstDate && duel.lastDate
      ? `${formatDate(duel.firstDate)} to ${formatDate(duel.lastDate)}`
      : "";
  // After hydration the meter slides in from both ends. Reduced motion keeps it settled.
  const slide = (weight: number, origin: "left" | "right") => ({
    className: hydrated && !reduce ? "animate-meter-in" : undefined,
    style: { flexGrow: weight, flexBasis: 0, transformOrigin: origin },
  });

  return (
    <section
      aria-labelledby="agreement"
      className="flex flex-col gap-5 rounded-card bg-paper p-5 md:p-7"
      data-fact="duel-agreement"
      data-receipt-id="method-duel"
    >
      <div className="flex flex-col gap-2">
        <h2 id="agreement" className="text-2xl font-extrabold tracking-tight text-ink md:text-4xl">
          <span className="sr-only">{sentence}</span>
          <span aria-hidden>
            Agreed on <RollingNumber value={count} animated={rolling} className="tabular-nums" /> of{" "}
            <span className="tabular-nums">{duel.shared}</span> shared{" "}
            {duel.shared === 1 ? "vote" : "votes"}
          </span>
        </h2>
        <YouLine line={youLine} answered={answered} />
        <p className="max-w-[68ch] text-base text-ink-2">
          Recorded votes (roll calls) in this Congress where both {names[0]} and {names[1]} voted
          Yea or Nay{range ? `, ${range}` : ""}. Votes where either one was Present or did not vote
          are left out ({duel.bothRecorded - duel.shared} of {duel.bothRecorded}).{" "}
          <Link
            href="/methodology#vote-duel"
            className="font-bold text-ink underline underline-offset-4"
          >
            How we count
          </Link>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* A slim meter, quieter than the headline it supports: agree filled, split hollow. */}
        <div
          className="flex h-2.5 w-full gap-1"
          role="img"
          aria-label={`Agreed on ${duel.agreed} of ${duel.shared} shared votes, ${formatShare(duel.agreed, duel.shared)}; split on ${duel.split}, ${formatShare(duel.split, duel.shared)}`}
        >
          {duel.agreed > 0 && (
            <div
              {...slide(duel.agreed, "left")}
              className={cn(
                "h-full rounded-l-full bg-agree last:rounded-r-full",
                slide(duel.agreed, "left").className,
              )}
            />
          )}
          {duel.split > 0 && (
            <div
              {...slide(duel.split, "right")}
              className={cn(
                "h-full rounded-r-full border-[1.5px] border-split bg-split-soft first:rounded-l-full",
                slide(duel.split, "right").className,
              )}
            />
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 tabular-nums" aria-hidden>
          <AgreementGlyph agree>
            Agreed: {duel.agreed} ({formatShare(duel.agreed, duel.shared)})
          </AgreementGlyph>
          <AgreementGlyph agree={false}>
            Split: {duel.split} ({formatShare(duel.split, duel.shared)})
          </AgreementGlyph>
        </div>
      </div>

      <div className="border-t border-hairline pt-5">
        <DuelTimeline months={duel.months} animate={hydrated && !reduce} />
      </div>
    </section>
  );
}

/** One member's vote on a key vote: the Board glyph and the word, opening that roll call's receipt. */
function PositionCell({
  name,
  side,
  showMeasure,
  showRollCall,
  onOpen,
}: {
  name: string;
  side: KeyVoteDuelSide | null;
  showMeasure: boolean;
  /** False when both members voted on the same roll call and the row names it once. */
  showRollCall: boolean;
  onOpen: () => void;
}) {
  if (!side) {
    return (
      <span className="flex min-h-11 flex-col justify-center text-sm">
        <span className="font-bold text-ink-2">{name}</span>
        <span className="text-ink-2">No recorded vote</span>
      </span>
    );
  }
  const { rollCall, position, supports } = side;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "inline-flex min-h-11 gap-2 rounded-control text-left text-sm",
        showRollCall || (showMeasure && supports !== null) ? "items-start" : "items-center",
      )}
      data-fact="vote-position"
      data-receipt-id={rollCall.receipt.sourceId}
    >
      <PositionGlyph position={position} className="mt-px" />
      <span className="min-w-0">
        <span className="block font-bold text-ink">
          <span className="md:sr-only">{name}: </span>
          {POSITION_TEXT[position]}
        </span>
        {showMeasure && supports !== null && (
          <span className="block text-ink-2">
            {supports ? "Voted for the bill" : "Voted against the bill"}
          </span>
        )}
        <span
          className={cn(
            "block whitespace-nowrap text-ink-2 underline decoration-hairline underline-offset-4",
            !showRollCall && "sr-only",
          )}
        >
          {chamberName(rollCall.chamber)} roll call {rollCall.number}
        </span>
      </span>
    </button>
  );
}

function Outcome({ row }: { row: KeyVoteDuelRow }) {
  if (row.outcome === "none") return <span className="type-meta text-ink-2">No comparison</span>;
  return (
    <AgreementGlyph agree={row.outcome === "agree"}>
      {row.outcome === "agree" ? "Agreed" : "Split"}
    </AgreementGlyph>
  );
}

/** Key-vote rows: what was voted on, both votes, and the outcome, on one grid from tablet up. */
const KEY_VOTE_GRID =
  "md:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_7rem] lg:grid-cols-[minmax(0,1fr)_11rem_11rem_8rem]";
/** The same, with the voter's own answer first among the votes. */
const KEY_VOTE_GRID_YOU =
  "md:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_6.5rem] lg:grid-cols-[minmax(0,1fr)_7rem_10rem_10rem_7.5rem]";
/** Split rows: the roll call, both votes, and its receipt. */
const SPLIT_GRID =
  "md:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_auto] lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]";

/**
 * From tablet up, the vote columns get a head with each member's portrait and name, so the rows print
 * only "Yea" or "Nay" (the name stays in each row for screen readers). The voter's column, when there is
 * one, is headed "You" with a marigold underline.
 */
function ColumnHeads({
  members,
  names,
  grid,
  last,
  you = false,
}: {
  members: [MemberView, MemberView];
  names: [string, string];
  grid: string;
  last: string;
  you?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn("hidden items-center gap-5 px-5 type-meta font-bold text-ink-2 md:grid", grid)}
    >
      <span />
      {you && (
        <span className="w-fit text-base font-bold text-ink underline decoration-you-mark decoration-[3px] underline-offset-[6px]">
          You
        </span>
      )}
      {members.map((member, index) => (
        <span key={member.id} className="flex min-w-0 items-center gap-2 text-ink">
          <Portrait
            portrait={member.portrait}
            name={member.name}
            sizes="32px"
            className="w-8 shrink-0 rounded-control"
          />
          <span className="truncate">{names[index]}</span>
        </span>
      ))}
      <span>{last}</span>
    </div>
  );
}

function KeyVotes({
  rows,
  names,
  members,
  stances,
  onReceipt,
}: {
  rows: KeyVoteDuelRow[];
  names: [string, string];
  members: [MemberView, MemberView];
  /** The voter's answers, when they have any: adds the "You" column. */
  stances: readonly Stance[] | null;
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  const hydrated = useHydrated();
  const reduce = useReducedMotion();
  const play = hydrated && !reduce;
  const compared = rows.filter((row) => row.outcome !== "none");
  const unmatched = rows.filter((row) => row.outcome === "none");
  const agreed = compared.filter((row) => row.outcome === "agree").length;
  const crossChamber = rows.some((row) => row.a && row.b && !row.sameRollCall);
  const answers = useMemo(
    () => (stances ? new Map(stances.map((stance) => [stance.keyVoteId, stance])) : null),
    [stances],
  );
  const grid = answers ? KEY_VOTE_GRID_YOU : KEY_VOTE_GRID;
  const open = (row: KeyVoteDuelRow, side: KeyVoteDuelSide, name: string) =>
    onReceipt({
      subject: `${name}'s vote on ${row.card.card.title}`,
      item: rollCallReceipt(side.rollCall),
      method: `${CARD_METHOD} The member's vote is copied from the same official roll call.`,
    });
  // After hydration both votes on a key vote drop in together, row by row. The server renders them
  // settled, and reduced motion keeps them settled.
  const drop = (index: number) =>
    play
      ? {
          className: "animate-drop-in",
          style: { animationDelay: `${Math.round((0.35 + index * stagger.list) * 1000)}ms` },
        }
      : {};
  const row = (item: KeyVoteDuelRow, dropIn: { className?: string; style?: CSSProperties }) => (
    <KeyVoteRow
      key={item.card.id}
      row={item}
      names={names}
      grid={grid}
      you={answers ? { stance: answers.get(item.card.id) } : null}
      drop={dropIn}
      onOpen={(side, name) => open(item, side, name)}
    />
  );

  return (
    <section aria-labelledby="duel-key-votes" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="duel-key-votes" className="text-2xl font-bold text-ink">
          Key votes
        </h2>
        <p
          className="type-meta text-ink-2 tabular-nums"
          data-fact="duel-key-votes"
          data-receipt-id="method-duel"
        >
          {compared.length > 0
            ? `${crossChamber ? "Took the same side on" : "Agreed on"} ${agreed} of ${compared.length} key ${compared.length === 1 ? "vote" : "votes"} where both voted Yea or Nay.`
            : "No key vote where both voted Yea or Nay."}
          {crossChamber ? " Votes in different chambers are compared on the bill itself." : ""}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <ColumnHeads
          members={members}
          names={names}
          grid={grid}
          last="Result"
          you={answers !== null}
        />
        <ul className="flex flex-col divide-y divide-hairline rounded-card border border-hairline bg-paper">
          {compared.map((item, index) => row(item, drop(index)))}
        </ul>
      </div>
      {unmatched.length > 0 && (
        <details className="group flex flex-col">
          <summary
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-fit cursor-pointer list-none group-open:mb-3 [&::-webkit-details-marker]:hidden",
            )}
          >
            {unmatched.length} key {unmatched.length === 1 ? "vote" : "votes"} with no shared vote
            <ChevronDown
              className="size-4 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="flex flex-col divide-y divide-hairline rounded-card border border-hairline bg-paper">
            {unmatched.map((item) => row(item, {}))}
          </ul>
        </details>
      )}
    </section>
  );
}

function KeyVoteRow({
  row,
  names,
  grid,
  you,
  drop,
  onOpen,
}: {
  row: KeyVoteDuelRow;
  names: [string, string];
  grid: string;
  /** The voter's answer on this key vote, when the page shows the "You" column. */
  you: { stance: Stance | undefined } | null;
  drop: { className?: string; style?: CSSProperties };
  onOpen: (side: KeyVoteDuelSide, name: string) => void;
}) {
  const shared = row.sameRollCall && row.a ? row.a.rollCall : null;
  // Tablet up: title, [You], member A, member B, result. Phones: title and result, then the votes.
  const column = (index: number) =>
    ["md:col-start-2", "md:col-start-3", "md:col-start-4", "md:col-start-5"][index + (you ? 1 : 0)];
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 px-4 py-4 sm:px-5 md:items-center md:gap-5",
        grid,
      )}
    >
      <div className="col-start-1 row-start-1 min-w-0">
        <p className="leading-snug font-bold text-ink">{row.card.card.title}</p>
        <p className="flex flex-wrap gap-x-3 type-meta text-ink-2">
          <span>{row.card.issue.label}</span>
          {shared && (
            <Link
              href={`/votes/${shared.id}`}
              className="-my-2 py-2 whitespace-nowrap underline decoration-hairline underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              {chamberName(shared.chamber)} roll call {shared.number}
            </Link>
          )}
        </p>
      </div>
      <div className={cn("col-start-2 row-start-1 pt-0.5 md:pt-0", column(2))}>
        <Outcome row={row} />
      </div>
      <div className={cn("col-span-2 grid gap-3 md:contents", you ? "grid-cols-3" : "grid-cols-2")}>
        {you && (
          <div className={cn("md:col-start-2 md:row-start-1", drop.className)} style={drop.style}>
            <Suspense fallback={<span className="flex min-h-11" />}>
              <YouCell row={row} stance={you.stance} />
            </Suspense>
          </div>
        )}
        {(
          [
            [names[0], row.a],
            [names[1], row.b],
          ] as const
        ).map(([name, side], index) => (
          <div
            key={name}
            className={cn("md:row-start-1", column(index), drop.className)}
            style={drop.style}
          >
            <PositionCell
              name={name}
              side={side}
              showMeasure={!row.sameRollCall}
              showRollCall={!row.sameRollCall}
              onOpen={() => side && onOpen(side, name)}
            />
          </div>
        ))}
      </div>
    </li>
  );
}

/** Final votes on a measure or a nominee, the ones a voter most often means by "how they voted". */
const isFinalVote = (rollCall: DuelSplitView["rollCall"]): boolean =>
  isPassageVote(rollCall) || /^On the Nomination$/i.test(rollCall.question.trim());

/**
 * Every roll call where one voted Yea and the other Nay, newest first, under a sticky header for each
 * month. Each row leads with the vote in plain words (lib/outcomes.ts) and keeps the official question
 * under it. Twenty rows at a time, ten on a phone.
 */
function Splits({
  splits,
  names,
  members,
  onReceipt,
}: {
  splits: DuelSplitView[];
  names: [string, string];
  members: [MemberView, MemberView];
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  const phone = useMediaQuery("(max-width: 767px)");
  const page = phone ? SPLITS_PAGE.phone : SPLITS_PAGE.wide;
  const listRef = useRef<HTMLDivElement>(null);
  const noRows = useRef<HTMLElement>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [finalOnly, setFinalOnly] = useState(false);
  /** The row to focus after "Show more", since the rows sit in several month lists. */
  const focusFrom = useRef<number | null>(null);
  const finals = useMemo(() => splits.filter((split) => isFinalVote(split.rollCall)), [splits]);
  const list = finalOnly ? finals : splits;
  const shown = list.slice(0, limit ?? page);
  const months = monthGroups(shown.map((split, index) => ({ ...split, index })));
  const filters = [
    { final: false, label: "All roll calls", count: splits.length },
    { final: true, label: "Votes to pass or confirm", count: finals.length },
  ];

  useLayoutEffect(() => {
    const from = focusFrom.current;
    if (from === null || shown.length <= from) return;
    focusFrom.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-split="${from}"] a[href], [data-split="${from}"] button:not([disabled])`,
      )
      ?.focus({ preventScroll: true });
  }, [shown.length]);

  return (
    <section aria-labelledby="duel-splits" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="duel-splits" className="text-2xl font-bold text-ink tabular-nums">
          Where they split ({splits.length})
        </h2>
        <p className="type-meta text-ink-2">
          Roll calls where one voted Yea and the other voted Nay, newest first.
        </p>
      </div>
      {finals.length > 0 && finals.length < splits.length && (
        <div role="group" aria-label="Which roll calls" className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Button
              key={filter.label}
              type="button"
              variant="outline"
              aria-pressed={finalOnly === filter.final}
              onClick={() => {
                setFinalOnly(filter.final);
                setLimit(null);
              }}
              className="tabular-nums"
            >
              {filter.label}
              <span className="font-normal text-ink-2">{filter.count}</span>
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <ColumnHeads members={members} names={names} grid={SPLIT_GRID} last="" />
        <div
          ref={listRef}
          className="rounded-card border border-hairline bg-paper [&>section:first-child>h3]:rounded-t-card [&>section:last-child>ul]:border-b-0"
        >
          {months.map((month) => (
            <section key={month.month} aria-labelledby={`split-${month.month}`}>
              <h3
                id={`split-${month.month}`}
                className="sticky top-14 z-10 border-b border-hairline bg-paper px-4 py-2 text-sm font-bold text-ink tabular-nums sm:px-5 md:top-16"
              >
                {month.label}
              </h3>
              <ul className="flex flex-col divide-y divide-hairline border-b border-hairline">
                {month.rows.map(({ rollCall, a, b, index }) => (
                  <SplitRow
                    key={rollCall.id}
                    index={index}
                    rollCall={rollCall}
                    positions={[a, b]}
                    names={names}
                    onReceipt={onReceipt}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {/* The rows sit in several month lists, so this list moves focus itself (focusFrom above). */}
      <ShowMore
        shown={shown.length}
        total={list.length}
        step={page}
        noun="splits"
        listRef={noRows}
        onShow={(next) => {
          focusFrom.current = shown.length;
          setLimit(next);
        }}
      />
    </section>
  );
}

function SplitRow({
  index,
  rollCall,
  positions,
  names,
  onReceipt,
}: {
  index: number;
  rollCall: DuelSplitView["rollCall"];
  positions: [Position, Position];
  names: [string, string];
  onReceipt: (receipt: OpenReceipt) => void;
}) {
  const where = `${chamberName(rollCall.chamber)} roll call ${rollCall.number}`;
  const plain = plainVoteTitle(rollCall, rollCall.measureLabel);
  return (
    <li
      data-split={index}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 px-4 py-4 sm:px-5 md:items-center md:gap-x-5",
        SPLIT_GRID,
      )}
      data-fact="duel-split"
      data-receipt-id={rollCall.receipt.sourceId}
    >
      <div className="col-span-2 row-start-1 flex min-w-0 flex-col gap-1 md:col-span-1 md:col-start-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="text-ink-2 tabular-nums">{formatDate(rollCall.date)}</span>
          {rollCall.measureId && rollCall.measureLabel && (
            <Link
              href={`/bills/${rollCall.measureId}`}
              className="-my-2 py-2 font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
            >
              {rollCall.measureLabel}
            </Link>
          )}
        </p>
        <p className="leading-snug font-bold text-ink">
          {plain ?? rollCall.title ?? rollCall.question}
        </p>
        {plain ? (
          <div className="flex flex-col gap-0.5 type-meta text-ink-2">
            <p>
              <span className="font-bold">Official question:</span> {rollCall.question}
            </p>
            {rollCall.title && <p>{rollCall.title}</p>}
          </div>
        ) : (
          rollCall.title && <p className="type-meta text-ink-2">{rollCall.question}</p>
        )}
      </div>
      <div className="col-span-2 row-start-2 grid grid-cols-2 gap-3 md:contents">
        {positions.map((position, side) => (
          <span
            key={names[side]}
            className={cn(
              "inline-flex min-w-0 items-center gap-2 text-sm md:row-start-1",
              side === 0 ? "md:col-start-2" : "md:col-start-3",
            )}
          >
            <PositionGlyph position={position} />
            <span className="min-w-0 font-bold break-words text-ink">
              <span className="md:sr-only">{names[side]}: </span>
              {POSITION_TEXT[position]}
            </span>
          </span>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onReceipt({
            subject: `${names[0]} and ${names[1]} on ${where}`,
            item: rollCallReceipt(rollCall),
            method: DUEL_METHOD,
          })
        }
        aria-label={`Receipt for ${where}`}
        aria-haspopup="dialog"
        className="col-span-2 row-start-3 w-fit px-3 md:col-span-1 md:col-start-4 md:row-start-1"
      >
        <FileText className="size-4" aria-hidden />
        Receipt
      </Button>
    </li>
  );
}
