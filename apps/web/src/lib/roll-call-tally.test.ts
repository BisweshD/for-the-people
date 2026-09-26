import { describe, expect, test } from "vitest";
import { tallyRows, toTallyView } from "./roll-call-tally";

describe("roll-call tally", () => {
  const tally = {
    chambers: {
      house: {
        ids: ["house-119-1-2", "house-119-1-3", "house-119-1-4", "house-119-2-1"],
        first: "2025-01-06",
        last: "2026-01-07",
        latestSourceId: "src-clerk",
      },
      senate: { ids: [], first: null, last: null, latestSourceId: null },
    },
    latestSourceId: "src-clerk",
  };

  test("marks the key-vote roll calls by their place in date order, and counts every roll call", () => {
    const view = toTallyView(tally, new Set(["house-119-1-3", "house-119-2-1", "senate-119-1-9"]));
    expect(view.chambers.house).toEqual({
      total: 4,
      first: "2025-01-06",
      last: "2026-01-07",
      receiptId: "src-clerk",
      marks: [1, 3],
    });
    // A key vote's roll call that is not stored draws nothing rather than a square in the wrong place.
    expect(view.chambers.senate).toEqual({
      total: 0,
      first: null,
      last: null,
      receiptId: null,
      marks: [],
    });
    expect(view.latestSourceId).toBe("src-clerk");
  });

  test("splits squares into full rows and a shorter last row", () => {
    expect(tallyRows(1_012)).toEqual({ rows: 21, full: 20, remainder: 12 });
    expect(tallyRows(100)).toEqual({ rows: 2, full: 2, remainder: 0 });
    expect(tallyRows(0)).toEqual({ rows: 0, full: 0, remainder: 0 });
  });
});
