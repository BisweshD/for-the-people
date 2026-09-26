import { readFile } from "node:fs/promises";
import { isDivisive } from "@for-the-people/core";
import { and, eq, gte } from "drizzle-orm";
import { openMemoryDb, snapshotTarball } from "../db/client";
import { measures, rollCalls } from "../db/schema";

/**
 * Lists divisive final-passage, adoption, concurrence, override, and cloture roll calls since a date, so
 * curators can check the deck for major measures it is missing. Usage: pnpm scan:votes [YYYY-MM-DD]
 */
const since = process.argv[2] ?? "2026-07-01";
const DECIDING = /passage|agreeing to the (resolution|concurrent resolution|joint resolution)|concur|objections of the president|cloture|joint resolution|the bill/i;

const open = await openMemoryDb({ tarball: new Blob([await readFile(snapshotTarball())]) });
try {
  const rows = await open.db
    .select({ rollCall: rollCalls, title: measures.titleDisplay })
    .from(rollCalls)
    .leftJoin(measures, eq(measures.id, rollCalls.measureId))
    .where(and(gte(rollCalls.date, since)));
  const candidates = rows
    .filter(({ rollCall }) => rollCall.measureId && DECIDING.test(rollCall.question) && !/amendment|motion to (table|recommit|proceed)|previous question/i.test(rollCall.question))
    .filter(({ rollCall }) => isDivisive({ yea: rollCall.yea, nay: rollCall.nay, present: rollCall.present, notVoting: rollCall.notVoting }))
    .sort((a, b) => a.rollCall.date.localeCompare(b.rollCall.date));
  for (const { rollCall, title } of candidates) {
    console.log(`${rollCall.date} ${rollCall.id.padEnd(18)} ${String(rollCall.yea).padStart(3)}-${String(rollCall.nay).padEnd(3)} ${rollCall.measureId?.padEnd(16)} ${rollCall.question.slice(0, 40).padEnd(40)} ${title?.slice(0, 80)}`);
  }
  console.log(`${candidates.length} divisive deciding votes since ${since}`);
} finally {
  await open.close();
}
