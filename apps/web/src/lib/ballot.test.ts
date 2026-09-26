import { describe, expect, test } from "vitest";
import { fecListNote, raceMoneyDate, type FinanceView } from "./ballot";

const RECEIPT = {
  sourceId: "src_00000000000000aa",
  publisher: "Federal Election Commission",
  url: "https://www.fec.gov/",
  retrievedAt: "2026-09-23T00:00:00.000Z",
};
const money = (asOf: string): { finance: FinanceView } => ({
  finance: { receipts: 1000, individual: 1000, cashOnHand: 0, asOf, receipt: RECEIPT },
});
const none = { finance: null };

describe("fecListNote", () => {
  test("says the names are FEC filings, what that can include and leave out, and how they are shown", () => {
    expect(fecListNote(14)).toBe(
      "This list comes from FEC filings. It may include people who lost a primary or dropped out, and may leave out candidates who have not filed with the FEC. All 14 FEC filings are shown, in alphabetical order.",
    );
    expect(fecListNote(1)).toMatch(/ It has one FEC filing\.$/);
  });

  test("never claims the list is everyone running or every name", () => {
    for (const count of [1, 2, 14]) expect(fecListNote(count)).not.toMatch(/everyone|names are/i);
  });
});

describe("raceMoneyDate", () => {
  test("the report date most candidates share, so rows name only a date that differs", () => {
    expect(
      raceMoneyDate([money("2026-06-30"), none, money("2026-06-30"), money("2026-03-31")]),
    ).toBe("2026-06-30");
  });

  test("on a tie, the latest date; without money, none", () => {
    expect(raceMoneyDate([money("2026-03-31"), money("2026-06-30")])).toBe("2026-06-30");
    expect(raceMoneyDate([none, none])).toBeNull();
    expect(raceMoneyDate([])).toBeNull();
  });
});
