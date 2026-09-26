import { describe, expect, it } from "vitest";
import {
  boardOrder,
  hemicycleLayout,
  hemicycleOrder,
  lightingDelays,
  litCounts,
  meanAngle,
  partyTallies,
  yeaSide,
  type SeatPosition,
} from "../src/lib/seat-layout";

describe("hemicycleLayout", () => {
  for (const n of [1, 2, 7, 100, 101, 435, 441]) {
    it(`places exactly ${n} seats without overlap, inside the half disc`, () => {
      const layout = hemicycleLayout(n);
      expect(layout.seats).toHaveLength(n);
      for (const seat of layout.seats) {
        const radius = Math.hypot(seat.x, seat.y);
        expect(radius).toBeLessThanOrEqual(1 + 1e-9);
        expect(radius).toBeGreaterThanOrEqual(layout.rows === 1 ? 0.99 : layout.inner - 1e-9);
        expect(seat.y).toBeGreaterThanOrEqual(-1e-9);
      }
      let closest = Infinity;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = layout.seats[i]!;
          const b = layout.seats[j]!;
          closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      if (n > 1) expect(closest).toBeGreaterThan(2 * layout.seatRadius);
    });
  }

  it("orders seats left to right, so consecutive seats form party wedges", () => {
    const { seats } = hemicycleLayout(435);
    for (let i = 1; i < seats.length; i++) {
      expect(seats[i]!.angle).toBeLessThanOrEqual(seats[i - 1]!.angle);
    }
    expect(seats[0]!.x).toBeLessThan(0);
    expect(seats.at(-1)!.x).toBeGreaterThan(0);
  });

  it("uses more rows for a larger chamber", () => {
    expect(hemicycleLayout(435).rows).toBeGreaterThan(hemicycleLayout(100).rows);
  });

  it("is deterministic and empty for zero seats", () => {
    expect(hemicycleLayout(100)).toEqual(hemicycleLayout(100));
    expect(hemicycleLayout(0).seats).toEqual([]);
  });
});

describe("lightingDelays", () => {
  it("gives every cell a distinct slot within the span, the same way every time", () => {
    const delays = lightingDelays(435, 190, 1.2);
    expect(delays).toHaveLength(435);
    expect(new Set(delays).size).toBe(435);
    expect(Math.min(...delays)).toBe(0);
    expect(Math.max(...delays)).toBeCloseTo(1.2, 10);
    expect(lightingDelays(435, 190, 1.2)).toEqual(delays);
    expect(lightingDelays(435, 191, 1.2)).not.toEqual(delays);
  });

  it("does not light in plain seat order", () => {
    const delays = lightingDelays(100, 7, 1.2);
    const sorted = delays.toSorted((a, b) => a - b);
    expect(delays).not.toEqual(sorted);
  });

  it("handles a single cell", () => {
    expect(lightingDelays(1, 1, 1.2)).toEqual([0]);
  });
});

describe("litCounts", () => {
  it("counts up to the final totals by the end of the span", () => {
    const positions: SeatPosition[] = ["Yea", "Yea", "Nay", "Present", "NotVoting", "Yea"];
    const delays = lightingDelays(positions.length, 3, 1.2);
    expect(litCounts(positions, delays, -1)).toEqual({ Yea: 0, Nay: 0, Present: 0, NotVoting: 0 });
    expect(litCounts(positions, delays, 1.2)).toEqual({ Yea: 3, Nay: 1, Present: 1, NotVoting: 1 });
    const halfway = litCounts(positions, delays, 0.6);
    const lit = halfway.Yea + halfway.Nay + halfway.Present + halfway.NotVoting;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(positions.length);
  });
});

const seat = (
  name: string,
  state: string,
  party: string,
  position: SeatPosition,
): { name: string; lastName: string; state: string; party: string; position: SeatPosition } => ({
  name,
  lastName: name.split(" ").at(-1)!,
  state,
  party,
  position,
});

describe("boardOrder", () => {
  it("sorts by state name, then last name", () => {
    const names: Record<string, string> = { AK: "Alaska", AL: "Alabama", CA: "California" };
    const ordered = boardOrder(
      [
        seat("Pat Zed", "AL", "R", "Yea"),
        seat("Ann Young", "CA", "D", "Nay"),
        seat("Lee Adams", "AK", "R", "Yea"),
        seat("Kim Abel", "AL", "D", "Nay"),
      ],
      (state) => names[state] ?? state,
    );
    expect(ordered.map((s) => s.name)).toEqual(["Kim Abel", "Pat Zed", "Lee Adams", "Ann Young"]);
  });
});

describe("hemicycleOrder and yeaSide", () => {
  const seats = [
    seat("A One", "CA", "R", "Yea"),
    seat("B Two", "CA", "D", "Nay"),
    seat("C Three", "VT", "I", "Nay"),
    seat("D Four", "NY", "D", "Yea"),
    seat("E Five", "TX", "R", "Yea"),
    seat("F Six", "TX", "R", "NotVoting"),
  ];

  it("finds the side where Yea votes concentrate", () => {
    expect(yeaSide(seats)).toBe("right");
    const flip: Record<SeatPosition, SeatPosition> = {
      Yea: "Nay",
      Nay: "Yea",
      Present: "Present",
      NotVoting: "NotVoting",
    };
    expect(yeaSide(seats.map((s) => ({ ...s, position: flip[s.position] })))).toBe("left");
  });

  it("seats Democrats left, independents in the middle, Republicans right, with crossovers at the seams", () => {
    const ordered = hemicycleOrder(seats);
    expect(ordered.map((s) => s.party)).toEqual(["D", "D", "I", "R", "R", "R"]);
    expect(ordered.map((s) => s.position)).toEqual([
      "Nay",
      "Yea",
      "Nay",
      "NotVoting",
      "Yea",
      "Yea",
    ]);
  });
});

describe("meanAngle", () => {
  it("averages angles and returns null for no seats", () => {
    const { seats } = hemicycleLayout(10);
    expect(meanAngle([])).toBeNull();
    expect(meanAngle(seats.slice(0, 3))!).toBeGreaterThan(Math.PI / 2);
    expect(meanAngle(seats.slice(-3))!).toBeLessThan(Math.PI / 2);
  });
});

describe("partyTallies", () => {
  it("counts every position by party and matches the seat count", () => {
    const tallies = partyTallies([
      { party: "R", position: "Yea" },
      { party: "D", position: "Nay" },
      { party: "R", position: "NotVoting" },
      { party: "I", position: "Present" },
    ]);
    expect(tallies.map((t) => t.party)).toEqual(["D", "I", "R"]);
    expect(tallies.find((t) => t.party === "R")).toEqual({
      party: "R",
      yea: 1,
      nay: 0,
      present: 0,
      notVoting: 1,
      total: 2,
    });
    expect(tallies.reduce((sum, t) => sum + t.total, 0)).toBe(4);
  });
});
