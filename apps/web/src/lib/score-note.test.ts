import { computeMatch, type Weight } from "@for-the-people/core/client";
import { describe, expect, test } from "vitest";
import { whyNotLabel } from "./score-note";

/** A real Match: the voter answers Yea on `total` key votes; the member agrees on the first `agreed`. */
function scored(total: number, agreed: number, weight: Weight = 1) {
  const ids = Array.from({ length: total }, (_, index) => index);
  return computeMatch({
    stances: ids.map((index) => ({
      keyVoteId: `kv-${index}`,
      choice: "Yea",
      weight,
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
        ids.map((index) => [`house-119-1-${index + 1}`, index < agreed ? "Yea" : "Nay"]),
      ),
    },
  });
}

describe("whyNotLabel", () => {
  test("names the plain share the reader would compute from the count", () => {
    // 7 of 8 is 88% plain; the score, pulled toward 50%, is (7 + 1) / (8 + 2) = 80%.
    const match = scored(8, 7);
    expect(Math.round(match.score! * 100)).toBe(80);
    expect(whyNotLabel(match)).toBe("Why not 88%?");
  });

  test("asks nothing when the plain share and the score show the same percent", () => {
    // 1 of 2 is 50% either way.
    expect(whyNotLabel(scored(2, 1))).toBeNull();
  });

  test("asks nothing without a score", () => {
    expect(whyNotLabel({ agreements: 0, n: 0, score: null })).toBeNull();
  });
});
