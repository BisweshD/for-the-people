import type {
  ActionContext,
  Office,
  Person,
  Position,
  RollCall,
  Term,
  VotePosition,
} from "@for-the-people/core";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { attachSource, recordRollCall, upsertPerson, upsertTerm } from "../src/actions/ingestion";
import { runAction } from "../src/actions/runner";
import { openMemoryDb, type OpenDb } from "../src/db/client";
import { duel, duelByMonth, duelOutcome, tallyDuel } from "../src/read/duel";

/** Vote Duel agreement: only roll calls where both members voted Yea or Nay count, in one Congress. */

describe("duelByMonth", () => {
  test("bins shared votes by month, oldest first, and fills the months in between", () => {
    expect(
      duelByMonth([
        { date: "2025-01-09", a: "Yea", b: "Yea" },
        { date: "2025-01-20", a: "Yea", b: "Nay" },
        { date: "2025-01-21", a: "Present", b: "Nay" },
        { date: "2025-03-02", a: "Nay", b: "Nay" },
      ]),
    ).toEqual([
      { month: "2025-01", agreed: 1, split: 1 },
      { month: "2025-02", agreed: 0, split: 0 },
      { month: "2025-03", agreed: 1, split: 0 },
    ]);
  });

  test("spans a year boundary and returns nothing without a shared vote", () => {
    const months = duelByMonth([
      { date: "2025-11-30", a: "Yea", b: "Nay" },
      { date: "2026-02-01", a: "Yea", b: "Yea" },
    ]).map((bin) => bin.month);
    expect(months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(duelByMonth([{ date: "2025-05-01", a: "NotVoting", b: "Yea" }])).toEqual([]);
  });
});

describe("duelOutcome and tallyDuel", () => {
  test("same side agrees, opposite sides split, anything else is not shared", () => {
    expect(duelOutcome("Yea", "Yea")).toBe("agree");
    expect(duelOutcome("Nay", "Nay")).toBe("agree");
    expect(duelOutcome("Yea", "Nay")).toBe("split");
    expect(duelOutcome("Nay", "Yea")).toBe("split");
    for (const other of ["Present", "NotVoting"] as const) {
      expect(duelOutcome(other, "Yea")).toBe("not-shared");
      expect(duelOutcome("Nay", other)).toBe("not-shared");
      expect(duelOutcome(other, other)).toBe("not-shared");
    }
  });

  test("counts agreements and splits, and shared always equals their sum", () => {
    const pairs: Array<{ a: Position; b: Position }> = [
      { a: "Yea", b: "Yea" },
      { a: "Nay", b: "Nay" },
      { a: "Yea", b: "Nay" },
      { a: "NotVoting", b: "NotVoting" },
      { a: "Present", b: "Yea" },
    ];
    const tally = tallyDuel(pairs);
    expect(tally).toEqual({ shared: 3, agreed: 2, split: 1 });
    expect(tally.agreed + tally.split).toBe(tally.shared);
  });

  test("no pairs means n = 0", () => {
    expect(tallyDuel([])).toEqual({ shared: 0, agreed: 0, split: 0 });
  });
});

const ctx: ActionContext = {
  actor: { kind: "ingestion", id: "test" },
  reason: "test",
  now: new Date("2026-09-23T12:00:00Z"),
};
const SOURCE = "src_00000000000000bb";
const office: Office = {
  id: "federal:senate:ME:1",
  level: "federal",
  chamber: "senate",
  title: "U.S. Senator",
  state: "ME",
  seatClass: 1,
};
const person = (id: string, last: string): Person => ({
  id,
  names: { full: `Pat ${last}`, first: "Pat", last, nickname: null, suffix: null },
  ids: { bioguide: id, fec: [], wikidata: null, ballotpedia: null, govtrack: null, lis: null },
  portrait: null,
  links: [],
  sourceIds: [SOURCE],
});
const term = (personId: string): Term => ({
  id: `${personId}:senate:2025-01-03`,
  personId,
  officeId: office.id,
  chamber: "senate",
  state: "ME",
  districtId: null,
  party: "R",
  caucus: null,
  start: "2025-01-03",
  end: "2031-01-03",
  sourceIds: [SOURCE],
});

/** One Senate roll call with the given positions for A000001, A000002, and A000003. */
function rollCall(
  congress: number,
  number: number,
  date: string,
  positions: [Position, Position, Position],
): { rollCall: RollCall; positions: VotePosition[] } {
  const id = `senate-${congress}-1-${number}`;
  const count = (position: Position) => positions.filter((value) => value === position).length;
  return {
    rollCall: {
      id,
      chamber: "senate",
      congress,
      session: 1,
      number,
      date,
      question: "On Passage of the Bill",
      result: "Bill Passed",
      requires: "1/2",
      title: `Test roll call ${number}`,
      totals: {
        yea: count("Yea"),
        nay: count("Nay"),
        present: count("Present"),
        notVoting: count("NotVoting"),
      },
      tieBreaker: null,
      measureId: null,
      officialUrl: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}1/vote_${congress}_1_${String(number).padStart(5, "0")}.htm`,
      sourceId: SOURCE,
    },
    positions: (["A000001", "A000002", "A000003"] as const).map((personId, index) => ({
      rollCallId: id,
      personId,
      position: positions[index]!,
      party: "R",
      state: "ME",
    })),
  };
}

let open: OpenDb;

beforeAll(async () => {
  open = await openMemoryDb({ migrate: true });
  const source = {
    id: SOURCE,
    publisher: "U.S. Senate",
    url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00001.xml",
    retrievedAt: "2026-09-23T12:00:00Z",
    contentHash: "b".repeat(64),
    notes: null,
  };
  expect((await runAction(open.db, attachSource, source, ctx)).ok).toBe(true);
  for (const [id, last] of [
    ["A000001", "One"],
    ["A000002", "Two"],
    ["A000003", "Three"],
  ] as const) {
    expect((await runAction(open.db, upsertPerson, person(id, last), ctx)).ok).toBe(true);
    expect((await runAction(open.db, upsertTerm, { term: term(id), office }, ctx)).ok).toBe(true);
  }
  const votes = [
    rollCall(119, 1, "2025-01-09", ["Yea", "Yea", "Nay"]),
    rollCall(119, 2, "2025-01-10", ["Nay", "Yea", "Nay"]),
    rollCall(119, 3, "2025-01-11", ["Nay", "Nay", "Yea"]),
    rollCall(119, 4, "2025-01-12", ["NotVoting", "Yea", "Yea"]),
    rollCall(119, 5, "2025-01-13", ["Yea", "Present", "Yea"]),
    rollCall(119, 6, "2025-01-14", ["Yea", "Nay", "Yea"]),
  ];
  for (const vote of votes) {
    const result = await runAction(open.db, recordRollCall, vote, ctx);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }
}, 60_000);

afterAll(async () => {
  await open?.close();
});

describe("duel read", () => {
  test("agreement counts only roll calls where both took a side, with the splits listed newest first", async () => {
    const record = await duel(open.db, "A000001", "A000002");
    expect(record.bothRecorded).toBe(6);
    expect(record.shared).toBe(4);
    expect(record.agreed).toBe(2);
    expect(record.split).toBe(2);
    expect(record.splits.map((split) => split.rollCall.id)).toEqual([
      "senate-119-1-6",
      "senate-119-1-2",
    ]);
    expect(record.splits[0]).toMatchObject({ a: "Yea", b: "Nay" });
    expect(record.splits[0]!.source.id).toBe(SOURCE);
    expect(record.firstDate).toBe("2025-01-09");
    expect(record.lastDate).toBe("2025-01-14");
  });

  test("is symmetric: swapping the members swaps the sides, not the counts", async () => {
    const forward = await duel(open.db, "A000001", "A000003");
    const back = await duel(open.db, "A000003", "A000001");
    expect({ shared: back.shared, agreed: back.agreed, split: back.split }).toEqual({
      shared: forward.shared,
      agreed: forward.agreed,
      split: forward.split,
    });
    expect(back.splits.map(({ a, b }) => ({ a: b, b: a }))).toEqual(
      forward.splits.map(({ a, b }) => ({ a, b })),
    );
  });

  test("another Congress has no shared roll calls", async () => {
    const record = await duel(open.db, "A000001", "A000002", 118);
    expect(record).toMatchObject({ shared: 0, agreed: 0, split: 0, bothRecorded: 0 });
    expect(record.splits).toEqual([]);
  });
});
