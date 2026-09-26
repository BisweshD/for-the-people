/**
 * Pure layout math for The Board and the hemicycle. No DOM, no
 * React: the same numbers render the static server SVG and drive the animation after hydration.
 */

export type SeatPosition = "Yea" | "Nay" | "Present" | "NotVoting";

export interface LaidOutSeat {
  /** Center in a unit hemicycle: the outer row has radius 1, x runs -1 (left) to 1 (right), y is up. */
  x: number;
  y: number;
  /** Radians, from PI (far left) to 0 (far right). */
  angle: number;
  row: number;
}

export interface HemicycleLayout {
  /** Seats ordered left to right by angle, inner row first on ties. */
  seats: LaidOutSeat[];
  /** Seat radius in the same units, leaving a visible gap between neighbors. */
  seatRadius: number;
  rows: number;
  /** Radius of the innermost row. */
  inner: number;
}

const INNER_RADIUS = 0.4;
const SEAT_FILL = 0.84;

function rowRadii(rows: number, inner: number): number[] {
  if (rows === 1) return [1];
  return Array.from({ length: rows }, (_, i) => inner + ((1 - inner) * i) / (rows - 1));
}

/** Splits n seats across rows in proportion to each row's length (largest remainder, so the sum is exact). */
function seatsPerRow(n: number, radii: number[]): number[] {
  const total = radii.reduce((sum, r) => sum + r, 0);
  const exact = radii.map((r) => (n * r) / total);
  const counts = exact.map(Math.floor);
  let remaining = n - counts.reduce((sum, c) => sum + c, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || b.index - a.index);
  for (const { index } of order) {
    if (remaining === 0) break;
    counts[index]! += 1;
    remaining -= 1;
  }
  return counts;
}

/** Spacing between neighbors along a row, the tightest of all rows. */
function tightestArcSpacing(radii: number[], counts: number[]): number {
  let tightest = Infinity;
  radii.forEach((r, i) => {
    const count = counts[i]!;
    if (count > 1) tightest = Math.min(tightest, (Math.PI * r) / (count - 1));
  });
  return tightest;
}

/**
 * Concentric semicircle rows for n seats. The row count is chosen so seats sit about as far apart along
 * a row as rows sit from each other, the way parliament diagrams are drawn.
 */
export function hemicycleLayout(n: number, inner = INNER_RADIUS): HemicycleLayout {
  if (n <= 0) return { seats: [], seatRadius: 0, rows: 0, inner };
  let best = { rows: 1, score: Infinity };
  for (let rows = 1; rows <= Math.min(n, 30); rows++) {
    const radii = rowRadii(rows, inner);
    const arc = (Math.PI * radii.reduce((sum, r) => sum + r, 0)) / n;
    const radial = (1 - inner) / Math.max(1, rows - 1);
    const score = Math.abs(Math.log(arc / radial));
    if (score < best.score) best = { rows, score };
  }
  const radii = rowRadii(best.rows, inner);
  const counts = seatsPerRow(n, radii);
  const radial = best.rows === 1 ? Infinity : (1 - inner) / (best.rows - 1);
  const spacing = Math.min(tightestArcSpacing(radii, counts), radial);
  const seatRadius = Math.min((SEAT_FILL * (Number.isFinite(spacing) ? spacing : 1)) / 2, 0.12);

  const seats: LaidOutSeat[] = [];
  radii.forEach((r, row) => {
    const count = counts[row]!;
    for (let j = 0; j < count; j++) {
      const angle = count === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (count - 1);
      seats.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle, row });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
  return { seats, seatRadius, rows: best.rows, inner };
}

/** Deterministic pseudo-random numbers (mulberry32), so a replay lights the same way on every device. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * When each Board cell lights, in seconds from the start of a replay. Cells light in a shuffled order,
 * like members voting from the floor, spread evenly over `span` seconds.
 */
export function lightingDelays(n: number, seed: number, span: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const next = random(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const delays = new Array<number>(n).fill(0);
  order.forEach((cell, rank) => {
    delays[cell] = n <= 1 ? 0 : (rank / (n - 1)) * span;
  });
  return delays;
}

/** How many cells of each position have lit by time t, given each cell's delay. */
export function litCounts(
  positions: readonly SeatPosition[],
  delays: readonly number[],
  t: number,
): Record<SeatPosition, number> {
  const counts: Record<SeatPosition, number> = { Yea: 0, Nay: 0, Present: 0, NotVoting: 0 };
  positions.forEach((position, i) => {
    if (delays[i]! <= t) counts[position] += 1;
  });
  return counts;
}

const PARTY_RANK: Record<string, number> = { D: 0, I: 1, L: 1, G: 1, O: 1, R: 2 };
const partyRank = (party: string): number => PARTY_RANK[party] ?? 1;

/** Board order: state (by the name the voter knows), then last name, then full name. */
export function boardOrder<T extends { state: string; lastName: string; name: string }>(
  seats: readonly T[],
  stateName: (state: string) => string,
): T[] {
  return seats.toSorted(
    (a, b) =>
      stateName(a.state).localeCompare(stateName(b.state)) ||
      a.lastName.localeCompare(b.lastName) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The side of the chamber where Yea votes concentrate: "right" when the party seated on the right
 * (Republicans) gave a larger share of Yea votes than the party on the left (Democrats).
 */
export function yeaSide(
  seats: readonly { party: string; position: SeatPosition }[],
): "left" | "right" {
  const share = (rank: number) => {
    const group = seats.filter((seat) => partyRank(seat.party) === rank);
    return group.length === 0
      ? 0
      : group.filter((seat) => seat.position === "Yea").length / group.length;
  };
  return share(2) > share(0) ? "right" : "left";
}

/**
 * Hemicycle order, left to right: Democrats, then independents and others, then Republicans. Inside
 * each party, members who voted with the Yea side sit toward it, so crossover votes meet at the seams.
 */
export function hemicycleOrder<
  T extends { party: string; position: SeatPosition; lastName: string; name: string },
>(seats: readonly T[]): T[] {
  const side = yeaSide(seats);
  const leftToRight: SeatPosition[] =
    side === "right"
      ? ["Nay", "NotVoting", "Present", "Yea"]
      : ["Yea", "Present", "NotVoting", "Nay"];
  const rank = (position: SeatPosition) => leftToRight.indexOf(position);
  return seats.toSorted(
    (a, b) =>
      partyRank(a.party) - partyRank(b.party) ||
      rank(a.position) - rank(b.position) ||
      a.lastName.localeCompare(b.lastName) ||
      a.name.localeCompare(b.name),
  );
}

/** Mean angle of the given seats, for placing the voter's ring on the side they would have joined. */
export function meanAngle(seats: readonly LaidOutSeat[]): number | null {
  if (seats.length === 0) return null;
  return seats.reduce((sum, seat) => sum + seat.angle, 0) / seats.length;
}

export interface PartyTally {
  party: string;
  yea: number;
  nay: number;
  present: number;
  notVoting: number;
  total: number;
}

/** Positions counted by party, ordered as they sit: Democrats, independents and others, Republicans. */
export function partyTallies(
  seats: readonly { party: string; position: SeatPosition }[],
): PartyTally[] {
  const byParty = new Map<string, PartyTally>();
  for (const seat of seats) {
    const tally = byParty.get(seat.party) ?? {
      party: seat.party,
      yea: 0,
      nay: 0,
      present: 0,
      notVoting: 0,
      total: 0,
    };
    if (seat.position === "Yea") tally.yea += 1;
    else if (seat.position === "Nay") tally.nay += 1;
    else if (seat.position === "Present") tally.present += 1;
    else tally.notVoting += 1;
    tally.total += 1;
    byParty.set(seat.party, tally);
  }
  return [...byParty.values()].sort(
    (a, b) => partyRank(a.party) - partyRank(b.party) || a.party.localeCompare(b.party),
  );
}
