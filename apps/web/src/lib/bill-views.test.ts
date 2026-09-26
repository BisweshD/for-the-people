import { describe, expect, test } from "vitest";
import type { RollCall, StateCode } from "@for-the-people/core/client";
import {
  boardRows,
  boardSummary,
  isVotersMember,
  measureStatusLine,
  previewRollCalls,
  rollCallHeadline,
  seatTitle,
  summaryBlocks,
  summaryLead,
  summaryPreviewLength,
  type RollCallRow,
  type SeatView,
} from "./bill-views";
import { officeLine } from "./format";
import type { PartyTally } from "./seat-layout";

describe("seat titles", () => {
  test("a roll-call seat gets the title OfficeText words the shared member row with", () => {
    const office = (
      chamber: "house" | "senate",
      state: "VT" | "TX" | "GU" | "PR",
      district: number,
    ) => officeLine({ chamber, state, district, title: seatTitle(chamber, state) });
    expect(office("senate", "VT", 0)).toBe("U.S. Senator, Vermont");
    expect(office("house", "TX", 34)).toBe("U.S. Representative, TX-34");
    expect(office("house", "GU", 0)).toBe("Delegate, Guam");
    expect(office("house", "PR", 0)).toBe("Resident Commissioner, Puerto Rico");
  });
});

/** Text shapes copied from the bundled snapshot: CRS summaries of H.R. 1 and S. 5. */

const HR1 = [
  "This bill reduces taxes, reduces or increases spending for various federal programs, increases the statutory debt limit, and otherwise addresses agencies and programs throughout the federal government.",
  "It is known as a reconciliation bill and includes legislation submitted by several congressional committees pursuant to provisions in the FY2025 congressional budget resolution (H Con. Res. 14) that directed the committees to submit legislation to the House or Senate Budget Committee that will increase or decrease the deficit and increase the statutory debt limit by specified amounts. (Reconciliation bills are considered by Congress using expedited legislative procedures that prevent a filibuster and restrict amendments in the Senate.)",
  "TITLE I--COMMITTEE ON AGRICULTURE, NUTRITION, AND FORESTRY",
  "This title addresses a wide range of Department of Agriculture (USDA) programs.",
  "Subtitle A--Nutrition",
  "(Sec. 10101) This section prohibits USDA from increasing the cost of the Thrifty Food Plan.",
].join("\n");

const S5 = [
  "Laken Riley Act",
  "This act requires the Department of Homeland Security (DHS) to detain certain non-U.S. nationals (aliens under federal law) who have been arrested for burglary, theft, larceny, shoplifting, assault of a law enforcement officer, or any crime that results in death or serious bodily injury to another person.",
  "Under this act, DHS must detain an individual who (1) is unlawfully present in the United States or did not possess the necessary documents when applying for admission.",
  "The act also authorizes state governments to sue for injunctive relief. Specifically, the state government may sue the federal government over a",
  "",
  "- decision to release a non-U.S. national from custody;",
  "",
  "- failure to detain an individual who has been ordered removed from the United States.",
].join("\n");

describe("CRS summary blocks", () => {
  test("ALL-CAPS title lines and subtitle lines become sentence-case headings", () => {
    const blocks = summaryBlocks(HR1);
    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ]);
    expect(blocks[2]!.lines[0]).toBe("Title I: Committee on Agriculture, Nutrition, and Forestry");
    expect(blocks[4]!.lines[0]).toBe("Subtitle A: Nutrition");
  });

  test("sentence case keeps proper nouns, acronyms, committee names, and act names", () => {
    const heading = (line: string) => summaryBlocks(line)[0]!.lines[0];
    // H.R. 6644, H.R. 1, H.R. 5371, H.R. 1968, and S. 2 as the CRS prints them.
    expect(heading("TITLE II--BUILDING MORE IN AMERICA")).toBe(
      "Title II: Building more in America",
    );
    expect(heading("TITLE IV--ACCESSING THE AMERICAN DREAM")).toBe(
      "Title IV: Accessing the American dream",
    );
    expect(heading("TITLE X--HOME-OWNERSHIP FOR MAIN STREET AMERICA")).toBe(
      "Title X: Home-ownership for Main Street America",
    );
    expect(heading("TITLE II--COMMITTEE ON ARMED SERVICES")).toBe(
      "Title II: Committee on Armed Services",
    );
    expect(heading("TITLE X--COMMITTEE ON THE JUDICIARY")).toBe(
      "Title X: Committee on the Judiciary",
    );
    expect(heading("TITLE I--COMMITTEE ON HOMELAND SECURITY AND GOVERNMENTAL AFFAIRS")).toBe(
      "Title I: Committee on Homeland Security and Governmental Affairs",
    );
    expect(heading("TITLE VII--FINANCE")).toBe("Title VII: Finance");
    expect(heading("DIVISION A--FULL-YEAR CONTINUING APPROPRIATIONS ACT, 2025")).toBe(
      "Division A: Full-Year Continuing Appropriations Act, 2025",
    );
    expect(
      heading(
        "DIVISION D--MILITARY CONSTRUCTION, VETERANS AFFAIRS, AND RELATED AGENCIES APPROPRIATIONS ACT, 2026",
      ),
    ).toBe(
      "Division D: Military Construction, Veterans Affairs, and Related Agencies Appropriations Act, 2026",
    );
    expect(heading("TITLE VI--NO SURPRISES ACT IMPLEMENTATION")).toBe(
      "Title VI: No Surprises Act implementation",
    );
    expect(heading("DIVISION G--DEPARTMENT OF VETERANS AFFAIRS EXTENDERS")).toBe(
      "Division G: Department of Veterans Affairs extenders",
    );
    expect(heading("TITLE VI--RELATED AGENCY AND FOOD AND DRUG ADMINISTRATION")).toBe(
      "Title VI: Related agency and Food and Drug Administration",
    );
    expect(heading("TITLE II--MEDICARE")).toBe("Title II: Medicare");
    expect(heading("TITLE I--OPPORTUNITIES FOR HOUSING")).toBe(
      "Title I: Opportunities for housing",
    );
    expect(heading("TITLE I--AGRICULTURAL PROGRAMS")).toBe("Title I: Agricultural programs");
    // Acronyms stay whole (a constructed line: no snapshot heading uses these in capitals).
    expect(heading("SUBTITLE A--SNAP AND USDA PROGRAMS IN DC")).toBe(
      "Subtitle A: SNAP and USDA programs in DC",
    );
  });

  test("a short line that leads into a list is a paragraph, not a heading", () => {
    // H.R. 5371, Division C, Title I, as the CRS prints it.
    const blocks = summaryBlocks(
      "TITLE I--LEGISLATIVE BRANCH\nThis title provides appropriations to the Senate for\n\n- expense allowances;\n- salaries.",
    );
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list"]);
  });

  test("a leading line that repeats the bill's title is dropped", () => {
    const blocks = summaryBlocks(S5, "Laken Riley Act");
    expect(blocks[0]!.kind).toBe("paragraph");
    expect(blocks.at(-1)).toEqual({
      kind: "list",
      lines: [
        "decision to release a non-U.S. national from custody;",
        "failure to detain an individual who has been ordered removed from the United States.",
      ],
    });
  });

  test("the preview always stops on a finished paragraph, never a heading or a lead-in", () => {
    for (const [text, title] of [
      [HR1, "One Big Beautiful Bill Act"],
      [S5, "Laken Riley Act"],
    ] as const) {
      const blocks = summaryBlocks(text, title);
      const length = summaryPreviewLength(blocks);
      const last = blocks[length - 1]!;
      expect(last.kind).toBe("paragraph");
      expect(last.lines[0]).toMatch(/[.)]$/);
      expect(last.lines[0]).not.toMatch(/^[^a-z]*$/);
    }
    expect(summaryPreviewLength(summaryBlocks(HR1))).toBe(2);
  });

  test("a summary with no clean stopping point is shown whole", () => {
    const blocks = summaryBlocks("Short summary with no ending");
    expect(summaryPreviewLength(blocks)).toBe(blocks.length);
  });
});

describe("measure status line", () => {
  test("a law reads as one sentence with its date and Public Law number", () => {
    expect(
      measureStatusLine({
        outcome: { label: "Became law", tone: "law", note: null },
        latestAction: "Became Public Law No: 119-21.",
        latestActionDate: "2025-07-04",
      }),
    ).toBe("On Jul 4, 2025, as Public Law 119-21.");
  });

  test("any other latest action keeps the official words and adds the date", () => {
    expect(
      measureStatusLine({
        outcome: { label: "Passed the House", tone: "passed", note: null },
        latestAction: "Received in the Senate",
        latestActionDate: "2026-03-02",
      }),
    ).toBe("Latest action on Mar 2, 2026: Received in the Senate.");
  });
});

const row = (
  id: string,
  date: string,
  question: string,
  title: string | null,
  keyVote = false,
): RollCallRow =>
  ({
    id,
    chamber: id.startsWith("house") ? "house" : "senate",
    number: Number(id.split("-").at(-1)),
    date,
    question,
    title,
    keyVote,
  }) as RollCallRow;

describe("roll-call list", () => {
  const rows = [
    row("house-119-1-144", "2025-05-22", "On Motion to Recommit", "One Big Beautiful Act"),
    row("house-119-1-145", "2025-05-22", "On Passage", "One Big Beautiful Act"),
    row("senate-119-1-332", "2025-06-30", "On the Motion", "Schumer Motion to Commit H.R. 1"),
    row("senate-119-1-357", "2025-07-01", "On the Motion", "Wyden Motion to Commit H.R. 1"),
    row("senate-119-1-359", "2025-07-01", "On the Motion", "Warnock Motion to Commit H.R. 1"),
    row("senate-119-1-372", "2025-07-01", "On Passage of the Bill", "H.R. 1, as Amended", true),
    row("house-119-1-190", "2025-07-03", "On Motion to Concur", "One Big Beautiful Bill Act", true),
  ];

  test("the preview keeps every key vote and fills the rest with the newest, newest first", () => {
    expect(previewRollCalls(rows, 5).map((r) => r.id)).toEqual([
      "house-119-1-190",
      "senate-119-1-372",
      "senate-119-1-359",
      "senate-119-1-357",
      "senate-119-1-332",
    ]);
    const keyVotesOnly = rows.map((r, index) => ({ ...r, keyVote: index < 6 }));
    expect(previewRollCalls(keyVotesOnly, 5)).toHaveLength(6);
  });

  test("the full list is newest first", () => {
    expect(previewRollCalls(rows, rows.length).map((r) => r.id)).toEqual([
      "house-119-1-190",
      "senate-119-1-372",
      "senate-119-1-359",
      "senate-119-1-357",
      "senate-119-1-332",
      "house-119-1-145",
      "house-119-1-144",
    ]);
  });

  test("a generic question gives way to the description of what was voted on", () => {
    expect(rollCallHeadline(rows[2]!)).toEqual({
      primary: "Schumer Motion to Commit H.R. 1",
      secondary: "On the Motion",
    });
    expect(rollCallHeadline(rows[1]!)).toEqual({
      primary: "On Passage",
      secondary: "One Big Beautiful Act",
    });
    expect(rollCallHeadline(row("senate-119-1-9", "2025-01-09", "On the Motion", null))).toEqual({
      primary: "On the Motion",
      secondary: null,
    });
  });
});

describe("board summary", () => {
  test("one plain sentence for the result, then one per party", () => {
    const rollCall = {
      id: "house-119-1-190",
      chamber: "house",
      number: 190,
      date: "2025-07-03",
      question: "On Motion to Concur in the Senate Amendment",
      result: "Passed",
      requires: "1/2",
      totals: { yea: 218, nay: 214, present: 0, notVoting: 2 },
      tieBreaker: null,
    } as unknown as RollCall;
    const tallies = [
      { party: "D", total: 212, yea: 0, nay: 212, present: 0, notVoting: 0 },
      { party: "R", total: 220, yea: 218, nay: 2, present: 0, notVoting: 0 },
    ] as PartyTally[];
    expect(boardSummary(rollCall, tallies)).toBe(
      "House roll call 190, July 3, 2025: Passed 218 to 214, with 2 not voting. Democrats: 0 Yea, 212 Nay. Republicans: 218 Yea, 2 Nay.",
    );
  });
});

describe("The Board's state rows and the voter's members", () => {
  const seat = (state: StateCode, district: number | null, name: string): SeatView => ({
    slug: name,
    name,
    lastName: name,
    state,
    district,
    party: "D",
    position: "Yea",
  });
  const seats = [
    seat("AL", 1, "a"),
    seat("AL", 2, "b"),
    seat("AK", 0, "c"),
    seat("TX", 10, "d"),
    seat("TX", 37, "e"),
  ];

  test("rows follow the Board's order, one per state, and keep each cell's place in it", () => {
    expect(boardRows(seats)).toEqual([
      { state: "AL", cells: [0, 1] },
      { state: "AK", cells: [2] },
      { state: "TX", cells: [3, 4] },
    ]);
  });

  test("a House seat is the voter's when it is their state and served district; senators by state", () => {
    const location = { state: "TX" as const, districts: ["TX-37@cd119", "TX-10@cd120"] };
    // The 2026 ballot district (TX-10 on the new map) is not who represents them today.
    expect(seats.filter((s) => isVotersMember("house", s, location)).map((s) => s.name)).toEqual([
      "e",
    ]);
    expect(seats.filter((s) => isVotersMember("senate", s, location)).map((s) => s.name)).toEqual([
      "d",
      "e",
    ]);
    expect(
      isVotersMember("house", seat("VT", 0, "f"), { state: "VT", districts: ["VT-0@cd119"] }),
    ).toBe(true);
    expect(isVotersMember("house", seats[4]!, null)).toBe(false);
    expect(isVotersMember("house", seats[4]!, { state: "TX", districts: [] })).toBe(false);
  });
});

describe("the CRS summary's lead", () => {
  test("the first finished paragraph, skipping headings and the lines that lead into a list", () => {
    const blocks = summaryBlocks(
      "TITLE I--COMMITTEE ON AGRICULTURE\nThis title provides for\n- item one\nThis bill makes changes to agriculture programs.\nMore text.",
    );
    expect(summaryLead(blocks)).toBe("This bill makes changes to agriculture programs.");
    expect(summaryLead([])).toBeNull();
  });
});
