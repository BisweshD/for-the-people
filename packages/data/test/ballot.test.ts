import type { FinanceSummary } from "@for-the-people/core";
import { describe, expect, test } from "vitest";
import { compareCandidates, mergeRepeatFilings, type BallotCandidate } from "../src/read/ballot";

/** Ordering and repeat-filing rules for the candidate lists on a ballot. */

const SOURCE = "src_00000000000000aa";

function candidate(
  id: string,
  full: string,
  {
    incumbent = false,
    receipts = null as number | null,
    committee = `C-${id}`,
  } = {},
): BallotCandidate {
  const last = full.split(" ").at(-1)!;
  const finance: FinanceSummary | null =
    receipts === null
      ? null
      : {
          personId: `fec:${id}`,
          cycle: 2026,
          financeCommitteeId: committee,
          receipts,
          individual: receipts,
          smallDollarShare: null,
          pacs: 0,
          party: 0,
          selfFunding: 0,
          transfers: 0,
          cashOnHand: 0,
          debts: 0,
          inStateShare: null,
          asOf: "2026-06-30",
          sourceId: SOURCE,
        };
  return {
    candidacy: {
      id: `race|fec:${id}`,
      personId: `fec:${id}`,
      raceId: "race",
      party: "D",
      status: "filed",
      incumbent,
      fecCandidateId: id,
      sourceIds: [SOURCE],
    },
    person: {
      id: `fec:${id}`,
      names: { full, first: full.split(" ")[0]!, last, nickname: null, suffix: null },
      portrait: null,
      bioguide: null,
    },
    finance,
  };
}

describe("ballot candidate order", () => {
  test("alphabetical by last name; incumbency and money never decide position", () => {
    const list = [
      candidate("H6TX10001", "Ana Zed", { receipts: 10 }),
      candidate("H6TX10002", "Bo Young"),
      candidate("H6TX10003", "Cy Xu", { incumbent: true, receipts: 1 }),
      candidate("H6TX10004", "Di Adams", { receipts: 500 }),
      candidate("H6TX10005", "Ed Brown"),
    ];
    expect(list.toSorted(compareCandidates).map((c) => c.person.names.full)).toEqual([
      "Di Adams",
      "Ed Brown",
      "Cy Xu",
      "Bo Young",
      "Ana Zed",
    ]);
  });

  test("two FEC filings under one name in one race show once, keeping the one with totals", () => {
    const merged = mergeRepeatFilings([
      candidate("H6TX10262", "Sarah Eckhardt"),
      candidate("H6TX10254", "Sarah Eckhardt", { receipts: 113_352.55 }),
      candidate("H6TX10006", "Kara King", { receipts: 231_138.66 }),
    ]);
    expect(merged.map((c) => c.candidacy.fecCandidateId)).toEqual(["H6TX10254", "H6TX10006"]);
  });

  test("two filings for one campaign committee show once, whatever the names", () => {
    const merged = mergeRepeatFilings([
      candidate("S6CO00549", "Robert Chew", { receipts: 1_270_007, committee: "C00944298" }),
      candidate("S6CO00556", "Bob Chew", { receipts: 1_270_007, committee: "C00944298" }),
      candidate("S6CO00408", "Karen Breslin", { receipts: 165_311.66, committee: "C00897488" }),
    ]);
    expect(merged.map((c) => c.candidacy.fecCandidateId)).toEqual(["S6CO00408", "S6CO00556"]);
  });
});
