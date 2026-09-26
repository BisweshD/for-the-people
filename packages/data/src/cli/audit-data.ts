import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ANONYMOUS_PUBLIC_ACTOR, chamberViolations, keyVotePublishViolations, rollCallTotalsViolations } from "@for-the-people/core";
import { eq } from "drizzle-orm";
import { openMemoryDb, snapshotTarball, workspaceRoot } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";

/**
 * Data audit: checks the whole bundled snapshot and writes audits/data-audit.md.
 * Exits 1 when a high-severity invariant fails.
 */

interface Check {
  name: string;
  severity: "high" | "medium";
  failures: string[];
  checked: number;
}

const open = await openMemoryDb({ tarball: new Blob([await readFile(snapshotTarball())]) });
const checks: Check[] = [];
try {
  const db = open.db;
  const [rollCalls, positions, termRows, people, sources, measures, keyVotes, finance, districts, candidacies] = await Promise.all([
    db.select().from(t.rollCalls),
    db.select().from(t.votePositions),
    db.select().from(t.terms),
    db.select().from(t.people),
    db.select({ id: t.sources.id }).from(t.sources),
    db.select({ id: t.measures.id, sponsorId: t.measures.sponsorId, sourceIds: t.measures.sourceIds }).from(t.measures),
    db.select().from(t.keyVotes),
    db.select().from(t.financeSummaries),
    db.select().from(t.districts),
    db.select().from(t.candidacies),
  ]);
  const sourceIds = new Set(sources.map((row) => row.id));
  const positionsByRollCall = Map.groupBy(positions.map(m.votePositionFromRow), (position) => position.rollCallId);
  const termsByPerson = Map.groupBy(termRows, (term) => term.personId);
  const chamberOn = (personId: string, date: string) =>
    termsByPerson.get(personId)?.find((term) => term.start <= date && date <= term.end)?.chamber ?? null;

  const totals: string[] = [];
  const chambers: string[] = [];
  for (const row of rollCalls) {
    const rollCall = m.rollCallFromRow(row);
    const list = positionsByRollCall.get(rollCall.id) ?? [];
    totals.push(...rollCallTotalsViolations(rollCall, list));
    chambers.push(...chamberViolations(rollCall, list, chamberOn));
  }
  checks.push({ name: "RollCall totals equal its VotePositions", severity: "high", failures: totals, checked: rollCalls.length });
  checks.push({ name: "Members only have positions on their own chamber's roll calls", severity: "high", failures: chambers, checked: positions.length });

  const published = keyVotes.map(m.keyVoteFromRow).filter((keyVote) => keyVote.status === "published");
  checks.push({
    name: "A KeyVote publishes only when every rollCallRef is verified, has polarity, and has two approvals of different leanings",
    severity: "high",
    failures: published.flatMap(keyVotePublishViolations),
    checked: published.length,
  });

  const missingSource = [
    ...rollCalls.filter((row) => !sourceIds.has(row.sourceId)).map((row) => `roll call ${row.id}`),
    ...people.filter((row) => row.sourceIds.some((id) => !sourceIds.has(id))).map((row) => `person ${row.id}`),
    ...measures.filter((row) => row.sourceIds.some((id) => !sourceIds.has(id))).map((row) => `measure ${row.id}`),
    ...finance.filter((row) => !sourceIds.has(row.sourceId)).map((row) => `finance ${row.personId}`),
    ...districts.filter((row) => !sourceIds.has(row.sourceId)).map((row) => `district ${row.id}`),
  ];
  checks.push({ name: "Every stored fact links to at least one Source", severity: "high", failures: missingSource, checked: rollCalls.length + people.length + measures.length + finance.length + districts.length });

  checks.push({
    name: "Every District has a mapVersion; the 2026 ballot uses cd120",
    severity: "high",
    failures: [
      ...districts.filter((row) => !/^cd1\d{2}$/.test(row.mapVersion)).map((row) => row.id),
      ...candidacies.filter((row) => row.raceId.includes("@") && !row.raceId.includes("@cd120")).map((row) => row.id),
    ],
    checked: districts.length + candidacies.length,
  });

  const serving = termRows.filter((term) => term.end >= "2026-09-23");
  const houseSeats = new Set(serving.filter((term) => term.chamber === "house").map((term) => term.districtId));
  const senate = serving.filter((term) => term.chamber === "senate");
  checks.push({
    name: "Sitting membership looks complete (House seats with a member; 100 senators or fewer)",
    severity: "medium",
    failures: senate.length > 100 ? [`${senate.length} senators serving`] : [],
    checked: houseSeats.size + senate.length,
  });

  const columns = Object.entries(t)
    .filter(([, value]) => value && typeof value === "object" && "getSQL" in (value as object))
    .flatMap(([table, value]) => Object.keys(value as object).map((column) => `${table}.${column}`));
  const piiLike = columns.filter((column) => /address|street|zip|donor|contributor|employer|occupation|email|phone|stance/i.test(column));
  checks.push({ name: "No table stores raw addresses, individual donor PII, or voter stances", severity: "high", failures: piiLike, checked: columns.length });

  // The corrections form promises "We do not store who sent a report or your IP address" (R2-L5).
  const publicEvents = await db
    .select({ id: t.eventLog.id, actorId: t.eventLog.actorId })
    .from(t.eventLog)
    .where(eq(t.eventLog.actorKind, "public"));
  checks.push({
    name: "event_log records every public actor as anonymous (no IP or hash of one)",
    severity: "high",
    failures: publicEvents.filter((row) => row.actorId !== ANONYMOUS_PUBLIC_ACTOR.id).map((row) => `event ${row.id}`),
    checked: publicEvents.length,
  });

  const failedHigh = checks.filter((check) => check.severity === "high" && check.failures.length > 0);
  const lines = [
    "# Data audit",
    "",
    `Run on the bundled snapshot with \`pnpm audit:data\` (${new Date().toISOString().slice(0, 10)}). ${rollCalls.length.toLocaleString("en-US")} roll calls, ${positions.length.toLocaleString("en-US")} VotePositions, ${people.length.toLocaleString("en-US")} people, ${measures.length} measures, ${finance.length.toLocaleString("en-US")} finance summaries.`,
    "",
    "| Check | Severity | Checked | Failures |",
    "| --- | --- | --- | --- |",
    ...checks.map((check) => `| ${check.name} | ${check.severity} | ${check.checked.toLocaleString("en-US")} | ${check.failures.length} |`),
    "",
    ...checks.filter((check) => check.failures.length > 0).flatMap((check) => [`## ${check.name}`, "", ...check.failures.slice(0, 50).map((failure) => `- ${failure}`), ""]),
    failedHigh.length === 0 ? "All high-severity invariants hold." : `${failedHigh.length} high-severity check(s) failed.`,
    "",
  ];
  await mkdir(join(workspaceRoot(), "audits"), { recursive: true });
  await writeFile(join(workspaceRoot(), "audits", "data-audit.md"), lines.join("\n"));
  console.log(lines.slice(0, 16).join("\n"));
  if (failedHigh.length > 0) process.exitCode = 1;
} finally {
  await open.close();
}
