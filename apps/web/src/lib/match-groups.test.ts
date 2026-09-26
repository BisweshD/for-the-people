import { computeMatch, type Match, type Weight } from "@for-the-people/core/client";
import { describe, expect, test } from "vitest";
import {
  groupTies,
  issueAgreement,
  railGroups,
  tieCounts,
  tieDetail,
  tieExplainer,
  tieNote,
} from "./match-groups";

const match = (
  score: number,
  agreements: number,
  n: number,
  byIssue: Match["byIssue"] = [],
): Match => ({
  personId: "X000001",
  score,
  n,
  agreements,
  splits: n - agreements,
  byIssue,
  comparisons: [],
});

const entry = (name: string, m: Match) => ({ member: { name }, match: m });

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => from + index);

/**
 * A real Match from the score engine. The voter answers Yea on one key vote per weight, with that
 * weight; the member voted on the `shared` ones, Yea (agreeing) on the `agreed` ones and Nay on the rest.
 */
function scored(
  weights: ReadonlyArray<Weight>,
  shared: readonly number[],
  agreed: readonly number[],
): Match {
  const ids = range(0, weights.length);
  return computeMatch({
    stances: ids.map((index) => ({
      keyVoteId: `kv-${index}`,
      choice: "Yea",
      weight: weights[index]!,
      answeredAt: "2026-09-23T15:00:00.000Z",
    })),
    keyVotes: ids.map((index) => ({
      id: `kv-${index}`,
      issueArea: "taxes",
      rollCallRefs: [
        {
          rollCallId: `house-119-1-${index + 1}`,
          date: "2025-03-01",
          yeaSupportsMeasure: true,
          decisive: true,
        },
      ],
    })),
    member: {
      personId: "X000001",
      positions: new Map(
        shared.map((index) => [`house-119-1-${index + 1}`, agreed.includes(index) ? "Yea" : "Nay"]),
      ),
    },
  });
}

const percentOf = (m: Match) => Math.round(m.score! * 100);

describe("groupTies", () => {
  test("groups rows by the percent a reader sees and stops at a tier boundary", () => {
    const tiers = groupTies(
      [
        entry("A", match(0.834, 7, 8)),
        entry("B", match(0.831, 7, 8)),
        entry("C", match(0.77, 8, 10)),
        entry("D", match(0.744, 9, 11)),
        entry("E", match(0.741, 8, 11)),
        entry("F", match(0.7, 7, 10)),
      ],
      4,
    );
    expect(tiers.map((tier) => [tier.percent, tier.entries.map((e) => e.member.name)])).toEqual([
      [83, ["A", "B"]],
      [77, ["C"]],
      [74, ["D", "E"]],
    ]);
  });
});

describe("railGroups", () => {
  const names = (groups: ReturnType<typeof railGroups<{ name: string }>>) =>
    groups.map((group) => ({
      tie: group.tie,
      percent: group.percent,
      rows: group.rows.map((row) => row.member.name),
      more: group.more,
    }));

  test("a tie covers only the rows at its percent; the next row sits outside the tie", () => {
    // Round 4: "Tied at 83%" also sat over the 77% row below it.
    const groups = railGroups(
      [
        entry("Pelosi", match(0.834, 7, 8)),
        entry("Pettersen", match(0.831, 7, 8)),
        entry("Gonzalez", match(0.77, 8, 10)),
      ],
      3,
    );
    expect(names(groups)).toEqual([
      { tie: true, percent: 83, rows: ["Pelosi", "Pettersen"], more: 0 },
      { tie: false, percent: 77, rows: ["Gonzalez"], more: 0 },
    ]);
    for (const group of groups.filter((candidate) => candidate.tie))
      for (const row of group.rows)
        expect(Math.round((row.match.score ?? 0) * 100)).toBe(group.percent);
  });

  test("rows that tie with no one share one plain group, and a later tie starts its own", () => {
    const groups = railGroups(
      [
        entry("A", match(0.9, 9, 10)),
        entry("B", match(0.8, 8, 10)),
        entry("C", match(0.75, 3, 4)),
        entry("D", match(0.749, 6, 8)),
      ],
      3,
    );
    expect(names(groups)).toEqual([
      { tie: false, percent: 90, rows: ["A", "B"], more: 0 },
      { tie: true, percent: 75, rows: ["C"], more: 1 },
    ]);
  });

  test("a tie longer than the rail lists what fits and counts the rest", () => {
    const groups = railGroups(
      ["A", "B", "C", "D", "E"].map((name) => entry(name, match(0.83, 7, 8))),
      3,
    );
    expect(names(groups)).toEqual([{ tie: true, percent: 83, rows: ["A", "B", "C"], more: 2 }]);
  });
});

describe("tieCounts and tieExplainer", () => {
  test("a tie with one count says how many members agree on it", () => {
    const matches = [match(0.83, 7, 8), match(0.83, 7, 8)];
    expect(tieCounts(matches)).toEqual([{ agreements: 7, n: 8 }]);
    expect(tieExplainer(83, matches)).toBe("2 members agree with you on 7 of 8 votes.");
  });

  test("a tie that mixes counts names each count, fewest agreements first", () => {
    // One voter, one weight of 2: agreeing on it offsets a split elsewhere, so 8 of 11 ties 9 of 11.
    const weights: Weight[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1];
    const nine = scored(weights, range(0, 11), range(0, 9));
    const eight = scored(weights, range(0, 11), [...range(0, 7), 9]);
    const matches = [nine, eight, nine];
    expect(matches.map(percentOf)).toEqual([71, 71, 71]);
    expect(tieCounts(matches)).toEqual([
      { agreements: 8, n: 11 },
      { agreements: 9, n: 11 },
    ]);
    expect(tieExplainer(71, matches)).toBe(
      "Tied at 71%: 8 of 11 and 9 of 11 land on the same percent because votes you care more about count more and scores stay near 50% when few votes are shared.",
    );
    expect(tieDetail(matches)).toBe(
      "8 of 11 and 9 of 11 land on the same percent because votes you care more about count more and scores stay near 50% when few votes are shared.",
    );
  });

  test("with every weight at 1, the tie is credited to rounding and the pull toward 50%, not weights", () => {
    const ones: Weight[] = Array.from({ length: 10 }, () => 1);
    const five = scored(ones, range(0, 7), range(0, 5));
    const seven = scored(ones, range(0, 10), range(0, 7));
    // (5 + 1) / (7 + 2) and (7 + 1) / (10 + 2): both show 67%.
    expect([five, seven].map(percentOf)).toEqual([67, 67]);
    expect(tieDetail([seven, five])).toBe(
      "5 of 7 and 7 of 10 land on the same percent because scores stay near 50% when few votes are shared and percents are rounded.",
    );
    expect(tieExplainer(67, [seven, five])).toBe(
      "Tied at 67%: 5 of 7 and 7 of 10 land on the same percent because scores stay near 50% when few votes are shared and percents are rounded.",
    );
  });

  test("one weight on every vote, even if it is not 1, is not a reason for a tie", () => {
    const threes: Weight[] = Array.from({ length: 9 }, () => 3);
    const four = scored(threes, range(0, 5), range(0, 4));
    const seven = scored(threes, range(0, 9), range(0, 7));
    expect([four, seven].map(percentOf)).toEqual([76, 76]);
    expect(tieDetail([seven, four])).toBe(
      "4 of 5 and 7 of 9 land on the same percent because scores stay near 50% when few votes are shared and percents are rounded.",
    );
  });

  test("three or more counts read as a list", () => {
    const weights: Weight[] = [1, 1, 1, 1, 1, 3, 1, 2, 3, 1];
    const matches = [
      scored(weights, range(0, 10), range(0, 8)),
      scored(weights, [0, 1, 2, 3, 9], [0, 1, 2, 3]),
      scored(weights, [...range(0, 8), 9], [...range(0, 6), 9]),
    ];
    expect(matches.map(percentOf)).toEqual([71, 71, 71]);
    expect(tieExplainer(71, matches)).toBe(
      "Tied at 71%: 4 of 5, 7 of 9, and 8 of 10 land on the same percent because votes you care more about count more and scores stay near 50% when few votes are shared.",
    );
  });
});

describe("issueAgreement", () => {
  test("gives one count when the whole group agrees alike, and a range when it does not", () => {
    const a = match(0.8, 5, 6, [
      { issueArea: "health", n: 2, agreements: 2, score: 0.8 },
      { issueArea: "taxes", n: 3, agreements: 1, score: 0.4 },
      { issueArea: "guns", n: 1, agreements: 1, score: 0.7 },
    ]);
    const b = match(0.8, 5, 6, [
      { issueArea: "health", n: 2, agreements: 2, score: 0.8 },
      { issueArea: "taxes", n: 3, agreements: 2, score: 0.6 },
    ]);
    expect(issueAgreement([a, b])).toEqual([
      { issueArea: "health", label: "2 of 2" },
      { issueArea: "taxes", label: "1 to 2 of 3" },
    ]);
  });

  test("leaves out issues with fewer than 2 shared votes and leads with the most agreement", () => {
    const one = match(0.7, 6, 9, [
      { issueArea: "guns", n: 1, agreements: 1, score: 0.7 },
      { issueArea: "taxes", n: 4, agreements: 2, score: 0.5 },
      { issueArea: "health", n: 2, agreements: 2, score: 0.8 },
      { issueArea: "trade", n: 2, agreements: 1, score: 0.5 },
    ]);
    // A single shared vote is not a pattern; 2 of 2 leads, then 2 of 4 before 1 of 2 (more votes).
    expect(issueAgreement([one])).toEqual([
      { issueArea: "health", label: "2 of 2" },
      { issueArea: "taxes", label: "2 of 4" },
      { issueArea: "trade", label: "1 of 2" },
    ]);
    // A member who shares only one vote on an issue is left out of that issue's count.
    const other = match(0.7, 6, 9, [{ issueArea: "health", n: 1, agreements: 0, score: 0.4 }]);
    expect(issueAgreement([one, other])[0]).toEqual({ issueArea: "health", label: "2 of 2" });
  });
});

describe("tieNote", () => {
  test("a tie with one count needs no note", () => {
    expect(tieNote([match(0.83, 7, 8), match(0.83, 7, 8)])).toBeNull();
  });

  test("a mixed tie names the pull toward 50%, and weights only when the weights differ", () => {
    const weights: Weight[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1];
    const nine = scored(weights, range(0, 11), range(0, 9));
    const eight = scored(weights, range(0, 11), [...range(0, 7), 9]);
    expect(tieNote([nine, eight])).toBe(
      "Scores lean toward 50% until you share more votes, and votes you care more about count more.",
    );
    const ones: Weight[] = Array.from({ length: 10 }, () => 1);
    expect(
      tieNote([scored(ones, range(0, 10), range(0, 7)), scored(ones, range(0, 7), range(0, 5))]),
    ).toBe("Scores lean toward 50% until you share more votes, and percents are rounded.");
  });
});
