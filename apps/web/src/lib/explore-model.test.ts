import { describe, expect, test } from "vitest";
import {
  highAndLow,
  matchShade,
  median,
  rankMembers,
  rankingSentence,
  rankShade,
  stackLabels,
  summarizeStates,
  type Scored,
} from "./explore-model";

const row = (lastName: string, scored: Scored | null) => ({ member: { lastName }, scored });
const score = (value: number | null, n: number) => ({
  score: value,
  n,
  agreements: value === null ? 0 : Math.round(value * n),
});

describe("rankMembers", () => {
  const rows = [
    row("Young", score(0.4, 6)),
    row("Adams", null),
    row("Baker", score(0.8, 3)),
    row("Cruz", score(0.8, 9)),
    row("Diaz", score(null, 0)),
  ];

  test("by name is A to Z by last name and ignores scores", () => {
    expect(rankMembers(rows, "name").map((r) => r.member.lastName)).toEqual([
      "Adams",
      "Baker",
      "Cruz",
      "Diaz",
      "Young",
    ]);
  });

  test("by match: enough shared votes first, then the highest score, more shared votes break ties, no score last", () => {
    // Baker's 0.8 rests on 3 shared votes, under the confidence bar (5), so Young's longer record leads it.
    for (const ranking of ["overall", "issue"] as const) {
      expect(rankMembers(rows, ranking).map((r) => r.member.lastName)).toEqual([
        "Cruz",
        "Young",
        "Baker",
        "Adams",
        "Diaz",
      ]);
    }
  });

  test("does not reorder its input", () => {
    rankMembers(rows, "overall");
    expect(rows[0]!.member.lastName).toBe("Young");
  });
});

describe("rankingSentence", () => {
  test("says the list is A to Z until the voter answers, and links the way to answer", () => {
    expect(rankingSentence({ ranking: "name", answered: 0, issueLabel: null })).toEqual({
      text: "Listed A to Z by last name until you answer some key votes.",
      action: "answer some key votes",
    });
    expect(rankingSentence({ ranking: "name", answered: 0, issueLabel: "Health care" })).toEqual({
      text: "Listed A to Z by last name until you answer the health care key votes.",
      action: "answer the health care key votes",
    });
  });

  test("names the issue and the number of answers behind an issue ranking", () => {
    expect(rankingSentence({ ranking: "issue", answered: 6, issueLabel: "Health care" })).toEqual({
      text: "Ranked by how often they voted your way on health care, based on your 6 Yea or Nay answers.",
      action: null,
    });
  });

  test("warns once, in the same sentence, when few answers leave many ties", () => {
    expect(
      rankingSentence({ ranking: "issue", answered: 1, issueLabel: "Elections and voting" }).text,
    ).toBe(
      "Ranked by how often they voted your way on elections and voting, based on your 1 Yea or Nay answer, so many members tie.",
    );
    expect(rankingSentence({ ranking: "overall", answered: 12, issueLabel: null }).text).toBe(
      "Ranked by how often they voted your way, based on your 12 Yea or Nay answers.",
    );
  });

  test("the linked action is always part of the sentence, which never says card or deck", () => {
    for (const ranking of ["name", "overall", "issue"] as const)
      for (const answered of [0, 1, 12])
        for (const issueLabel of [null, "Guns"]) {
          const { text, action } = rankingSentence({ ranking, answered, issueLabel });
          expect(text).not.toMatch(/\b(card|deck)s?\b/i);
          if (action) expect(text).toContain(action);
        }
  });
});

describe("state summaries", () => {
  test("median of an odd and an even list, and none for an empty list", () => {
    expect(median([0.9, 0.1, 0.5])).toBe(0.5);
    expect(median([0.2, 0.4, 0.6, 1])).toBe(0.5);
    expect(median([])).toBeNull();
  });

  test("counts every member but takes the median only over members with a value", () => {
    const summaries = summarizeStates([
      { state: "TX", value: 0.8 },
      { state: "TX", value: 0.2 },
      { state: "TX", value: null },
      { state: "VT", value: null },
    ]);
    expect(summaries.get("TX")).toEqual({ count: 3, scored: 2, median: 0.5 });
    expect(summaries.get("VT")).toEqual({ count: 1, scored: 0, median: null });
    expect(summaries.has("ME")).toBe(false);
  });

  test("the high and low states are the highest and lowest median, larger delegations first on a tie", () => {
    const summaries = summarizeStates([
      { state: "TX", value: 0.9 },
      { state: "TX", value: 0.9 },
      { state: "VT", value: 0.9 },
      { state: "WY", value: 0.1 },
      { state: "ME", value: null },
    ]);
    expect(highAndLow(summaries)).toEqual({
      high: { state: "TX", median: 0.9 },
      low: { state: "WY", median: 0.1 },
    });
    expect(highAndLow(summarizeStates([{ state: "ME", value: null }]))).toEqual({
      high: null,
      low: null,
    });
  });
});

describe("shading", () => {
  test("match shading diverges at 50%: split below, agree above, even in the middle", () => {
    expect(matchShade(0.1).tone).toBe("split");
    expect(matchShade(0.4).tone).toBe("split");
    expect(matchShade(0.5).tone).toBe("even");
    expect(matchShade(0.6).tone).toBe("agree");
    expect(matchShade(0.95).tone).toBe("agree");
    expect(matchShade(0.1).opacity).toBeGreaterThan(matchShade(0.4).opacity);
    expect(matchShade(0.95).opacity).toBeGreaterThan(matchShade(0.6).opacity);
  });

  test("rank shading spreads clustered values over five steps, lowest lightest", () => {
    const values = [0.85, 0.96, 0.97, 0.975, 0.98, 0.985, 0.99, 0.992, 0.995, 0.999];
    const levels = values.map((value) => rankShade(value, values).opacity);
    expect(rankShade(0.85, values).tone).toBe("ink");
    expect(new Set(levels).size).toBe(5);
    expect(levels).toEqual(levels.toSorted((a, b) => a - b));
    // Nothing to rank against: the full shade, the same as the top step.
    expect(rankShade(0.98, [0.98, 0.98]).opacity).toBe(rankShade(0.999, values).opacity);
    expect(rankShade(0.9, [0.9]).opacity).toBe(rankShade(0.999, values).opacity);
  });
});

describe("rankMembers confidence", () => {
  test("members sharing few votes rank below those with a long shared record", () => {
    const row = (lastName: string, score: number, n: number) => ({
      member: { lastName },
      scored: { score, n, agreements: Math.round(score * n) },
    });
    const ranked = rankMembers(
      [row("Few", 0.88, 3), row("Long", 0.73, 12), row("Mid", 0.7, 8), row("Two", 0.83, 2)],
      "overall",
    );
    expect(ranked.map((entry) => entry.member.lastName)).toEqual(["Long", "Mid", "Few", "Two"]);
  });
});

describe("stackLabels", () => {
  test("keeps labels at their anchors when they already clear each other", () => {
    expect(stackLabels([10, 60, 120], 40, 0, 500)).toEqual([10, 60, 120]);
  });

  test("spreads crowded labels one pitch apart, centered on their anchors", () => {
    const anchors = [100, 104, 110];
    const placed = stackLabels(anchors, 40, 0, 500);
    expect(placed[1]! - placed[0]!).toBeCloseTo(40);
    expect(placed[2]! - placed[1]!).toBeCloseTo(40);
    const shift = placed.reduce((sum, y, i) => sum + y - anchors[i]!, 0) / anchors.length;
    expect(Math.abs(shift)).toBeLessThan(0.001);
  });

  test("stays inside the bounds", () => {
    const high = stackLabels([5, 6, 7, 8], 30, 20, 500);
    expect(high[0]).toBe(20);
    expect(high.at(-1)).toBe(110);
    const low = stackLabels([480, 490, 495], 30, 0, 500);
    expect(low.at(-1)).toBe(500);
    expect(low[0]).toBe(440);
  });
});
