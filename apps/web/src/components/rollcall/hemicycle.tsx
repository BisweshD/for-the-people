"use client";

import type { Party, Position } from "@for-the-people/core/client";
import { Table2 } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { PartyTag } from "@/components/party-tag";
import { POSITION_LABEL } from "@/components/rollcall/position-cell";
import { Button } from "@/components/ui/button";
import { partyPlural, type BoardView } from "@/lib/bill-views";
import { formatInteger } from "@/lib/format";
import { hemicycleLayout, hemicycleOrder, meanAngle, type PartyTally } from "@/lib/seat-layout";
import { useVoter } from "@/lib/voter-store";
import { cn } from "@/lib/utils";

/**
 * The hemicycle: the chamber in concentric rows, Democrats on the left and
 * Republicans on the right. A filled seat voted Yea, a hollow seat Nay, a dotted seat Present, and a
 * faint dashed seat did not vote. The server renders the finished chart and it stays settled on load:
 * The Board is the page's one orchestrated sequence. When the voter answers the key vote on this page,
 * the seats assemble by party and a marigold ring lands on the side they would have joined, so the
 * motion is feedback on their answer.
 */

const WIDTH = 480;
const RADIUS = 224;
const CX = WIDTH / 2;
const CY = 236;
const HEIGHT = 248;
const RING_RADIUS = 22;
/** Keeps the ring on the floor of the chamber, clear of the baseline. */
const RING_ANGLE_LIMIT = 0.45;

const SEAT_CLASS: Record<Position, string> = {
  Yea: "fill-ink stroke-ink",
  Nay: "fill-paper stroke-ink",
  Present: "fill-paper stroke-ink",
  NotVoting: "fill-transparent stroke-ink-3-graphic",
};

export function Hemicycle({
  board,
  answerHint,
}: {
  board: BoardView;
  /** Where to answer the key vote behind this roll call, shown until the voter has. */
  answerHint?: ReactNode;
}) {
  const ids = useId();
  const reduce = useReducedMotion();
  const voter = useVoter();
  const seatsRef = useRef<SVGGElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const mountedAt = useRef<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  const { layout, ordered, dividers } = useMemo(() => {
    const ordered = hemicycleOrder(board.seats);
    const layout = hemicycleLayout(ordered.length);
    const dividers: number[] = [];
    ordered.forEach((seat, i) => {
      const next = ordered[i + 1];
      if (next && partyGroup(next.party) !== partyGroup(seat.party)) {
        dividers.push((layout.seats[i]!.angle + layout.seats[i + 1]!.angle) / 2);
      }
    });
    return { layout, ordered, dividers };
  }, [board.seats]);

  const seatR = round(Math.max(1.6, layout.seatRadius * RADIUS));
  const point = (angle: number, radius: number) => ({
    x: round(CX + Math.cos(angle) * radius),
    y: round(CY - Math.sin(angle) * radius),
  });

  const stance = board.keyVote
    ? voter.stances.find((candidate) => candidate.keyVoteId === board.keyVote!.id)
    : undefined;
  const yourSide: "Yea" | "Nay" | null =
    stance && stance.choice !== "Skip" && board.keyVote
      ? (stance.choice === "Yea") === board.keyVote.yeaSupportsMeasure
        ? "Yea"
        : "Nay"
      : null;
  const ring = useMemo(() => {
    if (!yourSide) return null;
    const angle = meanAngle(layout.seats.filter((_, i) => ordered[i]!.position === yourSide));
    return angle === null
      ? null
      : {
          angle: Math.min(Math.max(angle, RING_ANGLE_LIMIT), Math.PI - RING_ANGLE_LIMIT),
          count: ordered.filter((s) => s.position === yourSide).length,
        };
  }, [yourSide, layout.seats, ordered]);

  const assemble = useEffectEvent(async () => {
    const group = seatsRef.current;
    if (!group || reduce !== false) return;
    const { assembleSeats } = await import("@/components/rollcall/rollcall-motion");
    const circles = [...group.querySelectorAll<SVGCircleElement>("circle")];
    const groups = new Map<string, number>();
    ordered.forEach((seat) =>
      groups.set(partyGroup(seat.party), (groups.get(partyGroup(seat.party)) ?? 0) + 1),
    );
    const seen = new Map<string, number>();
    const rank = [...groups.keys()];
    for (const circle of circles) circle.style.opacity = "0";
    await assembleSeats(
      circles.map((element, i) => {
        const group = partyGroup(ordered[i]!.party);
        const within = seen.get(group) ?? 0;
        seen.set(group, within + 1);
        const seat = point(
          layout.seats[i]!.angle,
          Math.hypot(layout.seats[i]!.x, layout.seats[i]!.y) * RADIUS,
        );
        return {
          element,
          dx: (CX - seat.x) * 0.8,
          dy: (CY - seat.y) * 0.8,
          delay: rank.indexOf(group) * 0.16 + (within / (groups.get(group) ?? 1)) * 0.4,
        };
      }),
    );
  });

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);
  // Only an answer given on this page plays the assembly; a stored answer shows the settled chart.
  const answeredAt = yourSide ? stance?.answeredAt : undefined;
  // The chamber's 435 seats sit far below the first screen on a phone; they are drawn once the chart
  // comes near (or an answer needs them), which keeps a quarter of the bill page out of the first
  // style, layout and hydration pass. The empty chart keeps its size, so nothing moves.
  const near = useInView(figureRef, { margin: "400px" });
  const drawSeats = near || Boolean(answeredAt);
  useEffect(() => {
    if (!answeredAt || mountedAt.current === null) return;
    if (Date.parse(answeredAt) < mountedAt.current) return;
    void assemble();
  }, [answeredAt]);

  const tallies = board.tallies;
  const description =
    `The ${board.rollCall.chamber === "house" ? "House" : "Senate"} by party, Democrats on the left and Republicans on the right. ` +
    "Filled seats voted Yea, hollow seats voted Nay, dotted seats voted Present, and faint dashed seats did not vote." +
    (ring && yourSide
      ? ` Your answer puts you with the ${formatInteger(ring.count)} members who voted ${yourSide}.`
      : "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 id={`${ids}-title`} className="text-2xl font-bold text-ink">
            The chamber
          </h2>
          <Button
            type="button"
            variant="outline"
            aria-pressed={view === "table"}
            onClick={() => setView((current) => (current === "chart" ? "table" : "chart"))}
          >
            <Table2 className="size-4" aria-hidden />
            View as table
          </Button>
        </div>
        <p id={`${ids}-summary`} className="max-w-[68ch] text-base text-ink-2">
          {description}
        </p>
      </div>

      <div
        className="rounded-card border border-hairline bg-paper p-3 sm:p-5"
        data-fact="roll-call-positions"
        data-receipt-id={board.rollCall.receipt.sourceId}
      >
        {view === "chart" ? (
          <figure ref={figureRef} className="mx-auto flex max-w-[640px] flex-col gap-3">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-auto w-full"
              role="img"
              aria-labelledby={`${ids}-title`}
              aria-describedby={`${ids}-summary`}
            >
              {dividers.map((angle) => {
                const from = point(angle, layout.inner * RADIUS - seatR);
                const to = point(angle, RADIUS + seatR * 2);
                return (
                  <line
                    key={angle}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className="stroke-hairline"
                    strokeWidth={1.5}
                  />
                );
              })}
              <g ref={seatsRef}>
                {drawSeats &&
                  layout.seats.map((seat, i) => {
                    const member = ordered[i]!;
                    const { x, y } = point(seat.angle, Math.hypot(seat.x, seat.y) * RADIUS);
                    return (
                      <circle
                        key={member.slug}
                        cx={x}
                        cy={y}
                        r={round(member.position === "NotVoting" ? seatR * 0.8 : seatR - 0.6)}
                        strokeWidth={member.position === "NotVoting" ? 1 : 1.2}
                        strokeDasharray={
                          member.position === "Present"
                            ? "1.2 1.2"
                            : member.position === "NotVoting"
                              ? "1 1.4"
                              : undefined
                        }
                        className={SEAT_CLASS[member.position]}
                      />
                    );
                  })}
              </g>
              {ring && yourSide && (
                <YouRing {...point(ring.angle, layout.inner * RADIUS - seatR - RING_RADIUS - 6)} />
              )}
              <line
                x1={CX - RADIUS - seatR}
                y1={CY + seatR + 4}
                x2={CX + RADIUS + seatR}
                y2={CY + seatR + 4}
                className="stroke-hairline"
                strokeWidth={1}
              />
            </svg>
            <figcaption className="flex flex-col gap-3 text-sm sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start">
              {groupTallies(tallies).map(({ key, tallies: group }, index, all) => (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col gap-1",
                    index === all.length - 1 && all.length > 1
                      ? "sm:col-start-3 sm:items-end sm:text-right"
                      : "",
                    index > 0 && index < all.length - 1
                      ? "sm:col-start-2 sm:items-center sm:text-center"
                      : "",
                  )}
                >
                  {group.map((tally) => (
                    <PartyLine key={tally.party} tally={tally} />
                  ))}
                </div>
              ))}
            </figcaption>
            {ring && yourSide && (
              <p className="flex items-center gap-2 text-sm font-bold text-ink" aria-hidden>
                <svg viewBox="0 0 20 20" className="size-5 shrink-0">
                  <circle
                    cx="10"
                    cy="10"
                    r="7.5"
                    className="fill-paper stroke-marigold-strong"
                    strokeWidth={3}
                  />
                </svg>
                You, with the {yourSide} side
              </p>
            )}
            {board.keyVote && !yourSide && answerHint && (
              <p className="type-meta text-ink-2">{answerHint}</p>
            )}
          </figure>
        ) : (
          <PartyTable tallies={tallies} captionId={`${ids}-title`} />
        )}
      </div>
    </div>
  );
}

/** The voter's marker: a marigold-strong ring (3:1 on paper) that lands with a small spring. */
function YouRing({ x, y }: { x: number; y: number }) {
  return (
    <g data-testid="you-ring" className="animate-ring-in">
      <circle
        cx={x}
        cy={y}
        r={RING_RADIUS}
        className="fill-paper stroke-marigold-strong"
        strokeWidth={3}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink text-[15px] font-extrabold"
      >
        You
      </text>
    </g>
  );
}

/** Two decimals: enough for the eye, and identical on the server and in the browser (no hydration drift). */
const round = (value: number): number => Math.round(value * 100) / 100;

const partyGroup = (party: string): string => (party === "D" || party === "R" ? party : "I");

function groupTallies(tallies: readonly PartyTally[]) {
  const groups = new Map<string, PartyTally[]>();
  for (const tally of tallies) {
    const key = partyGroup(tally.party);
    groups.set(key, [...(groups.get(key) ?? []), tally]);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, tallies: group }));
}

function PartyLine({ tally }: { tally: PartyTally }) {
  const party = tally.party as Party;
  const rest = [
    tally.present ? `${formatInteger(tally.present)} Present` : null,
    tally.notVoting ? `${formatInteger(tally.notVoting)} not voting` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-2 font-bold text-ink">
        <PartyTag party={party} />
        <span className="tabular-nums">
          {formatInteger(tally.total)} {partyPlural(party, tally.total)}
        </span>
      </span>
      <span className="text-ink-2 tabular-nums">
        {formatInteger(tally.yea)} Yea, {formatInteger(tally.nay)} Nay
        {rest.length ? `, ${rest.join(", ")}` : ""}
      </span>
    </div>
  );
}

function PartyTable({ tallies, captionId }: { tallies: readonly PartyTally[]; captionId: string }) {
  const columns: Position[] = ["Yea", "Nay", "Present", "NotVoting"];
  const value = (tally: PartyTally, position: Position) =>
    ({ Yea: tally.yea, Nay: tally.nay, Present: tally.present, NotVoting: tally.notVoting })[
      position
    ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" aria-describedby={captionId}>
        <caption className="sr-only">Votes by party</caption>
        <thead>
          <tr className="border-b border-hairline text-ink-2">
            <th scope="col" className="py-2 pr-3 font-bold">
              Party
            </th>
            {columns.map((position) => (
              <th key={position} scope="col" className="py-2 pr-3 text-right font-bold">
                {POSITION_LABEL[position]}
              </th>
            ))}
            <th scope="col" className="py-2 text-right font-bold">
              Members
            </th>
          </tr>
        </thead>
        <tbody>
          {tallies.map((tally) => (
            <tr key={tally.party} className="border-b border-hairline last:border-0">
              <th scope="row" className="py-2 pr-3 font-bold text-ink">
                {partyPlural(tally.party as Party, 2)}
              </th>
              {columns.map((position) => (
                <td key={position} className="py-2 pr-3 text-right text-ink tabular-nums">
                  {formatInteger(value(tally, position))}
                </td>
              ))}
              <td className="py-2 text-right text-ink tabular-nums">
                {formatInteger(tally.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
