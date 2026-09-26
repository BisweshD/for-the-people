import type {
  ActionContext,
  KeyVote,
  Office,
  Person,
  RollCall,
  Term,
  VotePosition,
} from "@for-the-people/core";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  publishKeyVote,
  proposeKeyVote,
  upsertIssueArea,
  verifyKeyVote,
} from "../src/actions/curation";
import { eq } from "drizzle-orm";
import {
  attachSource,
  recordRollCall,
  removeRace,
  removeRollCall,
  upsertCandidacy,
  upsertDistrictMap,
  upsertElection,
  upsertFinanceSummary,
  upsertPerson,
  upsertRace,
  upsertTerm,
} from "../src/actions/ingestion";
import { runAction } from "../src/actions/runner";
import { openMemoryDb, type OpenDb } from "../src/db/client";
import { candidacies, eventLog, races, rollCalls, votePositions } from "../src/db/schema";

/** Validated actions against a real (in-memory) Postgres with the real migrations. */

const ctx: ActionContext = {
  actor: { kind: "ingestion", id: "test" },
  reason: "test",
  now: new Date("2026-09-23T12:00:00Z"),
};
const SOURCE = "src_00000000000000aa";
let open: OpenDb;

const person = (id: string, last: string): Person => ({
  id,
  names: { full: `Pat ${last}`, first: "Pat", last, nickname: null, suffix: null },
  ids: { bioguide: id, fec: [], wikidata: null, ballotpedia: null, govtrack: null, lis: null },
  portrait: null,
  links: [],
  sourceIds: [SOURCE],
});
const office: Office = {
  id: "federal:house:NC",
  level: "federal",
  chamber: "house",
  title: "U.S. Representative",
  state: "NC",
  seatClass: null,
};
const term = (personId: string): Term => ({
  id: `${personId}:house:2025-01-03`,
  personId,
  officeId: office.id,
  chamber: "house",
  state: "NC",
  districtId: null,
  party: "D",
  caucus: null,
  start: "2025-01-03",
  end: "2027-01-03",
  sourceIds: [SOURCE],
});
const rollCall: RollCall = {
  id: "house-119-1-23",
  chamber: "house",
  congress: 119,
  session: 1,
  number: 23,
  date: "2025-01-22",
  question: "On Passage",
  result: "Passed",
  requires: "1/2",
  title: "Test bill",
  totals: { yea: 1, nay: 1, present: 0, notVoting: 0 },
  tieBreaker: null,
  measureId: null,
  officialUrl: "https://clerk.house.gov/Votes/2025023",
  sourceId: SOURCE,
};
const positions: VotePosition[] = [
  { rollCallId: rollCall.id, personId: "A000001", position: "Yea", party: "D", state: "NC" },
  { rollCallId: rollCall.id, personId: "A000002", position: "Nay", party: "D", state: "NC" },
];
const events = async () => (await open.db.select().from(eventLog)).length;

beforeAll(async () => {
  open = await openMemoryDb({ migrate: true });
  const source = {
    id: SOURCE,
    publisher: "Test",
    url: "https://clerk.house.gov/evs/2025/roll023.xml",
    retrievedAt: "2026-09-23T12:00:00Z",
    contentHash: "a".repeat(64),
    notes: null,
  };
  expect((await runAction(open.db, attachSource, source, ctx)).ok).toBe(true);
  for (const [id, last] of [
    ["A000001", "One"],
    ["A000002", "Two"],
    ["A000003", "Three"],
  ] as const) {
    expect((await runAction(open.db, upsertPerson, person(id, last), ctx)).ok).toBe(true);
  }
  for (const id of ["A000001", "A000002"])
    expect((await runAction(open.db, upsertTerm, { term: term(id), office }, ctx)).ok).toBe(true);
}, 60_000);

afterAll(async () => {
  await open?.close();
});

describe("RecordRollCall", () => {
  test("rejects totals that disagree with the positions, and writes nothing", async () => {
    const before = await events();
    const result = await runAction(
      open.db,
      recordRollCall,
      { rollCall: { ...rollCall, totals: { ...rollCall.totals, yea: 2 } }, positions },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("invariant");
    expect(await events()).toBe(before);
  });

  test("rejects a VotePosition from someone who was not serving in that chamber", async () => {
    const outsider: VotePosition = {
      rollCallId: rollCall.id,
      personId: "A000003",
      position: "Yea",
      party: "D",
      state: "NC",
    };
    const result = await runAction(
      open.db,
      recordRollCall,
      {
        rollCall: { ...rollCall, totals: { ...rollCall.totals, yea: 2 } },
        positions: [...positions, outsider],
      },
      ctx,
    );
    expect(!result.ok && result.error.message).toMatch(/A000003 was not serving in the house/);
  });

  test("records once, logs one event, and is a no-op the second time", async () => {
    const before = await events();
    const first = await runAction(open.db, recordRollCall, { rollCall, positions }, ctx);
    expect(first.ok && first.eventId).toBeTruthy();
    expect(await events()).toBe(before + 1);
    const second = await runAction(open.db, recordRollCall, { rollCall, positions }, ctx);
    expect(second.ok && second.eventId).toBeNull();
    expect(await events()).toBe(before + 1);
  });
});

describe("RemoveRollCall", () => {
  const quorum: RollCall = {
    ...rollCall,
    id: "house-119-2-1",
    session: 2,
    number: 1,
    date: "2026-01-06",
    question: "Call of the House",
    result: "Quorum present",
    totals: { yea: 0, nay: 0, present: 2, notVoting: 0 },
  };

  test("removes a stored quorum call with its positions, logs it once, and is idempotent", async () => {
    const present = positions.map((position) => ({
      ...position,
      rollCallId: quorum.id,
      position: "Present" as const,
    }));
    expect(
      (await runAction(open.db, recordRollCall, { rollCall: quorum, positions: present }, ctx)).ok,
    ).toBe(true);
    const before = await events();
    const input = {
      rollCallId: quorum.id,
      why: '"Call of the House" is a quorum call, not a vote on a question.',
      sourceIds: [SOURCE],
    };
    const removed = await runAction(open.db, removeRollCall, input, ctx);
    expect(removed.ok && removed.eventId).toBeTruthy();
    expect(await events()).toBe(before + 1);
    const [logged] = await open.db
      .select()
      .from(eventLog)
      .where(eq(eventLog.action, "RemoveRollCall"));
    expect(logged?.summary).toMatchObject({ positionsRemoved: 2, chamber: "house" });
    expect(await open.db.select().from(rollCalls).where(eq(rollCalls.id, quorum.id))).toEqual([]);
    expect(
      await open.db.select().from(votePositions).where(eq(votePositions.rollCallId, quorum.id)),
    ).toEqual([]);

    const again = await runAction(open.db, removeRollCall, input, ctx);
    expect(again.ok && again.eventId).toBeNull();
  });
});

describe("validation", () => {
  test("invalid input is rejected with readable issues and nothing is written", async () => {
    const before = await events();
    const result = await runAction(open.db, upsertPerson, { ...person("bad-id", "Bad") }, ctx);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("invalid");
    expect(await events()).toBe(before);
  });

  test("a finance summary cannot carry a donor name or address", async () => {
    const summary = {
      personId: "A000001",
      cycle: 2026,
      financeCommitteeId: "C00000001",
      receipts: 100,
      individual: 80,
      smallDollarShare: null,
      pacs: 20,
      party: 0,
      selfFunding: 0,
      transfers: 0,
      cashOnHand: 50,
      debts: 0,
      inStateShare: null,
      asOf: "2026-06-30",
      sourceId: SOURCE,
      donorName: "Jane Doe",
    };
    const result = await runAction(open.db, upsertFinanceSummary, summary, ctx);
    expect(!result.ok && result.error.code).toBe("invalid");
  });
});

describe("RemoveRace", () => {
  const race = {
    id: "2026-11-03-general|federal:house:PR|PR-0@cd120",
    electionId: "2026-11-03-general",
    officeId: "federal:house:PR",
    chamber: "house",
    state: "PR",
    districtId: "PR-0@cd120",
    sourceIds: [SOURCE],
  } as const;
  const prOffice: Office = {
    id: "federal:house:PR",
    level: "federal",
    chamber: "house",
    title: "Resident Commissioner",
    state: "PR",
    seatClass: null,
  };

  test("removes the race and its candidacies with one logged event, then is a no-op", async () => {
    const setup = [
      await runAction(
        open.db,
        upsertElection,
        {
          id: "2026-11-03-general",
          date: "2026-11-03",
          type: "general",
          state: null,
          name: "2026 general election",
          sourceIds: [SOURCE],
        },
        ctx,
      ),
      await runAction(
        open.db,
        upsertDistrictMap,
        {
          mapVersion: "cd120",
          districts: [
            {
              id: "PR-0@cd120",
              state: "PR",
              number: 0,
              mapVersion: "cd120",
              geometryRef: null,
              sourceId: SOURCE,
            },
          ],
        },
        ctx,
      ),
      await runAction(open.db, upsertRace, { race, office: prOffice }, ctx),
      await runAction(
        open.db,
        upsertCandidacy,
        {
          id: `${race.id}|A000003`,
          personId: "A000003",
          raceId: race.id,
          party: "D",
          status: "filed",
          incumbent: false,
          fecCandidateId: null,
          sourceIds: [SOURCE],
        },
        ctx,
      ),
    ];
    expect(setup.every((result) => result.ok)).toBe(true);

    const before = await events();
    const input = { raceId: race.id, why: "Four-year term; not up in 2026.", sourceIds: [SOURCE] };
    const removed = await runAction(open.db, removeRace, input, ctx);
    expect(removed.ok && removed.eventId).toBeTruthy();
    expect(await events()).toBe(before + 1);
    const [logged] = await open.db
      .select()
      .from(eventLog)
      .where(eq(eventLog.action, "RemoveRace"));
    expect(logged?.summary).toMatchObject({ candidaciesRemoved: 1, state: "PR" });
    expect(await open.db.select().from(races).where(eq(races.id, race.id))).toEqual([]);
    expect(
      await open.db.select().from(candidacies).where(eq(candidacies.raceId, race.id)),
    ).toEqual([]);

    const again = await runAction(open.db, removeRace, input, ctx);
    expect(again.ok && again.eventId).toBeNull();
  });
});

describe("UpsertPerson", () => {
  test("an update without a portrait keeps the stored portrait and still cites its source", async () => {
    const portraitSource = "src_00000000000000bb";
    expect(
      (
        await runAction(
          open.db,
          attachSource,
          {
            id: portraitSource,
            publisher: "Test",
            url: "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/A000002.jpg",
            retrievedAt: "2026-09-23T12:00:00Z",
            contentHash: "b".repeat(64),
            notes: null,
          },
          ctx,
        )
      ).ok,
    ).toBe(true);
    const withPortrait = {
      ...person("A000002", "Two"),
      portrait: {
        asset: "/portraits/A000002",
        sourceId: portraitSource,
        placeholder: "data:image/webp;base64,AAAA",
      },
      sourceIds: [SOURCE, portraitSource],
    };
    expect((await runAction(open.db, upsertPerson, withPortrait, ctx)).ok).toBe(true);
    const again = await runAction(open.db, upsertPerson, person("A000002", "Two"), ctx);
    expect(again.ok && again.eventId).toBeNull();
    expect(again.ok && again.value.sourceIds).toEqual([SOURCE, portraitSource]);
  });
});

describe("curation", () => {
  const card: KeyVote = {
    id: "kv-test",
    order: 0,
    issueArea: "trade",
    card: {
      title: "Test",
      whatItDoes: "Does a thing.",
      context: "Some context.",
      yeaMeans: "Support the thing",
    },
    measures: [],
    rollCallRefs: [
      {
        rollCallId: rollCall.id,
        yeaSupportsMeasure: true,
        decisive: true,
        verification: { status: "unverified", checkedAt: null, notes: null },
      },
    ],
    yeaLean: "D",
    status: "draft",
    selectionReason: "Test",
    reviewers: [],
  };

  test("a card whose roll call is not on its measure does not verify, and cannot publish", async () => {
    await runAction(
      open.db,
      upsertIssueArea,
      { id: "trade", label: "Trade", description: "Trade", icon: "Container" },
      ctx,
    );
    expect((await runAction(open.db, proposeKeyVote, card, ctx)).ok).toBe(true);
    const verified = await runAction(
      open.db,
      verifyKeyVote,
      { keyVoteId: card.id, expectations: [] },
      ctx,
    );
    expect(verified.ok && verified.value).toBe("draft");
    const published = await runAction(open.db, publishKeyVote, { keyVoteId: card.id }, ctx);
    expect(!published.ok && published.error.code).toBe("invariant");
  });

  test("a roll call a key vote maps cannot be removed", async () => {
    const before = await events();
    const result = await runAction(
      open.db,
      removeRollCall,
      { rollCallId: rollCall.id, why: "Test", sourceIds: [SOURCE] },
      ctx,
    );
    expect(!result.ok && result.error.message).toMatch(/mapped by key votes kv-test/);
    expect(await events()).toBe(before);
    expect(await open.db.select().from(rollCalls).where(eq(rollCalls.id, rollCall.id))).toHaveLength(1);
  });
});
