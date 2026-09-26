import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  findBannedWords,
  KeyVote,
  keyVotePublishViolations,
  keyVoteShapeViolations,
  readability,
  readingSentences,
  readingWords,
} from "@for-the-people/core";
import { describe, expect, test } from "vitest";
import { KeyVoteFile } from "../src/ingest/jobs/keyvotes";

/** The curated key-votes file and the published cards in the bundled snapshot. */

const root = join(__dirname, "..", "..", "..");
const file = KeyVoteFile.parse(
  JSON.parse(readFileSync(join(root, "data", "key-votes.json"), "utf8")),
);

/** Minimal CSV reader for the snapshot (COPY ... CSV output: quoted fields, doubled quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  const [header, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(header!.map((name, i) => [name, values[i] ?? ""])),
  );
}

describe("data/key-votes.json", () => {
  test("every card is well formed: one decisive roll call per chamber, no roll call listed twice", () => {
    for (const card of file.keyVotes) {
      const asKeyVote = KeyVote.parse({
        ...card,
        rollCallRefs: card.rollCallRefs.map(({ expected: _expected, ...ref }) => ({
          ...ref,
          verification: { status: "unverified", checkedAt: null, notes: null },
        })),
      });
      expect(keyVoteShapeViolations(asKeyVote), card.id).toEqual([]);
    }
  });

  test("card copy uses none of the banned words", () => {
    for (const card of file.keyVotes) {
      for (const [field, text] of Object.entries(card.card)) {
        expect(findBannedWords(text), `${card.id}.${field}`).toEqual([]);
      }
    }
  });

  // The cards are written for an average American reader (about 8th grade). Flesch-Kincaid is rough,
  // so the ceiling per card has headroom; the average and the sentence length are the real guard.
  describe("plain language", () => {
    const live = file.keyVotes.filter((card) => card.status !== "retired");
    const copy = (card: (typeof live)[number]) =>
      [card.card.question ?? "", card.card.whatItDoes, card.card.context].join(" ");

    test("every card asks a yes/no question", () => {
      for (const card of live) expect(card.card.question ?? "", card.id).toMatch(/^[A-Z].*\?$/);
    });

    test("no sentence runs past 25 words", () => {
      for (const card of live)
        for (const field of ["question", "whatItDoes", "context"] as const)
          for (const sentence of readingSentences(card.card[field] ?? ""))
            expect(readingWords(sentence).length, `${card.id}.${field}: ${sentence}`).toBeLessThanOrEqual(25);
    });

    test("each card reads at or below grade 10, and the set averages grade 8.5 or below", () => {
      const grades = live.map((card) => ({ id: card.id, grade: readability(copy(card)).grade }));
      for (const { id, grade } of grades) expect(grade, id).toBeLessThanOrEqual(10);
      const mean = grades.reduce((sum, { grade }) => sum + grade, 0) / grades.length;
      expect(mean).toBeLessThanOrEqual(8.5);
    });
  });

  test("every card names an issue area defined in the file", () => {
    const areas = new Set(file.issueAreas.map((area) => area.id));
    for (const card of file.keyVotes) expect(areas.has(card.issueArea), card.id).toBe(true);
  });

  test("every card has approval from two reviewers with different leanings", () => {
    for (const card of file.keyVotes.filter((candidate) => candidate.status !== "retired")) {
      const approvals = card.reviewers.filter((reviewer) => reviewer.verdict === "approved");
      // A reviewer with no stated leaning is a review, not a second viewpoint.
      const leanings = approvals
        .map((reviewer) => reviewer.leaning)
        .filter((leaning) => leaning !== "unstated");
      expect(new Set(leanings).size, card.id).toBeGreaterThanOrEqual(2);
    }
  });

  test("a reviewer with no stated leaning never stands in for a second leaning", () => {
    const card = file.keyVotes.find((candidate) => candidate.status !== "retired")!;
    const published = KeyVote.parse({
      ...card,
      status: "published",
      rollCallRefs: card.rollCallRefs.map(({ expected: _expected, ...ref }) => ({
        ...ref,
        verification: { status: "verified", checkedAt: "2026-09-24T00:00:00Z", notes: null },
      })),
    });
    const ai = published.reviewers.find((reviewer) => reviewer.kind === "ai")!;
    const owner = {
      id: "reviewer-owner",
      kind: "human" as const,
      leaning: "unstated" as const,
      reviewedAt: "2026-09-24T00:00:00Z",
      verdict: "approved" as const,
      notes: null,
    };
    expect(keyVotePublishViolations({ ...published, reviewers: [ai, owner] })).toContain(
      `${card.id}: needs approval from two reviewers with different leanings`,
    );
  });
});

describe("published implies verified (bundled snapshot)", () => {
  const rows = parseCsv(
    gunzipSync(readFileSync(join(root, "data", "snapshot", "key_votes.csv.gz"))).toString("utf8"),
  );

  test("the snapshot holds the curated cards", () => {
    expect(rows.length).toBe(file.keyVotes.length);
  });

  test("every published card has only verified roll calls and two approvals", () => {
    const published = rows.filter((row) => row.status === "published");
    expect(published.length).toBeGreaterThanOrEqual(12);
    for (const row of published) {
      const keyVote = KeyVote.parse({
        id: row.id,
        order: Number(row.sort_order),
        issueArea: row.issue_area,
        card: JSON.parse(row.card!),
        measures: row
          .measures!.replace(/^\{|\}$/g, "")
          .split(",")
          .filter(Boolean),
        rollCallRefs: JSON.parse(row.roll_call_refs!),
        yeaLean: row.yea_lean,
        status: row.status,
        selectionReason: row.selection_reason,
        reviewers: JSON.parse(row.reviewers!),
      });
      expect(keyVotePublishViolations(keyVote), keyVote.id).toEqual([]);
    }
  });
});
