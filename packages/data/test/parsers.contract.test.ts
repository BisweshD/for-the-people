import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tallyPositions } from "@for-the-people/core";
import { describe, expect, test } from "vitest";
import { displayAsName, parseBillStatus } from "../src/ingest/parsers/billstatus";
import { parseHouseRollCall, parseMemberDataVacancies } from "../src/ingest/parsers/clerk";
import {
  applyClerkVacateDates,
  formerMembersByFec,
  parseLegislators,
} from "../src/ingest/parsers/legislators";
import { parseSenateRollCall } from "../src/ingest/parsers/senate";
import { parseSenateVoteMenu } from "../src/ingest/parsers/senate-menu";

/** Contract tests: every parser against recorded real responses (tests/fixtures/README.md). */

const fixture = (...path: string[]) =>
  readFileSync(join(__dirname, "..", "..", "..", "tests", "fixtures", ...path), "utf8");
const SOURCE = "src_0000000000000000";

describe("House Clerk roll-call XML", () => {
  test("S. 5 passage: identity, measure, date, and totals that equal the positions", () => {
    const parsed = parseHouseRollCall(fixture("clerk", "roll-2025-023.xml"), 2025);
    if (parsed.kind !== "rollCall") throw new Error(parsed.reason);
    expect(parsed.rollCall).toMatchObject({
      id: "house-119-1-23",
      measureId: "119-s-5",
      date: "2025-01-22",
      question: "On Passage",
      result: "Passed",
      totals: { yea: 263, nay: 156, present: 0, notVoting: 14 },
      officialUrl: "https://clerk.house.gov/Votes/2025023",
    });
    expect(tallyPositions(parsed.positions)).toEqual(parsed.rollCall.totals);
    expect(parsed.positions.find((position) => position.bioguide === "A000370")).toMatchObject({
      party: "D",
      state: "NC",
      position: "Nay",
    });
  });

  test("the Speaker election is skipped, not forced into Yea/Nay", () => {
    const parsed = parseHouseRollCall(fixture("clerk", "roll-2025-002.xml"), 2025);
    expect(parsed.kind).toBe("skipped");
  });

  test("delegates recorded with state XX keep their vote with an unknown state", () => {
    const parsed = parseHouseRollCall(fixture("clerk", "roll-2025-079.xml"), 2025);
    if (parsed.kind !== "rollCall") throw new Error(parsed.reason);
    const delegate = parsed.positions.find((position) => position.bioguide === "N000147");
    expect(delegate?.state).toBeNull();
    expect(tallyPositions(parsed.positions)).toEqual(parsed.rollCall.totals);
  });
});

describe("Senate LIS roll-call XML", () => {
  test("S. 5 passage", () => {
    const { rollCall, positions } = parseSenateRollCall(fixture("senate", "vote_119_1_00007.xml"));
    expect(rollCall).toMatchObject({
      id: "senate-119-1-7",
      measureId: "119-s-5",
      date: "2025-01-20",
      totals: { yea: 64, nay: 35 },
    });
    // 99 senators: one seat was vacant that day, and 64 + 35 accounts for every member.
    expect(positions).toHaveLength(99);
    expect(tallyPositions(positions)).toEqual(rollCall.totals);
  });

  test("a Vice President's tie-breaking vote is recorded apart from member totals", () => {
    const { rollCall, positions } = parseSenateRollCall(fixture("senate", "vote_119_1_00372.xml"));
    expect(rollCall.measureId).toBe("119-hr-1");
    expect(rollCall.totals).toMatchObject({ yea: 50, nay: 50 });
    expect(rollCall.tieBreaker?.vote).toBe("Yea");
    expect(tallyPositions(positions)).toEqual(rollCall.totals);
  });

  test("en bloc nominations list several documents and carry no measure", () => {
    const { rollCall } = parseSenateRollCall(fixture("senate", "vote_119_1_00522.xml"));
    expect(rollCall.measureId).toBeNull();
    expect(rollCall.requires).toBe("3/5");
  });

  test("vote menus list every roll call in a session", () => {
    expect(parseSenateVoteMenu(fixture("senate", "vote_menu_119_1.xml"))).toHaveLength(659);
    expect(parseSenateVoteMenu(fixture("senate", "vote_menu_119_2.xml")).at(-1)).toEqual({
      number: 241,
      year: 2026,
    });
  });
});

describe("GovInfo BILLSTATUS XML", () => {
  test("H.R. 1: titles, sponsor, law status, and a plain-text CRS summary", () => {
    const { measure, sponsorBioguide, crsSummary } = parseBillStatus(
      fixture("govinfo", "BILLSTATUS-119hr1.xml"),
    );
    expect(measure).toMatchObject({ id: "119-hr-1", congress: 119, type: "hr", number: 1 });
    expect(measure.status.becameLaw).toBe(true);
    expect(sponsorBioguide).toBe("A000375");
    expect(crsSummary?.text.length).toBeGreaterThan(200);
    expect(crsSummary?.text).not.toMatch(/<[a-z/][^>]*>/i);
  });

  test("S. 1582 keeps its Display Title as the popular name, so a search for it finds the bill", () => {
    const { measure } = parseBillStatus(fixture("govinfo", "BILLSTATUS-119s1582.xml"));
    expect(measure.titles).toMatchObject({
      display: "Guiding and Establishing National Innovation for U.S. Stablecoins Act",
      popular: "GENIUS Act",
    });
  });

  test("a Display Title that is a sentence is not a popular name", () => {
    expect(displayAsName("GENIUS Act", "Guiding and Establishing Act")).toBe("GENIUS Act");
    expect(displayAsName("GENIUS Act", "GENIUS Act")).toBeNull();
    expect(displayAsName("An act to provide for reconciliation.", null)).toBeNull();
    expect(displayAsName("A bill to amend title 5.", null)).toBeNull();
    expect(displayAsName("A joint resolution providing for congressional disapproval.", null)).toBeNull();
    expect(displayAsName("Actual Name Act", null)).toBe("Actual Name Act");
  });
});

describe("congress-legislators", () => {
  test("keeps 119th-Congress members, splits party switches, and maps independents' caucus", () => {
    const current = parseLegislators(
      JSON.parse(fixture("legislators", "legislators-current.sample.json")),
      SOURCE,
    );
    const sanders = current.terms.find(
      (term) => term.personId === "S000033" && term.start === "2025-01-03",
    );
    expect(sanders).toMatchObject({
      chamber: "senate",
      party: "I",
      caucus: "D",
      officeId: "federal:senate:VT:1",
    });
    const norton = current.terms.find((term) => term.personId === "N000147");
    expect(norton?.districtId).toBe("DC-0@cd119");
    expect(current.offices.find((office) => office.id === "federal:house:DC")?.title).toBe(
      "Delegate",
    );
  });

  test("departed members keep their 119th terms and 118th-only members are dropped", () => {
    const historical = parseLegislators(
      JSON.parse(fixture("legislators", "legislators-historical.sample.json")),
      SOURCE,
    );
    const ids = historical.people.map((person) => person.id).sort();
    expect(ids).toEqual(["S001157", "V000137"]);
    expect(historical.terms.find((term) => term.personId === "S001157")?.end).toBe("2026-04-21");
  });

  test("the House Clerk's vacate date replaces a departed member's end date one day off", () => {
    const historical = parseLegislators(
      JSON.parse(fixture("legislators", "legislators-historical.sample.json")),
      SOURCE,
    );
    const vacancies = parseMemberDataVacancies(fixture("clerk", "member-data.sample.xml"));
    const clerkSource = "src_1111111111111111";
    const terms = applyClerkVacateDates(historical.terms, vacancies, clerkSource);
    const scott = terms.find((term) => term.personId === "S001157");
    expect(scott?.end).toBe("2026-04-22");
    expect(scott?.sourceIds).toEqual([SOURCE, clerkSource]);
    // Senate terms and members the Clerk does not list are left alone.
    const vance = terms.find((term) => term.personId === "V000137");
    expect(vance).toEqual(historical.terms.find((term) => term.personId === "V000137"));
  });

  test("former members who did not serve in the 119th Congress are found by FEC id", () => {
    const former = formerMembersByFec(
      JSON.parse(fixture("legislators", "legislators-historical.sample.json")),
    );
    expect(former.get("S6OH00163")).toBe("B000944");
    expect(former.has("S2OH00436")).toBe(false);
  });
});

describe("House Clerk MemberData XML", () => {
  test("lists each departed member with the Clerk's vacate date and cause", () => {
    const vacancies = parseMemberDataVacancies(fixture("clerk", "member-data.sample.xml"));
    expect(vacancies.toSorted((a, b) => a.bioguide.localeCompare(b.bioguide))).toEqual([
      {
        bioguide: "G000590",
        vacated: "2025-07-20",
        cause: "R",
        footnote: expect.stringContaining("Mark") as string,
      },
      {
        bioguide: "L000578",
        vacated: "2026-01-06",
        cause: "D",
        footnote: "Vacancy due to the death of Doug LaMalfa, January 6, 2026.",
      },
      {
        bioguide: "S001157",
        vacated: "2026-04-22",
        cause: "D",
        footnote: expect.stringContaining("David Scott") as string,
      },
      {
        bioguide: "T000489",
        vacated: "2025-03-05",
        cause: "D",
        footnote: "Vacancy due to the death of Sylvester Turner, March 5, 2025.",
      },
    ]);
  });
});
