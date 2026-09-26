import { describe, expect, test } from "vitest";
import { monthGroups } from "./duel-lines";
import { youAgreeLine } from "./duel-you";

describe("the voter's line under the Duel headline", () => {
  test("names both members with their counts", () => {
    expect(
      youAgreeLine(
        ["Collins", "Murkowski"],
        [
          { n: 11, agreements: 9 },
          { n: 11, agreements: 8 },
        ],
      ),
    ).toBe("You agree with Collins on 9 of 11 and Murkowski on 8 of 11");
    expect(
      youAgreeLine(
        ["Sanders", "Pelosi"],
        [
          { n: 1, agreements: 1 },
          { n: 12, agreements: 0 },
        ],
      ),
    ).toBe("You agree with Sanders on 1 of 1 and Pelosi on 0 of 12");
  });

  test("a member with no shared answered vote is named as such, never given a count", () => {
    expect(
      youAgreeLine(
        ["Collins", "Murkowski"],
        [
          { n: 4, agreements: 3 },
          { n: 0, agreements: 0 },
        ],
      ),
    ).toBe(
      "You agree with Collins on 3 of 4. Murkowski voted on none of the key votes you answered",
    );
    expect(
      youAgreeLine(
        ["Collins", "Murkowski"],
        [
          { n: 0, agreements: 0 },
          { n: 0, agreements: 0 },
        ],
      ),
    ).toBe("Neither Collins nor Murkowski voted on the key votes you answered");
  });
});

describe("splits by month", () => {
  test("newest-first rows keep their order, grouped under each month once", () => {
    const rows = [
      { rollCall: { date: "2025-07-03" } },
      { rollCall: { date: "2025-07-01" } },
      { rollCall: { date: "2025-06-12" } },
      { rollCall: { date: "2024-12-31" } },
    ];
    expect(monthGroups(rows)).toEqual([
      { month: "2025-07", label: "July 2025", rows: [rows[0], rows[1]] },
      { month: "2025-06", label: "June 2025", rows: [rows[2]] },
      { month: "2024-12", label: "December 2024", rows: [rows[3]] },
    ]);
    expect(monthGroups([])).toEqual([]);
  });
});
