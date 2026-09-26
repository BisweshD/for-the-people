import { describe, expect, test } from "vitest";
import { summaryBlocks } from "./bill-views";
import {
  firstSentence,
  gistText,
  sectionShares,
  sharesSummary,
  shortHeading,
  summaryOutline,
} from "./summary-sections";

/** Text shapes copied from the bundled snapshot: the CRS summaries of H.R. 1 and H.R. 5371. */

const HR1 = [
  "This bill reduces taxes, reduces or increases spending for various federal programs, increases the statutory debt limit, and otherwise addresses agencies and programs throughout the federal government.",
  "TITLE I--COMMITTEE ON AGRICULTURE, NUTRITION, AND FORESTRY",
  "This title addresses a wide range of Department of Agriculture (USDA) programs, including by changing the Supplemental Nutrition Assistance Program (SNAP) and extending programs authorized by the Agriculture Improvement Act of 2018 (commonly known as the 2018 farm bill).",
  "Subtitle A--Nutrition",
  "(Sec. 10101) This section prohibits USDA from increasing the cost of the Thrifty Food Plan (TFP).",
  "Subtitle C--Commodities",
  "This subtitle amends and extends commodity support programs.",
  "For example, the subtitle extends the Price Loss Coverage Program.",
  "TITLE II--COMMITTEE ON ARMED SERVICES",
  "(Sec. 20001) This section provides additional funding for FY2025 to the Department of Defense (DOD).",
  "TITLE VII--FINANCE",
  "Subtitle A--Tax",
  "Chapter 1--Providing Permanent Tax Relief for Middle-Class Families and Workers",
  "This chapter makes permanent multiple individual federal tax provisions enacted in 2017.",
  "Subtitle B--Health",
  "Chapter 1--Medicaid",
  "(Sec. 71101) This section delays a rule.",
].join("\n");

const HR5371 = [
  "This act ends the government shutdown that began on October 1, 2025.",
  "DIVISION A--CONTINUING APPROPRIATIONS ACT, 2026",
  "Continuing Appropriations Act, 2026",
  "This division provides continuing FY2026 appropriations to most federal agencies through the earlier of January 30, 2026, or the enactment of the applicable appropriations act.",
  "DIVISION C--LEGISLATIVE BRANCH APPROPRIATIONS ACT, 2026",
  "TITLE I--LEGISLATIVE BRANCH",
  "This title provides appropriations to the Senate for",
  "- expense allowances;",
  "TITLE II--GENERAL PROVISIONS",
  "(Sec. 201) This section prohibits funds provided by this division from being used for the maintenance or care of private vehicles.",
].join("\n");

describe("CRS summary outline", () => {
  test("titles are the top level, with subtitles nested and the overview kept as the lead", () => {
    const outline = summaryOutline(summaryBlocks(HR1));
    expect(outline.lead).toHaveLength(1);
    expect(outline.sections.map((section) => section.heading)).toEqual([
      "Title I: Committee on Agriculture, Nutrition, and Forestry",
      "Title II: Committee on Armed Services",
      "Title VII: Finance",
    ]);
    const [first, , finance] = outline.sections;
    expect(first!.id).toBe("title-i");
    expect(first!.children.map((child) => child.id)).toEqual([
      "title-i-subtitle-a",
      "title-i-subtitle-c",
    ]);
    // Two subtitles named A under different titles, and two chapters named 1, get different ids.
    expect(finance!.children.map((child) => child.id)).toEqual([
      "title-vii-subtitle-a",
      "title-vii-subtitle-b",
    ]);
    expect(finance!.children[1]!.children[0]!.id).toBe("title-vii-subtitle-b-chapter-1");
    expect(finance!.children[0]!.children[0]!.gist).toBe(
      "This chapter makes permanent multiple individual federal tax provisions enacted in 2017.",
    );
  });

  test("a subtitle's gist is its own first sentence, never a section-level line or a lead-in", () => {
    const [first] = summaryOutline(summaryBlocks(HR1)).sections;
    expect(first!.children[0]!.gist).toBeNull();
    expect(first!.children[1]!.gist).toBe(
      "This subtitle amends and extends commodity support programs.",
    );
    expect(first!.children[1]!.gistFrom).toBeNull();

    const [divisionA, divisionC] = summaryOutline(summaryBlocks(HR5371)).sections;
    expect(divisionA!.id).toBe("division-a");
    expect(divisionA!.gist).toMatch(/^This division provides continuing FY2026 appropriations/);
    expect(divisionC!.children.map((child) => child.id)).toEqual([
      "division-c-title-i",
      "division-c-title-ii",
    ]);
  });

  test("every title and top-level section has a gist: its text's first sentence, verbatim", () => {
    const [first, armed, finance] = summaryOutline(summaryBlocks(HR1)).sections;
    // Longer than about 200 characters: cut where the clause turns to "including", marked with an ellipsis.
    expect(first!.gist).toBe(
      "This title addresses a wide range of Department of Agriculture (USDA) programs…",
    );
    expect(first!.gistFrom).toBeNull();
    // The title's own overview needs no "From its first ..." before it.
    expect(first!.gistUnit).toBeNull();
    // A title that opens on one section's paragraph: the CRS's "(Sec. 20001)" is a locator, so it
    // leaves the sentence for the meta line, and the gist says it is from a section.
    expect(armed!.gist).toBe(
      "This section provides additional funding for FY2025 to the Department of Defense (DOD).",
    );
    expect(armed!.gistFrom).toBe("Sec. 20001");
    expect(armed!.gistUnit).toBe("section");
    // A title with no text of its own takes the first sentence under it and names where it is from.
    expect(finance!.gist).toBe(
      "This chapter makes permanent multiple individual federal tax provisions enacted in 2017.",
    );
    expect(finance!.gistFrom).toBe("Subtitle A, Chapter 1");
    expect(finance!.gistUnit).toBe("chapter");

    const [, divisionC] = summaryOutline(summaryBlocks(HR5371)).sections;
    // "This title provides appropriations to the Senate for" leads into a list: cut before the dangling word.
    expect(divisionC!.children[0]!.gist).toBe("This title provides appropriations to the Senate…");
    expect(divisionC!.children[0]!.gistUnit).toBeNull();
    expect(divisionC!.gist).toBe("This title provides appropriations to the Senate…");
    expect(divisionC!.gistFrom).toBe("Title I");
    expect(divisionC!.gistUnit).toBe("title");

    // H.R. 5371's Division D repeats its name on the next line; the gist is the sentence after it.
    const [divisionD] = summaryOutline(
      summaryBlocks(
        [
          "DIVISION D--MILITARY CONSTRUCTION, VETERANS AFFAIRS, AND RELATED AGENCIES APPROPRIATIONS ACT, 2026",
          "Military Construction, Veterans Affairs, and Related Agencies Appropriations Act, 2026",
          "This division provides FY2026 appropriations for military construction, the Department of Veterans Affairs (VA), and related agencies.",
          "DIVISION E--EXTENSION OF AGRICULTURAL PROGRAMS",
          "(Sec. 5001) This section reauthorizes the United States Grain Standards Act.",
        ].join("\n"),
      ),
    ).sections;
    expect(divisionD!.gist).toBe(
      "This division provides FY2026 appropriations for military construction, the Department of Veterans Affairs (VA), and related agencies.",
    );
  });

  test("a gist from one bill section never opens on its locator, and stays the CRS's own words", () => {
    const [agriculture, coastGuard] = summaryOutline(
      summaryBlocks(
        [
          "TITLE I--AGRICULTURE",
          "Subtitle A--Nutrition",
          "(Sec. 10101) This section prohibits USDA from increasing the cost of the Thrifty Food Plan (TFP).",
          "TITLE IV--COMMERCE",
          // One summary in the snapshot prints the locator without its space.
          "(Sec.40001) This section provides the Coast Guard with funds for FY2025, to remain available through FY2029, to use expedited processes to (1) procure or acquire new operational assets and systems; (2) maintain existing assets and systems.",
        ].join("\n"),
      ),
    ).sections;
    // From a subtitle's section: the section number is enough to find it, since sections are numbered
    // through the whole bill.
    expect(agriculture!.gist).toBe(
      "This section prohibits USDA from increasing the cost of the Thrifty Food Plan (TFP).",
    );
    expect(agriculture!.gistFrom).toBe("Sec. 10101");
    expect(agriculture!.gistUnit).toBe("section");
    // A long one is cut as before, measured without the locator, and is still the paragraph's opening words.
    expect(coastGuard!.gist).toBe(
      "This section provides the Coast Guard with funds for FY2025, to remain available through FY2029, to use expedited processes…",
    );
    expect(coastGuard!.gistFrom).toBe("Sec. 40001");
    for (const section of [agriculture!, coastGuard!]) expect(section.gist).not.toMatch(/\(Sec/);
  });

  test("a long or unfinished first sentence is cut at a clause boundary and says nothing new", () => {
    // H.R. 1's Titles II, IV, V and VI as the CRS prints their first paragraphs.
    const cases: Array<[string, string]> = [
      [
        "(Sec. 20001) This section provides additional funding for FY2025 to the Department of Defense (DOD) for",
        "(Sec. 20001) This section provides additional funding for FY2025 to the Department of Defense (DOD)…",
      ],
      [
        "(Sec. 40001) This section provides the Coast Guard with funds for FY2025, to remain available through FY2029, to use expedited processes to (1) procure or acquire new operational assets and systems; (2) maintain existing assets and systems; (3) design, construct, plan, engineer, and improve necessary shore infrastructure; and (4) enhance operational resilience for monitoring, search and rescue, interdiction, hardening of maritime approaches, and navigational safety.",
        "(Sec. 40001) This section provides the Coast Guard with funds for FY2025, to remain available through FY2029, to use expedited processes…",
      ],
      [
        "(Sec. 50101) This section generally reduces restrictions on onshore development of oil and gas on federal lands, including by (1) decreasing the minimum royalty rates, (2) reinstating noncompetitive leasing, (3) directing the Department of the Interior to immediately resume onshore quarterly lease sales, and (4) directing Interior to approve applications.",
        "(Sec. 50101) This section generally reduces restrictions on onshore development of oil and gas on federal lands…",
      ],
      [
        "(Sec. 60001) This section rescinds unobligated funds for the program under which the Environmental Protection Agency (EPA) provides (1) grants and rebates to replace certain medium-duty vehicles (e.g., school buses) and heavy-duty vehicles (e.g., garbage trucks) with zero-emission vehicles.",
        "(Sec. 60001) This section rescinds unobligated funds for the program under which the Environmental Protection Agency (EPA) provides…",
      ],
      [
        // H.R. 6644, Title VI: never cut inside a parenthesis.
        "(Sec. 601) This section requires mortgage lenders to include on the Uniform Residential Loan Application (i.e., Fannie Mae Form 1003 or Freddie Mac Form 65) a notification that applicants with military service may qualify for a Department of Veterans Affairs (VA) Home Loan.",
        "(Sec. 601) This section requires mortgage lenders to include on the Uniform Residential Loan Application…",
      ],
      ["This subtitle ends here.", "This subtitle ends here."],
    ];
    for (const [text, gist] of cases) {
      expect(gistText(text)).toBe(gist);
      expect(gist.length).toBeLessThanOrEqual(201);
      expect(text.startsWith(gist.replace(/…$/, ""))).toBe(true);
    }
  });

  test("each section says what it holds, counted from the text", () => {
    const [first, armed, finance] = summaryOutline(summaryBlocks(HR1)).sections;
    expect(first!.contents).toBe("2 subtitles, 1 section");
    expect(armed!.contents).toBe("1 section");
    expect(finance!.contents).toBe("2 subtitles, 1 section");
    expect(finance!.children[0]!.contents).toBe("1 chapter");
  });

  test("the bar chart sizes each top-level section by its section count, in order, every bar from zero", () => {
    const shares = sectionShares(summaryOutline(summaryBlocks(HR1)).sections);
    expect(shares).toEqual({
      total: 3,
      rows: [
        {
          id: "title-i",
          heading: "Title I: Committee on Agriculture, Nutrition, and Forestry",
          name: "Agriculture, Nutrition, and Forestry",
          count: 1,
          share: 1 / 3,
        },
        {
          id: "title-ii",
          heading: "Title II: Committee on Armed Services",
          name: "Armed Services",
          count: 1,
          share: 1 / 3,
        },
        {
          id: "title-vii",
          heading: "Title VII: Finance",
          name: "Finance",
          count: 1,
          share: 1 / 3,
        },
      ],
    });
    // Nothing to size when the CRS text numbers no sections.
    expect(
      sectionShares(
        summaryOutline(summaryBlocks("TITLE I--REPORTS\nText.\nTITLE II--FEES\nMore text."))
          .sections,
      ),
    ).toBeNull();
  });

  test("the chart's screen-reader sentence names the largest section from the counts", () => {
    const row = (name: string, count: number) => ({
      id: name,
      heading: `Title: ${name}`,
      name,
      count,
      share: count / 207,
    });
    expect(
      sharesSummary(
        { total: 207, rows: [row("Agriculture", 20), row("Finance", 86), row("Judiciary", 1)] },
        "title",
      ),
    ).toBe("Finance is the largest title, with 86 of 207 sections.");
    expect(
      sharesSummary({ total: 207, rows: [row("Finance", 86), row("Commerce", 86)] }, "division"),
    ).toBe("Finance and Commerce are the largest divisions, with 86 of 207 sections each.");
    expect(sharesSummary({ total: 1, rows: [row("Finance", 1), row("Fees", 0)] }, "title")).toBe(
      "Finance is the largest title, with 1 of 1 section.",
    );
  });

  test("short headings drop 'Committee on' and keep the division label", () => {
    expect(shortHeading("Title II: Committee on Armed Services")).toBe("Title II: Armed Services");
    expect(shortHeading("Title IV: Committee on the Judiciary")).toBe("Title IV: Judiciary");
    expect(shortHeading("Title VII: Finance")).toBe("Title VII: Finance");
    expect(shortHeading("Reports")).toBe("Reports");
  });

  test("every block is kept exactly once, in order", () => {
    const blocks = summaryBlocks(HR1);
    const outline = summaryOutline(blocks);
    const flat: string[] = outline.lead.map((block) => block.lines.join("|"));
    const walk = (sections: typeof outline.sections) => {
      for (const section of sections) {
        flat.push(section.heading);
        flat.push(...section.blocks.map((block) => block.lines.join("|")));
        walk(section.children);
      }
    };
    walk(outline.sections);
    expect(flat).toEqual(blocks.map((block) => block.lines.join("|")));
  });

  test("a summary with one section or none reads as plain text", () => {
    const short = summaryBlocks(
      "This act requires a report.\nTITLE I--REPORTS\nThis title requires a report.",
    );
    expect(summaryOutline(short)).toEqual({ lead: short, sections: [] });
    const plain = summaryBlocks("This act requires a report. It also sets a deadline.");
    expect(summaryOutline(plain).sections).toEqual([]);
  });

  test("first sentences skip abbreviations and need a finished sentence", () => {
    expect(firstSentence("This title funds U.S. Courts. It also sets fees.")).toBe(
      "This title funds U.S. Courts.",
    );
    expect(firstSentence("This part changes fees (i.e., filing fees). It ends in 2030.")).toBe(
      "This part changes fees (i.e., filing fees).",
    );
    expect(firstSentence("(Sec. 30001) This section reduces funding. It ends in 2030.")).toBe(
      "(Sec. 30001) This section reduces funding.",
    );
    expect(firstSentence("This title provides appropriations for")).toBeNull();
    expect(firstSentence("This subtitle ends here.")).toBe("This subtitle ends here.");
  });
});
