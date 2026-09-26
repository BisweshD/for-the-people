import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { expectedHouseRollCallId, houseSkipDecision } from "../src/ingest/jobs/votes";
import { parseHouseRollCall } from "../src/ingest/parsers/clerk";

/**
 * R2-L2: a skipped House roll call is removed from the database only
 * when it is a quorum call or has no recorded votes, and only when the file is the one requested.
 * Any other skip keeps the stored row and leaves a note.
 */

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "..", "..", "tests", "fixtures", "clerk", name), "utf8");

const passage = fixture("roll-2025-023.xml");
const quorum = passage.replace(
  "<vote-type>YEA-AND-NAY</vote-type>",
  "<vote-type>QUORUM</vote-type>",
);
const noVotes = passage.replace(/<vote-data>[\s\S]*<\/vote-data>/, "");
const missingBioguide = passage.replace(
  /<legislator name-id="A000370"[^>]*>Adams<\/legislator>/,
  "<legislator>Adams</legislator>",
);
const oddVote = passage.replace("<vote>Nay</vote>", "<vote>Maybe</vote>");

const skipped = (xml: string, year = 2025) => {
  const parsed = parseHouseRollCall(xml, year);
  if (parsed.kind !== "skipped") throw new Error("expected a skip");
  return parsed;
};

describe("the Clerk parser says why it skipped", () => {
  test.each([
    ["a quorum call", quorum, "quorum"],
    ["no recorded votes", noVotes, "noVotes"],
    ["a vote with no bioguide id", missingBioguide, "missingBioguide"],
    ["a vote that is not Yea/Nay/Present/Not Voting", oddVote, "unrecognizedVote"],
    ["the Speaker election", fixture("roll-2025-002.xml"), "unrecognizedVote"],
  ])("%s", (_label, xml, cause) => {
    expect(skipped(xml).cause).toBe(cause);
  });
});

describe("which skipped roll calls are removed", () => {
  test("the file requested for 2025 roll 23 holds house-119-1-23", () => {
    expect(expectedHouseRollCallId(2025, 23)).toBe("house-119-1-23");
    expect(expectedHouseRollCallId(2026, 130)).toBe("house-119-2-130");
  });

  test("a quorum call, or a roll call with no recorded votes, is removed", () => {
    expect(houseSkipDecision(skipped(quorum), { year: 2025, roll: 23 })).toEqual({ remove: true });
    expect(houseSkipDecision(skipped(noVotes), { year: 2025, roll: 23 })).toEqual({ remove: true });
  });

  test.each([
    ["a vote with no bioguide id", missingBioguide],
    ["a vote the parser does not recognize", oddVote],
    ["the Speaker election", fixture("roll-2025-002.xml")],
  ])("%s keeps the stored row and leaves a note", (_label, xml) => {
    const parsed = skipped(xml);
    const number = Number(parsed.id.split("-").at(-1));
    const decision = houseSkipDecision(parsed, { year: 2025, roll: number });
    expect(decision.remove).toBe(false);
    if (!decision.remove) expect(decision.note).toContain(parsed.id);
  });

  test("a quorum call whose file names another roll call is never removed", () => {
    for (const requested of [
      { year: 2025, roll: 24 },
      { year: 2026, roll: 23 },
    ]) {
      const decision = houseSkipDecision(skipped(quorum), requested);
      expect(decision.remove).toBe(false);
      if (!decision.remove) {
        expect(decision.note).toContain("house-119-1-23");
        expect(decision.note).toContain(expectedHouseRollCallId(requested.year, requested.roll));
      }
    }
  });
});
