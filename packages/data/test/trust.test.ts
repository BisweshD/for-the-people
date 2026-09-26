import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANONYMOUS_PUBLIC_ACTOR, type ActionContext } from "@for-the-people/core";
import { ElectionDatesFile } from "@for-the-people/core/calendar";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { upsertIssueArea } from "../src/actions/curation";
import { attachSource } from "../src/actions/ingestion";
import { submitCorrection } from "../src/actions/public";
import { runAction } from "../src/actions/runner";
import { openMemoryDb, workspaceRoot, type OpenDb } from "../src/db/client";
import {
  corrections,
  eventLog,
  ingestionRuns,
  issueAreas,
  people,
  rateLimits,
  rollCalls,
  sources,
  votePositions,
} from "../src/db/schema";
import { electionDates, electionSource } from "../src/read/election";
import { RUN_HISTORY, rollCallTally, status } from "../src/read/index";
import {
  changelog,
  describeIngestionRun,
  dropRepeatedRuns,
  describeKeyVoteEvent,
  foldRecounts,
  keyVoteSelection,
  toIso,
} from "../src/read/trust";
import { checkRateLimit, saltedHash } from "../src/runtime/rate-limit";

/** Rate limiter, SubmitCorrection, and the trust-page reads, against a real in-memory Postgres. */

let open: OpenDb;
beforeAll(async () => {
  open = await openMemoryDb();
});
afterAll(async () => {
  await open.close();
});

describe("checkRateLimit", () => {
  const limits = [
    { windowSeconds: 600, max: 2 },
    { windowSeconds: 86_400, max: 3 },
  ];

  test("allows up to the limit, then refuses with a retry time", async () => {
    const now = new Date("2026-09-23T16:00:30Z");
    const key = "test:a";
    expect(await checkRateLimit(open.db, key, limits, now)).toEqual({ ok: true });
    expect(await checkRateLimit(open.db, key, limits, now)).toEqual({ ok: true });
    const refused = await checkRateLimit(open.db, key, limits, now);
    expect(refused.ok).toBe(false);
    // The 10-minute window started at 16:00:00, so it resets 570 seconds after 16:00:30.
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 570 });
  });

  test("a new short window opens, but the daily limit still holds", async () => {
    const key = "test:b";
    const first = new Date("2026-09-23T10:00:00Z");
    await checkRateLimit(open.db, key, limits, first);
    await checkRateLimit(open.db, key, limits, first);
    const later = new Date("2026-09-23T10:20:00Z");
    expect(await checkRateLimit(open.db, key, limits, later)).toEqual({ ok: true });
    const blocked = await checkRateLimit(open.db, key, limits, later);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBe(14 * 3600 - 20 * 60);
  });

  test("keys are independent", async () => {
    const now = new Date("2026-09-23T12:00:00Z");
    for (let i = 0; i < 3; i++) await checkRateLimit(open.db, "test:c", limits, now);
    expect(await checkRateLimit(open.db, "test:d", limits, now)).toEqual({ ok: true });
  });

  test("stores only the key it is given, never an address", async () => {
    const hash = saltedHash("203.0.113.9", "a-test-salt-of-16+chars");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(saltedHash("203.0.113.9", "another-salt-16+chars")).not.toBe(hash);
    await checkRateLimit(open.db, `corrections:${hash}`, limits);
    const rows = await open.db.select().from(rateLimits);
    expect(rows.some((row) => row.key.includes("203.0.113.9"))).toBe(false);
  });
});

describe("SubmitCorrection", () => {
  const ctx: ActionContext = {
    actor: ANONYMOUS_PUBLIC_ACTOR,
    reason: "Correction report from the public form",
    now: new Date("2026-09-23T16:00:00Z"),
  };

  test("files a report and logs it with an anonymous actor (R2-L5)", async () => {
    const result = await runAction(
      open.db,
      submitCorrection,
      {
        target: { kind: "person", id: "/people/A000370", field: "party" },
        report: "The party tag should read Democrat, per the House Clerk.",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await open.db.select().from(corrections).where(eq(corrections.id, result.value));
    expect(row).toMatchObject({ targetKind: "person", status: "submitted", targetField: "party" });
    const [event] = await open.db
      .select()
      .from(eventLog)
      .where(eq(eventLog.targetId, result.value));
    expect(event).toMatchObject({
      action: "SubmitCorrection",
      actorKind: "public",
      actorId: "anonymous",
    });
    // Nothing that could tell two senders apart: no IP, no hash of one.
    expect(JSON.stringify(event)).not.toMatch(/ip:|[0-9a-f]{32}/);
    expect(JSON.stringify(event?.summary)).not.toContain("Democrat");
  });

  test("a public actor that names itself is refused, and nothing is written (R2-L5)", async () => {
    const before = (await open.db.select().from(eventLog)).length;
    const result = await runAction(
      open.db,
      submitCorrection,
      { target: { kind: "other", id: "x", field: null }, report: "A long enough report." },
      { ...ctx, actor: { kind: "public", id: "ip:0123456789abcdef0123456789abcdef" } },
    );
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect((await open.db.select().from(eventLog)).length).toBe(before);
  });

  test("rejects a short report and an unknown target kind", async () => {
    const short = await runAction(
      open.db,
      submitCorrection,
      { target: { kind: "person", id: "x", field: null }, report: "short" },
      ctx,
    );
    expect(short.ok).toBe(false);
    const kind = await runAction(
      open.db,
      submitCorrection,
      { target: { kind: "donor", id: "x", field: null }, report: "A long enough report." },
      ctx,
    );
    expect(kind.ok).toBe(false);
  });

  test("only the public can submit", async () => {
    const result = await runAction(
      open.db,
      submitCorrection,
      { target: { kind: "other", id: "x", field: null }, report: "A long enough report." },
      { ...ctx, actor: { kind: "ingestion", id: "job" } },
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("forbidden");
  });
});

describe("runAction ties each action to its actor (R2-L3)", () => {
  const source = {
    id: "src_00000000000000aa",
    publisher: "U.S. Senate",
    url: "https://www.senate.gov/legislative/votes_new.htm",
    retrievedAt: "2026-09-23T16:00:00.000Z",
    contentHash: "a".repeat(64),
    notes: null,
  };
  const issueArea = {
    id: "public-test-area",
    label: "Public test",
    description: "Written by a test.",
    icon: "scale",
  };
  const at = (actor: ActionContext["actor"]): ActionContext => ({
    actor,
    reason: "Access test",
    now: new Date("2026-09-23T16:00:00Z"),
  });

  test("the public cannot run ingestion or curation actions", async () => {
    const before = (await open.db.select().from(eventLog)).length;
    const ingest = await runAction(open.db, attachSource, source, at(ANONYMOUS_PUBLIC_ACTOR));
    expect(!ingest.ok && ingest.error.code).toBe("forbidden");
    const curate = await runAction(open.db, upsertIssueArea, issueArea, at(ANONYMOUS_PUBLIC_ACTOR));
    expect(!curate.ok && curate.error.code).toBe("forbidden");
    expect(await open.db.select().from(sources).where(eq(sources.id, source.id))).toHaveLength(0);
    expect(
      await open.db.select().from(issueAreas).where(eq(issueAreas.id, issueArea.id)),
    ).toHaveLength(0);
    expect((await open.db.select().from(eventLog)).length).toBe(before);
  });

  test("ingestion and maintainers still can", async () => {
    const ingest = await runAction(
      open.db,
      attachSource,
      source,
      at({ kind: "ingestion", id: "test" }),
    );
    expect(ingest.ok).toBe(true);
    const curate = await runAction(
      open.db,
      upsertIssueArea,
      issueArea,
      at({ kind: "maintainer", id: "test" }),
    );
    expect(curate.ok).toBe(true);
  });
});

describe("trust reads", () => {
  test("toIso normalizes Postgres timestamps", () => {
    expect(toIso("2026-09-23 20:45:55.931-05")).toBe("2026-09-24T01:45:55.931Z");
    expect(toIso("2026-09-23T12:00:00Z")).toBe("2026-09-23T12:00:00.000Z");
  });

  test("changelog sentences are plain and never claim a check that failed", () => {
    expect(
      describeKeyVoteEvent("VerifyKeyVote", "SAVE Act", { verified: 1, total: 2, status: "draft" }),
    ).toBe(
      "Checked the “SAVE Act” key vote against the official record: 1 of 2 roll calls matched, so it stays unpublished.",
    );
    expect(describeKeyVoteEvent("PublishKeyVote", "SAVE Act", {})).toBe(
      "Published the “SAVE Act” key vote.",
    );
    // AI reviews are disclosed as AI; only reviews recorded as human read as plain approvals.
    expect(
      describeKeyVoteEvent("ApproveKeyVote", "SAVE Act", {
        status: "reviewed",
        reviewers: "reviewer-progressive:approved, reviewer-conservative:approved",
      }),
    ).toBe(
      "Two AI reviewers, prompted with different leanings, approved the wording of the “SAVE Act” key vote. Human review is pending.",
    );
    expect(
      describeKeyVoteEvent("ApproveKeyVote", "SAVE Act", {
        status: "reviewed",
        reviewers: "jane (human):approved, sam (human):approved",
      }),
    ).toBe("Two reviewers with different leanings approved the wording of the “SAVE Act” key vote.");
    expect(
      describeKeyVoteEvent("ApproveKeyVote", "SAVE Act", {
        status: "published",
        reviewers:
          "reviewer-progressive (ai):approved, reviewer-conservative (ai):approved, reviewer-owner (human):approved",
      }),
    ).toBe(
      "Two AI reviewers, prompted with different leanings, and a human reviewer approved the wording of the “SAVE Act” key vote.",
    );
    expect(
      describeIngestionRun({
        job: "votes",
        status: "partial",
        stats: { "rollCalls.parsed": 1575, "RecordRollCall.written": 1 },
      }),
    ).toBe(
      "Read 1,575 roll calls (recorded votes) from the House and the Senate. 1 was new or changed. Some records were set aside and noted for review.",
    );
  });

  test("zero counts are said in words, never as 0 members", () => {
    // The snapshot's 11:24 PM (CDT) run: four terms changed, one each for four members, and no
    // member's own record changed.
    expect(
      describeIngestionRun({
        job: "legislators",
        status: "succeeded",
        stats: { "UpsertPerson.written": 0, "UpsertTerm.written": 4 },
        termMembers: 4,
      }),
    ).toBe(
      "Updated the terms in office of 4 members of Congress from the public member list. No member was added, and no other details changed.",
    );
    // Without the member count, the terms are counted as terms, never as members.
    expect(
      describeIngestionRun({
        job: "legislators",
        status: "succeeded",
        stats: { "UpsertPerson.written": 0, "UpsertTerm.written": 2 },
      }),
    ).toBe(
      "Updated 2 terms in office for members of Congress from the public member list. No member was added, and no other details changed.",
    );
    expect(
      describeIngestionRun({
        job: "legislators",
        status: "succeeded",
        stats: { "UpsertPerson.written": 3, "UpsertTerm.written": 5 },
      }),
    ).toBe(
      "Updated member details for 3 members of Congress and 5 terms in office, from the public member list.",
    );
    expect(
      describeIngestionRun({
        job: "legislators",
        status: "succeeded",
        stats: { "UpsertPerson.written": 2, "UpsertTerm.written": 0 },
      }),
    ).toBe("Updated member details for 2 members of Congress from the public member list. No terms in office changed.");
    expect(
      describeIngestionRun({
        job: "legislators",
        status: "succeeded",
        stats: { "UpsertPerson.written": 3, "UpsertTerm.written": 5 },
        termMembers: 5,
      }),
    ).toBe(
      "Updated member details for 3 members of Congress and the terms in office of 5, from the public member list.",
    );
    expect(describeIngestionRun({ job: "legislators", status: "succeeded", stats: {} })).toBe(
      "Checked the public list of members of Congress. Nothing had changed.",
    );
    for (const stats of [
      { "UpsertTerm.written": 4 } as Record<string, number>,
      { "UpsertPerson.written": 2 },
      { "UpsertPerson.written": 3, "UpsertTerm.written": 5 },
      {},
    ])
      expect(describeIngestionRun({ job: "legislators", status: "succeeded", stats })).not.toMatch(
        /\bterms?;|member changes|term changes/,
      );
    expect(
      describeIngestionRun({
        job: "votes",
        status: "succeeded",
        stats: { "rollCalls.parsed": 1573, "RecordRollCall.written": 0 },
      }),
    ).toBe("Read 1,573 roll calls (recorded votes) from the House and the Senate. None were new or changed.");
    expect(
      describeIngestionRun({
        job: "portraits",
        status: "succeeded",
        stats: { "portraits.stored": 0, "portraits.missing": 16, "portraits.undecodable": 1 },
      }),
    ).toBe(
      "No new official portraits. 17 members show initials: 16 have no official portrait, and 1 has one that could not be read.",
    );
    expect(
      describeIngestionRun({
        job: "fec",
        status: "succeeded",
        stats: { "UpsertFinanceSummary.written": 0 },
      }),
    ).toBe(
      "Checked 2026 races, candidate filings, and campaign money totals from the FEC. Nothing had changed.",
    );
  });

  test("a run repeated in the same minute with identical stats is listed once", () => {
    const run = (id: string, finishedAt: string, stats: Record<string, number>) => ({
      id,
      job: "stats",
      status: "succeeded",
      startedAt: finishedAt,
      finishedAt,
      stats,
    });
    const counts = { "memberStats.rows": 555, "RefreshDerivedStats.written": 1 };
    const kept = dropRepeatedRuns([
      run("b", "2026-09-23 20:48:47.223-05", { "RefreshDerivedStats.written": 1, "memberStats.rows": 555 }),
      run("a", "2026-09-23 20:48:31.578-05", counts),
      run("c", "2026-09-23 20:46:42.909-05", counts),
      run("d", "2026-09-23 20:48:12.000-05", { ...counts, "memberStats.rows": 554 }),
    ]);
    expect(kept.map((entry) => entry.id)).toEqual(["b", "c", "d"]);
  });

  test("a recount right after a roll-call read joins that read's row, and names members who left", () => {
    // The bundled snapshot's runs, newest first: stats runs start the moment a votes run finishes,
    // except the 11:24 PM (CDT) one, which follows a legislators run.
    const run = (id: string, job: string, startedAt: string, finishedAt: string, stats = {}) => ({
      id,
      job,
      status: "succeeded",
      startedAt,
      finishedAt,
      stats: stats as Record<string, number>,
    });
    const recount = { "memberStats.rows": 555, "RefreshDerivedStats.written": 1 };
    const members = { "people.current": 539, "people.historical": 16 };
    const folded = foldRecounts([
      run("s5", "stats", "2026-09-24 03:40:12.714-05", "2026-09-24 03:40:14.692-05", recount),
      run("v5", "votes", "2026-09-24 03:39:43.708-05", "2026-09-24 03:40:12.713-05"),
      run("s4", "stats", "2026-09-23 23:24:59.015-05", "2026-09-23 23:25:01.543-05", recount),
      run("l2", "legislators", "2026-09-23 23:24:57.485-05", "2026-09-23 23:24:59.014-05", members),
      run("s3", "stats", "2026-09-23 20:48:45.743-05", "2026-09-23 20:48:47.223-05", recount),
      run("v2", "votes", "2026-09-23 20:47:56.504-05", "2026-09-23 20:48:28.243-05"),
      run("l1", "legislators", "2026-09-23 20:42:03.058-05", "2026-09-23 20:42:07.767-05", members),
    ]);
    expect(folded.map((entry) => [entry.id, entry.recount?.members, entry.recount?.former])).toEqual(
      [
        ["v5", 555, 16],
        ["s4", 555, 16],
        ["l2", undefined, undefined],
        ["v2", 555, 16],
        ["l1", undefined, undefined],
      ],
    );
    expect(
      describeIngestionRun({
        job: "votes",
        status: "succeeded",
        stats: { "rollCalls.parsed": 1573, "RecordRollCall.written": 0 },
        recount: { members: 555, former: 16 },
      }),
    ).toBe(
      "Read 1,573 roll calls (recorded votes) from the House and the Senate. None were new or changed. Then recounted how often 555 members, including 16 who left this Congress, voted with their party or missed a vote.",
    );
    expect(
      describeIngestionRun({
        job: "stats",
        status: "succeeded",
        stats: recount,
        recount: { members: 555, former: 16 },
      }),
    ).toBe(
      "Recounted how often 555 members, including 16 who left this Congress, voted with their party or missed a vote.",
    );
    // With no legislators run to say who left, the count stands alone.
    expect(describeIngestionRun({ job: "stats", status: "succeeded", stats: recount })).toBe(
      "Recounted how often 555 members voted with their party or missed a vote.",
    );
    // The recount that followed the 11:24 PM (CDT) legislators run stays its own row (it is not a
    // roll-call read's recount) and says what it followed.
    const afterMembers = folded.find((entry) => entry.id === "s4")!;
    expect(afterMembers.recount).toEqual({ members: 555, former: 16, afterMemberUpdate: true });
    expect(folded.find((entry) => entry.id === "v5")!.recount?.afterMemberUpdate).toBeUndefined();
    expect(describeIngestionRun({ ...afterMembers, status: "succeeded" })).toBe(
      "After the member update, recounted how often 555 members, including 16 who left this Congress, voted with their party or missed a vote.",
    );
  });

  test("a legislators run's term changes are counted by the members they belong to", async () => {
    const startedAt = "2026-09-24T04:24:57.485Z";
    await open.db.insert(ingestionRuns).values({
      id: "run-legislators-terms",
      job: "legislators",
      startedAt,
      finishedAt: "2026-09-24T04:24:59.014Z",
      status: "succeeded",
      stats: { "UpsertPerson.written": 0, "UpsertTerm.written": 3 },
      notes: [],
    });
    // Three term changes: two for one member (a term split by a party switch), one for another.
    await open.db.insert(eventLog).values(
      [
        ["T000001:house:2025-01-03", "T000001"],
        ["T000001:house:2025-06-01", "T000001"],
        ["T000002:house:2025-01-03", "T000002"],
      ].map(([term, personId], index) => ({
        id: `evt-term-${index}`,
        action: "UpsertTerm",
        actorKind: "job",
        actorId: "legislators",
        targetKind: "term",
        targetId: term!,
        at: startedAt,
        reason: "test",
        sourceIds: [],
        summary: { personId: personId!, chamber: "house", party: "D", created: false },
      })),
    );
    const entry = (await changelog(open.db)).find((row) => row.id === "run-legislators-terms");
    expect(entry?.sentence).toBe(
      "Updated the terms in office of 2 members of Congress from the public member list. No member was added, and no other details changed.",
    );
  });

  test("the changelog keeps every data update, however many key-vote steps follow it", async () => {
    // A key-vote reword logs four steps per card; 250 of them once pushed older data updates off a
    // capped log that promises every change.
    await open.db.insert(ingestionRuns).values({
      id: "run-portraits-old",
      job: "portraits",
      startedAt: "2026-01-02T03:00:00.000Z",
      finishedAt: "2026-01-02T03:01:00.000Z",
      status: "succeeded",
      stats: { "UpsertPerson.written": 1 },
      notes: [],
    });
    await open.db.insert(eventLog).values(
      Array.from({ length: 250 }, (_, index) => ({
        id: `evt-burst-${index}`,
        action: "VerifyKeyVote",
        actorKind: "job",
        actorId: "keyvotes",
        targetKind: "keyVote",
        targetId: `kv-burst-${index}`,
        at: new Date(Date.UTC(2026, 8, 24, 12, 0, index % 60)).toISOString(),
        reason: "test",
        sourceIds: [],
        summary: { status: "verified" },
      })),
    );
    const entries = await changelog(open.db);
    expect(entries.some((entry) => entry.id === "run-portraits-old")).toBe(true);
    expect(entries.filter((entry) => entry.id.startsWith("evt-burst-"))).toHaveLength(250);
    expect(await changelog(open.db, 5)).toHaveLength(5);
  });

  test("status keeps the last runs of each job, newest first", async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 8, 20, 12, minute)).toISOString();
    await open.db.insert(ingestionRuns).values(
      Array.from({ length: RUN_HISTORY + 3 }, (_, index) => ({
        id: `run-votes-${index}`,
        job: "votes",
        startedAt: at(index),
        finishedAt: at(index),
        status: index === 5 ? "failed" : "succeeded",
        stats: {},
        notes: [],
      })),
    );
    const report = await status(open.db);
    const votes = report.history.votes ?? [];
    expect(votes).toHaveLength(RUN_HISTORY);
    expect(toIso(votes[0]!.startedAt)).toBe(at(RUN_HISTORY + 2));
    expect(votes.map((run) => run.status)).toContain("failed");
    expect(report.runs.find((run) => run.job === "votes")?.status).toBe("succeeded");
  });

  test("stored roll calls and the latest votes run agree: a quorum call is set aside and counted apart", async () => {
    // The shape of the bundled snapshot: an earlier run stored house-119-2-1, a "Call of the House"
    // quorum call (everyone Present or Not Voting); the parser now skips it, so the latest run reads
    // one roll call fewer than the table holds.
    await open.db.insert(sources).values({
      id: "src-test-clerk",
      publisher: "Office of the Clerk, U.S. House of Representatives",
      url: "https://clerk.house.gov/Votes/2026001",
      retrievedAt: "2026-09-24T01:47:00.000Z",
      contentHash: "test",
    });
    await open.db.insert(people).values(
      ["T000001", "T000002"].map((id) => ({
        id,
        fullName: id,
        firstName: "Test",
        lastName: id,
        fecIds: [],
        links: [],
        sourceIds: [],
      })),
    );
    const call = (number: number, tally: { yea: number; nay: number; present: number }) => ({
      id: `house-119-2-${number}`,
      chamber: "house" as const,
      congress: 119,
      session: 2,
      number,
      date: "2026-01-06",
      question: number === 1 ? "Call of the House" : "On Passage",
      result: "Passed",
      ...tally,
      notVoting: 0,
      officialUrl: `https://clerk.house.gov/Votes/202600${number}`,
      sourceId: "src-test-clerk",
    });
    await open.db
      .insert(rollCalls)
      .values([
        call(1, { yea: 0, nay: 0, present: 2 }),
        call(2, { yea: 1, nay: 1, present: 0 }),
        call(3, { yea: 2, nay: 0, present: 0 }),
      ]);
    const position = (number: number, personId: string, value: "Yea" | "Nay" | "Present") => ({
      rollCallId: `house-119-2-${number}`,
      personId,
      position: value,
      party: "R",
      state: "TX",
    });
    await open.db
      .insert(votePositions)
      .values([
        position(1, "T000001", "Present"),
        position(1, "T000002", "Present"),
        position(2, "T000001", "Yea"),
        position(2, "T000002", "Nay"),
        position(3, "T000001", "Yea"),
        position(3, "T000002", "Yea"),
      ]);
    await open.db.insert(ingestionRuns).values({
      id: "run-votes-latest",
      job: "votes",
      startedAt: "2026-09-24T01:47:56.504Z",
      finishedAt: "2026-09-24T01:48:28.243Z",
      status: "succeeded",
      stats: { "rollCalls.parsed": 2, "rollCalls.skipped": 1 },
      notes: [],
    });

    const report = await status(open.db);
    const latest = report.runs.find((run) => run.job === "votes")!;
    // Home, Status "What we hold", Status "Roll calls read", and the changelog all say 2.
    expect(report.counts.rollCalls).toBe(2);
    expect(report.counts.rollCalls).toBe(latest.stats["rollCalls.parsed"]);
    expect(describeIngestionRun(latest)).toMatch(/^Read 2 roll calls /);
    expect(report.counts.votePositions).toBe(4);
    expect(report.counts.quorumCalls).toBe(1);

    // Home's figure draws one square per roll call: the same two, oldest first, the quorum call left out.
    const tally = await rollCallTally(open.db);
    expect(tally.chambers.house).toEqual({
      ids: ["house-119-2-2", "house-119-2-3"],
      first: "2026-01-06",
      last: "2026-01-06",
      latestSourceId: "src-test-clerk",
    });
    expect(tally.chambers.senate).toEqual({
      ids: [],
      first: null,
      last: null,
      latestSourceId: null,
    });
    expect(tally.chambers.house.ids.length + tally.chambers.senate.ids.length).toBe(
      report.counts.rollCalls,
    );
    expect(tally.latestSourceId).toBe("src-test-clerk");
  });

  test("money and key-vote runs read in plain words, with zero said in words", () => {
    expect(
      describeIngestionRun({
        job: "fec-aggregates",
        status: "succeeded",
        stats: { "fecAggregates.members": 545 },
      }),
    ).toBe(
      "Updated campaign money totals from the FEC for 545 members: how much came in donations of $200 or less, and how much from inside their state.",
    );
    expect(
      describeIngestionRun({
        job: "fec",
        status: "succeeded",
        stats: { "UpsertFinanceSummary.written": 12 },
      }),
    ).toBe(
      "Updated 2026 races, candidate filings, and campaign money totals from the FEC. 12 totals were new or changed.",
    );
    expect(
      describeIngestionRun({
        job: "keyvotes",
        status: "succeeded",
        stats: { "VerifyKeyVote.written": 20 },
      }),
    ).toBe("Re-checked 20 key votes against the official record.");
    expect(describeIngestionRun({ job: "keyvotes", status: "succeeded", stats: {} })).toBe(
      "Ran the key-vote checks; no key vote needed re-checking.",
    );
  });

  test("the portrait counts on the changelog name the same two numbers as Status", () => {
    const stats = { "portraits.stored": 327, "portraits.missing": 16, "portraits.undecodable": 1 };
    const sentence = describeIngestionRun({ job: "portraits", status: "succeeded", stats });
    expect(sentence).toBe(
      "Stored 327 official portraits. 17 members show initials: 16 have no official portrait, and 1 has one that could not be read.",
    );
    expect(
      describeIngestionRun({ job: "portraits", status: "succeeded", stats: { "portraits.missing": 16 } }),
    ).toBe("No new official portraits. 16 members without an official portrait show initials.");
  });

  test("the selection rule comes from data/key-votes.json", async () => {
    const selection = await keyVoteSelection();
    const file = JSON.parse(readFileSync(join(workspaceRoot(), "data", "key-votes.json"), "utf8"));
    expect(selection.criteria).toEqual(file.selectionRule.criteria);
    expect(selection.criteria.length).toBeGreaterThan(0);
  });
});

describe("data/election-dates.json", () => {
  test("covers 50 states and DC, each read from its vote.gov page", async () => {
    const file = await electionDates();
    expect(ElectionDatesFile.safeParse(file).success).toBe(true);
    expect(new Set(file.states.map((entry) => entry.state)).size).toBe(51);
    for (const entry of file.states) {
      expect(entry.source.url).toMatch(/^https:\/\/vote\.gov\/register\/[a-z-]+$/);
      expect(entry.source.publisher).toBe("U.S. Election Assistance Commission (vote.gov)");
      if (entry.registrationRequired)
        expect(entry.deadlines.mail ?? entry.deadlines.inPerson).not.toBeNull();
    }
  });

  test("deadlines keep official wording and are never guessed calendar dates", async () => {
    const file = await electionDates();
    for (const entry of file.states) {
      for (const value of Object.values(entry.deadlines)) {
        if (value === null) continue;
        expect(value).toMatch(/Election Day|early voting/);
        expect(value).not.toMatch(
          /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
        );
      }
    }
  });

  test("every entry's receipt resolves", async () => {
    const file = await electionDates();
    const first = file.states[0]!;
    expect(await electionSource(first.source.id)).toEqual(first.source);
    expect(await electionSource("src_0000000000000000")).toBeNull();
  });
});
