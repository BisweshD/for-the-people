import { describe, expect, test } from "vitest";
import {
  cleanActionText,
  districtLabel,
  formatDollarsCompact,
  formatShare,
  measureLabel,
  middleTruncate,
  officeLine,
  officeShort,
  titleCaseName,
} from "./format";
import { moneyFlows, moneyTakeaway } from "./money";

describe("formatShare", () => {
  test("never rounds to 100% or 0% unless exact", () => {
    expect(formatShare(767, 768)).toBe("99.9%");
    expect(formatShare(768, 768)).toBe("100%");
    expect(formatShare(0, 768)).toBe("0%");
    expect(formatShare(27, 24_928_186)).toBe("under 0.1%");
    expect(formatShare(24_928_185, 24_928_186)).toBe("over 99.9%");
  });
  test("rounds ordinary shares to whole percents and handles an empty whole", () => {
    expect(formatShare(64, 900)).toBe("7%");
    expect(formatShare(1, 0)).toBe("No record yet");
  });
});

describe("formatDollarsCompact", () => {
  test("one precision for money shown together: one decimal for every K, M, and B", () => {
    // Round 6 found "$1M" beside "$247.2K" and "$33K" beside "$141.1K".
    expect(formatDollarsCompact(1_000_000)).toBe("$1.0M");
    expect(formatDollarsCompact(247_249)).toBe("$247.2K");
    expect(formatDollarsCompact(33_000)).toBe("$33.0K");
    expect(formatDollarsCompact(141_100)).toBe("$141.1K");
    expect(formatDollarsCompact(2_500_000_000)).toBe("$2.5B");
    for (const value of [1_000, 12_000, 999_949, 1_000_000, 40_000_000])
      expect(formatDollarsCompact(value)).toMatch(/^\$\d+\.\d[KMB]$/);
  });
  test("under $1,000 is whole dollars, and a value that rounds up to $1,000 reads $1.0K", () => {
    expect(formatDollarsCompact(0)).toBe("$0");
    expect(formatDollarsCompact(850)).toBe("$850");
    expect(formatDollarsCompact(999.6)).toBe("$1.0K");
    expect(formatDollarsCompact(999_960)).toBe("$1.0M");
    expect(formatDollarsCompact(-4_200)).toBe("-$4.2K");
  });
});

describe("labels", () => {
  test("measure and district labels", () => {
    expect(measureLabel("119-hconres-86")).toBe("H.Con.Res. 86");
    expect(districtLabel("AK", 0)).toBe("AK at-large");
    expect(districtLabel("CA", 12)).toBe("CA-12");
  });
  test("short office lines for narrow rows", () => {
    const member = { district: null, title: "U.S. Senator" } as const;
    expect(officeShort({ ...member, chamber: "senate", state: "VT" })).toBe("Sen., Vermont");
    expect(
      officeShort({ chamber: "house", state: "TX", district: 34, title: "U.S. Representative" }),
    ).toBe("Rep., TX-34");
    expect(
      officeShort({ chamber: "house", state: "WY", district: 0, title: "U.S. Representative" }),
    ).toBe("Rep., WY at-large");
    expect(officeShort({ chamber: "house", state: "GU", district: 0, title: "Delegate" })).toBe(
      "Del., Guam",
    );
    expect(
      officeShort({ chamber: "house", state: "PR", district: 0, title: "Resident Commissioner" }),
    ).toBe("Res. Comm., Puerto Rico");
    expect(
      officeLine({ chamber: "house", state: "TX", district: 34, title: "U.S. Representative" }),
    ).toBe("U.S. Representative, TX-34");
  });
});

describe("moneyFlows", () => {
  test("splits receipts into named sources plus other receipts, dropping empty sources", () => {
    const flows = moneyFlows({
      personId: "S000033",
      cycle: 2026,
      financeCommitteeId: "C00000001",
      receipts: 100,
      individual: 80,
      smallDollarShare: null,
      pacs: 5,
      party: 0,
      selfFunding: 0,
      transfers: 0,
      cashOnHand: 10,
      debts: 0,
      inStateShare: null,
      asOf: "2026-06-30",
      sourceId: "src_0000000000000000",
    });
    expect(flows.map((flow) => [flow.key, flow.amount])).toEqual([
      ["individual", 80],
      ["pacs", 5],
      ["other", 15],
    ]);
  });
});

describe("transfers and the takeaway", () => {
  const summary = {
    personId: "G000359",
    cycle: 2026,
    financeCommitteeId: "C00000002",
    // Lindsey Graham's 2026 FEC totals (weball26): transfers were $3.80M of $6.77M.
    receipts: 6_766_156.31,
    individual: 1_324_355.04,
    smallDollarShare: null,
    pacs: 724_473.68,
    party: 62_000,
    selfFunding: 0,
    transfers: 3_795_817.93,
    cashOnHand: 2_309_799.57,
    debts: 0,
    inStateShare: null,
    asOf: "2026-06-30",
    sourceId: "src_0000000000000000",
  };

  test("transfers are their own flow, and other receipts are only the remainder", () => {
    const flows = moneyFlows(summary);
    expect(flows.map((flow) => flow.key)).toEqual([
      "individual",
      "pacs",
      "party",
      "transfers",
      "other",
    ]);
    expect(flows.find((flow) => flow.key === "other")?.amount).toBeCloseTo(859_509.66, 2);
  });

  test("the takeaway names the largest real source, never other receipts", () => {
    expect(moneyTakeaway(summary, moneyFlows(summary))).toBe(
      "56% of the $6.8M arrived as transfers from joint fundraising and other committees the candidate authorized.",
    );
    const mostlyOther = { ...summary, individual: 10, pacs: 0, party: 0, transfers: 0 };
    expect(moneyTakeaway(mostlyOther, moneyFlows(mostlyOther))).toBe(
      "Under 0.1% of the $6.8M came from individuals.",
    );
    const individuals = { ...summary, receipts: 24_900_000, individual: 23_655_000, transfers: 0 };
    expect(moneyTakeaway(individuals, moneyFlows(individuals))).toBe(
      "95% of the $24.9M came from individuals.",
    );
  });
});

describe("readable names and actions", () => {
  test("FEC committee names in title case", () => {
    expect(titleCaseName("FRIENDS OF BERNIE SANDERS")).toBe("Friends of Bernie Sanders");
    expect(titleCaseName("MCCONNELL SENATE COMMITTEE")).toBe("McConnell Senate Committee");
    expect(titleCaseName("TEAM PELOSI PAC")).toBe("Team Pelosi PAC");
    expect(titleCaseName("Already Mixed Case")).toBe("Already Mixed Case");
  });
  test("action text without record citations", () => {
    expect(
      cleanActionText(
        "Motion to discharge Senate Committee on Foreign Relations rejected by Yea-Nay Vote. 36 - 63. Record Vote Number: 81. (consideration: CR S1779)",
      ),
    ).toBe(
      "Motion to discharge Senate Committee on Foreign Relations rejected by Yea-Nay Vote. 36-63.",
    );
  });
});

describe("middleTruncate", () => {
  test("keeps short addresses whole, without the scheme", () => {
    expect(middleTruncate("https://vote.gov/register/florida")).toBe("vote.gov/register/florida");
  });
  test("cuts long addresses in the middle to exactly the limit", () => {
    const url = "https://clerk.house.gov/evs/2026/roll130.xml?with=a&very=long&query=string";
    const short = middleTruncate(url);
    expect(short).toHaveLength(48);
    expect(short.startsWith("clerk.house.gov/evs/2026")).toBe(true);
    expect(short.endsWith("long&query=string")).toBe(true);
    expect(short).toContain("…");
    expect(middleTruncate(url, 20)).toHaveLength(20);
  });
});
