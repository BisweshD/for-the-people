import { describe, expect, test } from "vitest";
import { chamberContext, rangeLine, typicalRange, type StatsRow } from "./chamber-range";

const share = (count: number, from: number, step: number) =>
  Array.from({ length: count }, (_, index) => from + index * step);

describe("typicalRange", () => {
  test("holds the 10th to the 90th percentile, widened to whole percents", () => {
    // 0.800, 0.801, ... 0.899: the 10th value is 0.809 and the 90th is 0.889.
    expect(typicalRange(share(100, 0.8, 0.001))).toEqual({ low: 80, high: 89 });
  });

  test("the range always holds at least 8 in 10 of the members counted", () => {
    for (const count of [10, 11, 37, 100, 437, 538]) {
      const shares = share(count, 0.5, 0.4 / count);
      const range = typicalRange(shares)!;
      const inside = shares.filter(
        (value) => value * 100 >= range.low && value * 100 <= range.high,
      ).length;
      expect(inside / count).toBeGreaterThanOrEqual(0.8);
    }
  });

  test("an outlier never stretches the range", () => {
    const shares = [...share(40, 0.95, 0.0005), 0.2, 0.3];
    expect(typicalRange(shares)).toEqual({ low: 95, high: 97 });
  });

  test("whole-percent shares stay whole, and too few members give no range", () => {
    expect(typicalRange(Array.from({ length: 20 }, () => 0.97))).toEqual({ low: 97, high: 97 });
    expect(typicalRange([0.9, 0.95])).toBeNull();
  });
});

describe("chamberContext", () => {
  const row = (
    personId: string,
    chamber: "house" | "senate",
    missed: number,
    unity: number,
  ): StatsRow => ({
    personId,
    chamber,
    eligibleVotes: 100,
    missedVotes: missed,
    partyUnityEligible: 100,
    partyUnityVotes: unity,
  });

  test("counts one chamber, and leaves members without a missed-vote share out of that range", () => {
    const house = Array.from({ length: 20 }, (_, index) =>
      row(`H${index}`, "house", 2 + (index % 3), 90 + (index % 5)),
    );
    const speaker = row("SPEAKER", "house", 95, 99);
    const senate = Array.from({ length: 12 }, (_, index) => row(`S${index}`, "senate", 50, 50));
    const context = chamberContext([...house, speaker, ...senate], "house", new Set(["SPEAKER"]));
    expect(context.missed).toEqual({ low: 2, high: 4 });
    expect(context.unity).toEqual({ low: 90, high: 94 });
  });
});

describe("rangeLine", () => {
  test("names the chamber in plain words", () => {
    expect(rangeLine("house", { low: 90, high: 97 })).toBe("Most House members: 90% to 97%");
    expect(rangeLine("senate", { low: 1, high: 1 })).toBe("Most senators: 1%");
  });
});
