import type { Position, RollCall, Source } from "@for-the-people/core";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";

/**
 * Vote Duel reads: two members' real VotePositions on every roll call they both answered. A roll call
 * counts as shared only when both members took a side (Yea or Nay); Present and Not Voting are left out.
 */

export type DuelOutcome = "agree" | "split" | "not-shared";

const tookSide = (position: Position): boolean => position === "Yea" || position === "Nay";

export function duelOutcome(a: Position, b: Position): DuelOutcome {
  if (!tookSide(a) || !tookSide(b)) return "not-shared";
  return a === b ? "agree" : "split";
}

export interface DuelTally {
  /** Roll calls where both members took a side. */
  shared: number;
  agreed: number;
  split: number;
}

export function tallyDuel(pairs: Iterable<{ a: Position; b: Position }>): DuelTally {
  const tally: DuelTally = { shared: 0, agreed: 0, split: 0 };
  for (const { a, b } of pairs) {
    const outcome = duelOutcome(a, b);
    if (outcome === "not-shared") continue;
    tally.shared += 1;
    if (outcome === "agree") tally.agreed += 1;
    else tally.split += 1;
  }
  return tally;
}

export interface DuelMonth {
  /** "2025-07" */
  month: string;
  agreed: number;
  split: number;
}

const nextMonth = (month: string): string => {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
};

/**
 * Shared votes (both members took a side) counted by calendar month, oldest first. Months with no
 * shared vote between the first and the last are included with zeros, so the months stay evenly spaced.
 */
export function duelByMonth(
  pairs: Iterable<{ date: string; a: Position; b: Position }>,
): DuelMonth[] {
  const counts = new Map<string, DuelMonth>();
  for (const { date, a, b } of pairs) {
    const outcome = duelOutcome(a, b);
    if (outcome === "not-shared") continue;
    const month = date.slice(0, 7);
    const bin = counts.get(month) ?? { month, agreed: 0, split: 0 };
    if (outcome === "agree") bin.agreed += 1;
    else bin.split += 1;
    counts.set(month, bin);
  }
  const months = [...counts.keys()].sort();
  const first = months[0];
  const last = months.at(-1);
  if (!first || !last) return [];
  const bins: DuelMonth[] = [];
  for (let month = first; month <= last; month = nextMonth(month))
    bins.push(counts.get(month) ?? { month, agreed: 0, split: 0 });
  return bins;
}

export interface DuelRollCall {
  rollCall: RollCall;
  source: Source;
  a: Position;
  b: Position;
}

export interface DuelRecord extends DuelTally {
  aId: string;
  bId: string;
  congress: number;
  /** Roll calls both members were recorded on, including Present and Not Voting. */
  bothRecorded: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Shared roll calls where they took opposite sides, newest first. */
  splits: DuelRollCall[];
  /** Shared votes by month, oldest first: when the two agreed and when they split. */
  months: DuelMonth[];
}

/** Every roll call in one Congress where both members have a VotePosition, tallied into agreements and splits. */
export async function duel(db: Db, aId: string, bId: string, congress = 119): Promise<DuelRecord> {
  const a = alias(t.votePositions, "duel_a");
  const b = alias(t.votePositions, "duel_b");
  const rows = await db
    .select({ a: a.position, b: b.position, rollCall: t.rollCalls, source: t.sources })
    .from(a)
    .innerJoin(b, and(eq(b.rollCallId, a.rollCallId), eq(b.personId, bId)))
    .innerJoin(t.rollCalls, eq(t.rollCalls.id, a.rollCallId))
    .innerJoin(t.sources, eq(t.sources.id, t.rollCalls.sourceId))
    .where(and(eq(a.personId, aId), eq(t.rollCalls.congress, congress)))
    .orderBy(asc(t.rollCalls.date), asc(t.rollCalls.number));

  const tally = tallyDuel(rows);
  const splits = rows
    .filter((row) => duelOutcome(row.a, row.b) === "split")
    .map((row) => ({
      rollCall: m.rollCallFromRow(row.rollCall),
      source: m.sourceFromRow(row.source),
      a: row.a,
      b: row.b,
    }))
    .reverse();
  return {
    aId,
    bId,
    congress,
    ...tally,
    bothRecorded: rows.length,
    firstDate: rows[0]?.rollCall.date ?? null,
    lastDate: rows.at(-1)?.rollCall.date ?? null,
    splits,
    months: duelByMonth(rows.map((row) => ({ date: row.rollCall.date, a: row.a, b: row.b }))),
  };
}
