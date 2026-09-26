"use client";

import { ChevronDown, LayoutGrid, RotateCcw, Table2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { PartyTag } from "@/components/party-tag";
import {
  POSITION_CELL,
  POSITION_LABEL,
  POSITION_KEY,
  POSITION_LETTER,
  PositionGlyph,
} from "@/components/rollcall/position-cell";
import { publishReplay } from "@/components/rollcall/replay-store";
import { ResultBar } from "@/components/rollcall/result-bar";
import { Button } from "@/components/ui/button";
import { useFirstView } from "@/hooks/use-first-view";
import {
  boardRows,
  isVotersMember,
  seatLabel,
  type BoardRow,
  type BoardView,
} from "@/lib/bill-views";
import { chamberName, formatInteger, STATE_NAMES } from "@/lib/format";
import { lightingDelays, litCounts } from "@/lib/seat-layout";
import { cn } from "@/lib/utils";
import { useVoter } from "@/lib/voter-store";

/**
 * The Board: a roll call replayed like the House's electronic vote board.
 * One row per state, its two-letter code in a column at the left, so the state order reads down the
 * page. Every cell is a 24 px link to that member (the WCAG target floor); arrow keys move between
 * cells, up and down by state. The voter's own members, when a location is saved on this device, wear a
 * marigold ring with an ink edge.
 *
 * The server renders every cell lit, so the chart is complete without JavaScript. After hydration, the
 * first time it scrolls into view, the board clears and members light over about 1.2 s while the result
 * bar counts up. Below 834 px the Board folds into one "Replay the vote board" row, so a phone reader
 * chooses the 1,700 px of cells; opening it plays the replay.
 */

const SPAN = 1.2;

export function Board({
  board,
  title = "The Board",
  repeatsHeader = false,
  children,
}: {
  board: BoardView;
  title?: string;
  /** The page header already states the result (the roll call page): keep the summary for screen readers only. */
  repeatsHeader?: boolean;
  /** Shown under the summary, such as a link to the full roll call. */
  children?: ReactNode;
}) {
  const { rollCall, seats, summary } = board;
  const reduce = useReducedMotion();
  const { location } = useVoter();
  const ids = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("board");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [inspected, setInspected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  /** Members recorded so far while the Board replays, like the chamber's own running count. */
  const [recorded, setRecorded] = useState<number | null>(null);
  const running = useRef(false);
  const positions = useMemo(() => seats.map((seat) => seat.position), [seats]);
  const rows = useMemo(() => boardRows(seats), [seats]);
  /** Each cell's row and its place in that row, for moving up and down by state. */
  const places = useMemo(
    () => rows.flatMap((row, rowIndex) => row.cells.map((_, place) => ({ row: rowIndex, place }))),
    [rows],
  );
  const mine = useMemo(
    () =>
      new Set(
        seats.flatMap((seat, index) =>
          isVotersMember(rollCall.chamber, seat, location) ? [index] : [],
        ),
      ),
    [seats, rollCall.chamber, location],
  );
  const delays = useMemo(
    () => lightingDelays(seats.length, rollCall.number * 31 + rollCall.date.length, SPAN),
    [seats.length, rollCall.number, rollCall.date],
  );
  const senate = rollCall.chamber === "senate";
  const chamber = chamberName(rollCall.chamber);

  const replay = async () => {
    const grid = gridRef.current;
    if (!grid || running.current || view === "table") return;
    if (reduce) return;
    running.current = true;
    setPlaying(true);
    let frame = 0;
    try {
      const { lightCells } = await import("@/components/rollcall/rollcall-motion");
      const lights = [...grid.querySelectorAll<HTMLElement>("[data-light]")];
      const start = performance.now() + 120;
      let last = -1;
      const tick = (now: number) => {
        const elapsed = (now - start) / 1000;
        const step = Math.floor(elapsed / 0.09);
        if (step !== last) {
          last = step;
          const lit = litCounts(positions, delays, elapsed);
          publishReplay(rollCall.id, lit);
          setRecorded(Math.min(seats.length, lit.Yea + lit.Nay + lit.Present + lit.NotVoting));
        }
        if (elapsed < SPAN + 0.2) frame = requestAnimationFrame(tick);
      };
      publishReplay(rollCall.id, { Yea: 0, Nay: 0, Present: 0, NotVoting: 0 });
      frame = requestAnimationFrame(tick);
      await lightCells(lights, delays);
    } finally {
      cancelAnimationFrame(frame);
      publishReplay(rollCall.id, null);
      running.current = false;
      setPlaying(false);
      setRecorded(null);
    }
  };

  useFirstView(gridRef, 0.15, () => void replay(), reduce === false);

  const focusCell = (next: number) => {
    setActive(next);
    gridRef.current?.querySelectorAll<HTMLElement>("[data-cell]")[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const here = places[active];
    if (!here) return;
    const byRow = (step: number) => {
      const row = rows[here.row + step];
      return row ? row.cells[Math.min(here.place, row.cells.length - 1)]! : active;
    };
    const moves: Record<string, () => number> = {
      ArrowRight: () => Math.min(seats.length - 1, active + 1),
      ArrowLeft: () => Math.max(0, active - 1),
      ArrowDown: () => byRow(1),
      ArrowUp: () => byRow(-1),
      Home: () => 0,
      End: () => seats.length - 1,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusCell(move());
  };

  const inspect = (event: React.SyntheticEvent) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (cell) setInspected(cell.getAttribute("aria-label"));
  };

  // The 432 cells are plain links with no per-cell handlers, so hydrating the Board stays cheap. The
  // grid handles focus (the roving tab stop) and clicks (client-side navigation) for all of them.
  const onCellFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    inspect(event);
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (cell) setActive(Number(cell.dataset.cell));
  };

  const onCellClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    const seat = cell ? seats[Number(cell.dataset.cell)] : undefined;
    if (!seat || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.altKey) return;
    event.preventDefault();
    router.push(`/people/${seat.slug}`);
  };

  const yours =
    mine.size === 0
      ? ""
      : senate
        ? ` Your ${mine.size === 1 ? "senator has" : "senators have"} a marigold ring.`
        : " Your representative has a marigold ring.";

  return (
    <div className="flex flex-col gap-5">
      {/* Phones: the Board folds into one row. The heading wraps the button (the accordion pattern). */}
      <h2 className="min-[834px]:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${ids}-content`}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-16 w-full items-center gap-3 rounded-card border border-hairline bg-paper px-4 py-3 text-left transition-colors active:bg-canvas"
        >
          <LayoutGrid className="size-6 shrink-0 text-ink" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg leading-snug font-bold text-ink">
              Replay the {chamber} vote board
            </span>
            <span className="text-sm font-normal text-ink-2">
              Every member&apos;s vote, state by state
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-ink transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>

      <div
        id={`${ids}-content`}
        className={cn("flex flex-col gap-5", !open && "max-[833px]:hidden")}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h2 id={`${ids}-title`} className="text-2xl font-bold text-ink max-[833px]:sr-only">
              {title}
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void replay()}
                // aria-disabled, not disabled: disabling the focused button would drop focus to the page.
                aria-disabled={playing || view === "table"}
              >
                <RotateCcw className="size-4" aria-hidden />
                Replay
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={view === "table"}
                onClick={() => setView((current) => (current === "board" ? "table" : "board"))}
              >
                <Table2 className="size-4" aria-hidden />
                View as table
              </Button>
            </div>
          </div>
          <p
            id={`${ids}-summary`}
            className={cn(
              "max-w-[68ch] text-base text-ink-2 tabular-nums",
              repeatsHeader && "sr-only",
            )}
          >
            {summary}
          </p>
          {children}
        </div>

        <ResultBar rollCall={rollCall} variant="compact" />
        {rollCall.tieBreaker && (
          <p className="type-meta text-ink-2">
            The tie was broken by the {rollCall.tieBreaker.by}, voting {rollCall.tieBreaker.vote}.
            The Vice President is not a member, so the tie-breaking vote is not a cell on the board.
          </p>
        )}

        <div
          className="-mx-2 rounded-card border border-hairline bg-paper p-2 sm:mx-0 sm:p-4"
          data-fact="roll-call-positions"
          data-receipt-id={rollCall.receipt.sourceId}
        >
          <div
            ref={gridRef}
            role="group"
            aria-labelledby={`${ids}-title`}
            aria-describedby={`${ids}-summary ${ids}-keys`}
            hidden={view !== "board"}
            onKeyDown={onKeyDown}
            onMouseOver={inspect}
            onFocus={onCellFocus}
            onClick={onCellClick}
            className={cn("gap-x-6", senate ? "columns-[6.5rem]" : "columns-[15rem]")}
          >
            <BoardCells
              seats={seats}
              rows={rows}
              chamber={rollCall.chamber}
              active={active}
              mine={mine}
            />
          </div>
          {view === "board" && (
            <p
              className="mt-3 min-h-[3.1em] px-1 type-meta text-ink-2 sm:px-0"
              aria-hidden
              data-testid="board-inspector"
            >
              {inspected ??
                (recorded !== null
                  ? `Voting: ${formatInteger(recorded)} of ${formatInteger(seats.length)} members recorded`
                  : `Each square is one member, grouped by state from ${STATE_NAMES[seats[0]!.state]} to ${STATE_NAMES[seats.at(-1)!.state]}. Select a square to open that member.${yours}`)}
            </p>
          )}
          <p id={`${ids}-keys`} className="sr-only">
            Use the arrow keys to move between members, up and down to move between states, and
            Enter to open one.
          </p>
          {view === "table" && <BoardTable board={board} captionId={`${ids}-title`} />}
        </div>
      </div>
    </div>
  );
}

/**
 * The cells, memoized: while the Board replays, the tallies and the readout update every 90 ms and the
 * cells stay put (the lighting runs on the compositor), so only the counters re-render.
 */
const BoardCells = memo(function BoardCells({
  seats,
  rows,
  chamber,
  active,
  mine,
}: {
  seats: BoardView["seats"];
  rows: readonly BoardRow[];
  chamber: BoardView["rollCall"]["chamber"];
  active: number;
  mine: ReadonlySet<number>;
}) {
  const own = chamber === "senate" ? "your senator" : "your representative";
  return rows.map((row) => (
    <div key={row.state} className="mb-1 flex break-inside-avoid items-start gap-1.5">
      <span
        aria-hidden
        className="w-7 shrink-0 text-sm leading-6 font-bold text-ink-2 tabular-nums"
      >
        {row.state}
      </span>
      <div className="flex min-w-0 flex-wrap gap-[2px]">
        {row.cells.map((index) => {
          const seat = seats[index]!;
          const yours = mine.has(index);
          return (
            <a
              key={seat.slug}
              href={`/people/${seat.slug}`}
              data-cell={index}
              data-you={yours || undefined}
              tabIndex={index === active ? 0 : -1}
              aria-label={`${seatLabel(chamber, seat)}${yours ? `, ${own}` : ""}`}
              className="board-cell relative size-6 shrink-0 rounded-[4px] bg-badge focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold-strong"
            >
              <span
                data-light
                aria-hidden
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-[4px] text-xs leading-none font-extrabold",
                  POSITION_CELL[seat.position],
                )}
              >
                {POSITION_LETTER[seat.position]}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  ));
});

function BoardTable({ board, captionId }: { board: BoardView; captionId: string }) {
  return (
    <div className="max-h-[560px] overflow-auto">
      <p className="pb-2 type-meta text-ink-2">{POSITION_KEY}</p>
      <table className="w-full border-collapse text-left text-sm" aria-describedby={captionId}>
        <caption className="sr-only">Every member&apos;s vote, in state order</caption>
        <thead className="sticky top-0 bg-paper">
          <tr className="border-b border-hairline text-ink-2">
            <th scope="col" className="py-2 pr-3 font-bold">
              Member
            </th>
            <th scope="col" className="py-2 pr-3 font-bold">
              State
            </th>
            <th scope="col" className="py-2 pr-3 font-bold">
              Party
            </th>
            <th scope="col" className="py-2 font-bold">
              Vote
            </th>
          </tr>
        </thead>
        <tbody>
          {board.seats.map((seat) => (
            <tr key={seat.slug} className="border-b border-hairline last:border-0">
              <th scope="row" className="py-1.5 pr-3 font-bold">
                <Link
                  href={`/people/${seat.slug}`}
                  prefetch={false}
                  className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                >
                  {seat.name}
                </Link>
              </th>
              <td className="py-1.5 pr-3 text-ink-2">{seat.state}</td>
              <td className="py-1.5 pr-3">
                <PartyTag party={seat.party} />
              </td>
              <td className="py-1.5">
                <span className="inline-flex items-center gap-2 text-ink">
                  <PositionGlyph position={seat.position} />
                  {POSITION_LABEL[seat.position]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
