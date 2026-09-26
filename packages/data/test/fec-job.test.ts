import { describe, expect, test } from "vitest";
import { onBallotInCycle, seatHolders, seatKey } from "../src/ingest/jobs/fec";

/** The 2026 ballot rules the FEC job applies before writing races and candidacies. */

const term = (
  personId: string,
  officeId: string,
  districtId: string | null,
  start: string,
  end: string,
) => ({ personId, officeId, districtId, start, end });

describe("incumbency comes from who holds the seat, not the FEC's incumbent code", () => {
  const terms = [
    // Died in office: the seat is someone else's now.
    term("T000489", "federal:house:TX", "TX-18@cd119", "2025-01-03", "2025-03-05"),
    // Won the special election for the same seat.
    term("M001245", "federal:house:TX", "TX-18@cd119", "2026-02-02", "2027-01-03"),
    // Serving, but in district 9.
    term("G000553", "federal:house:TX", "TX-9@cd119", "2025-01-03", "2027-01-03"),
    // Left the Senate mid-term; an appointee holds the seat.
    term("G000359", "federal:senate:SC:2", null, "2021-01-03", "2026-07-11"),
    term("G000608", "federal:senate:SC:2", null, "2026-07-14", "2027-01-03"),
  ];
  const holders = seatHolders(terms, "2026-09-24");

  test("the sitting member holds the seat", () => {
    expect(holders.has(`M001245|${seatKey("federal:house:TX", 18)}`)).toBe(true);
    expect(holders.has(`G000608|${seatKey("federal:senate:SC:2", null)}`)).toBe(true);
  });

  test("members who died or resigned no longer hold it", () => {
    expect(holders.has(`T000489|${seatKey("federal:house:TX", 18)}`)).toBe(false);
    expect(holders.has(`G000359|${seatKey("federal:senate:SC:2", null)}`)).toBe(false);
  });

  test("a member running for another district is not that district's incumbent", () => {
    expect(holders.has(`G000553|${seatKey("federal:house:TX", 18)}`)).toBe(false);
    expect(holders.has(`G000553|${seatKey("federal:house:TX", 9)}`)).toBe(true);
  });
});

describe("offices on the ballot", () => {
  test("Puerto Rico's Resident Commissioner is elected in presidential years only", () => {
    expect(onBallotInCycle({ title: "Resident Commissioner" }, 2026)).toBe(false);
    expect(onBallotInCycle({ title: "Resident Commissioner" }, 2028)).toBe(true);
    expect(onBallotInCycle({ title: "Delegate" }, 2026)).toBe(true);
    expect(onBallotInCycle({ title: "U.S. Representative" }, 2026)).toBe(true);
  });
});
