import { describe, expect, test } from "vitest";
import { moneyBar, moneyPeriod, type MoneyFlow } from "./money";

describe("moneyBar", () => {
  const flow = (key: MoneyFlow["key"], amount: number): MoneyFlow => ({
    key,
    label: key,
    short: key,
    amount,
  });

  test("largest first, the remainder last, and widths that fill the bar", () => {
    const bar = moneyBar([
      flow("individual", 600),
      flow("pacs", 250),
      flow("other", 100),
      flow("transfers", 50),
    ]);
    expect(bar.map((segment) => segment.key)).toEqual(["individual", "pacs", "transfers", "other"]);
    expect(bar.map((segment) => segment.width)).toEqual([60, 25, 5, 10]);
    expect(bar.reduce((sum, segment) => sum + segment.width, 0)).toBeCloseTo(100, 10);
  });

  test("only the categories that exist, and nothing when no money was raised", () => {
    expect(moneyBar([flow("individual", 10)]).map((segment) => segment.width)).toEqual([100]);
    expect(moneyBar([])).toEqual([]);
  });
});

describe("moneyPeriod", () => {
  test("one period name, whether or not the FEC lists a candidacy; the note tells them apart", () => {
    const filed = moneyPeriod({ cycle: 2026, hasFecCandidacy: true, lastName: "Pelosi" });
    const notFiled = moneyPeriod({ cycle: 2026, hasFecCandidacy: false, lastName: "Sanders" });
    expect(filed.period).toBe("2025–26");
    expect(notFiled.period).toBe(filed.period);
    expect(filed.note).toBe(
      "The Federal Election Commission (FEC) lists Pelosi as a 2026 candidate. FEC filings do not show who won a primary or who dropped out, so check the Ballot page for who is on the November ballot.",
    );
    expect(notFiled.note).toBe(
      "The filings we hold from the Federal Election Commission (FEC) do not list Sanders as a 2026 candidate. The campaign still reports its money for each two-year period.",
    );
  });

  test("an FEC candidacy is never worded as running or as being on the ballot", () => {
    const { note } = moneyPeriod({ cycle: 2026, hasFecCandidacy: true, lastName: "Pelosi" });
    expect(note).not.toMatch(/\brunning\b|filed as a candidate|is on the ballot|so far/i);
  });

  test("only the candidacy note links to the Ballot page, and the link text is in the note", () => {
    const filed = moneyPeriod({ cycle: 2026, hasFecCandidacy: true, lastName: "Pelosi" });
    const notFiled = moneyPeriod({ cycle: 2026, hasFecCandidacy: false, lastName: "Sanders" });
    expect(filed.ballotLink).toBe("Ballot page");
    expect(filed.note).toContain(filed.ballotLink!);
    expect(notFiled.ballotLink).toBeNull();
  });

  test("the period follows the cycle in the data", () => {
    expect(moneyPeriod({ cycle: 2028, hasFecCandidacy: true, lastName: "Lee" }).period).toBe(
      "2027–28",
    );
    expect(moneyPeriod({ cycle: 2000, hasFecCandidacy: false, lastName: "Lee" }).period).toBe(
      "1999–2000",
    );
  });
});
