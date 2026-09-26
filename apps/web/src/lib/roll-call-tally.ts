import type { RollCallTally } from "@for-the-people/data/read";

/** Squares per row in Home's roll-call figure: each row is 50 roll calls, whatever the screen width. */
export const TALLY_COLUMNS = 50;

export type Chamber = "house" | "senate";

/** One chamber of the figure: how many squares, the date span, and which squares are key-vote roll calls. */
export interface ChamberTally {
  total: number;
  first: string | null;
  last: string | null;
  /** The newest roll call's Receipt, carried by the chamber's count. */
  receiptId: string | null;
  /** Positions (0 = the oldest roll call) of the roll calls behind a published key vote. */
  marks: number[];
}

export interface RollCallTallyView {
  chambers: Record<Chamber, ChamberTally>;
  latestSourceId: string | null;
}

/** Reduces every roll call id to the few numbers the figure draws, so the page ships no id list. */
export function toTallyView(
  tally: RollCallTally,
  keyVoteRollCallIds: ReadonlySet<string>,
): RollCallTallyView {
  const chamber = ({
    ids,
    first,
    last,
    latestSourceId,
  }: RollCallTally["chambers"][Chamber]): ChamberTally => ({
    total: ids.length,
    first,
    last,
    receiptId: latestSourceId,
    marks: ids.flatMap((id, index) => (keyVoteRollCallIds.has(id) ? [index] : [])),
  });
  return {
    chambers: { house: chamber(tally.chambers.house), senate: chamber(tally.chambers.senate) },
    latestSourceId: tally.latestSourceId,
  };
}

/** Full rows of squares and the squares left over for a last, shorter row. */
export function tallyRows(total: number, columns = TALLY_COLUMNS) {
  return {
    rows: Math.ceil(total / columns),
    full: Math.floor(total / columns),
    remainder: total % columns,
  };
}
