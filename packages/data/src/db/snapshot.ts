import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PGlite } from "@electric-sql/pglite";
import { workspaceRoot } from "./client";

/**
 * The bundled data snapshot: one gzipped CSV per table, written with COPY in primary-key order so
 * diffs stay readable. A local setup restores it into PGlite without touching the network.
 * Runtime tables (rate limits, AI spend, the Ask cache) and public corrections are never included.
 */

export const SNAPSHOT_TABLES = [
  { name: "sources", orderBy: "id" },
  { name: "people", orderBy: "id" },
  { name: "offices", orderBy: "id" },
  { name: "districts", orderBy: "id" },
  { name: "terms", orderBy: "id" },
  { name: "elections", orderBy: "id" },
  { name: "races", orderBy: "id" },
  { name: "candidacies", orderBy: "id" },
  { name: "measures", orderBy: "id" },
  { name: "roll_calls", orderBy: "id" },
  { name: "vote_positions", orderBy: "roll_call_id, person_id" },
  { name: "issue_areas", orderBy: "id" },
  { name: "key_votes", orderBy: "id" },
  { name: "finance_committees", orderBy: "id" },
  { name: "finance_summaries", orderBy: "person_id, cycle, finance_committee_id" },
  { name: "member_stats", orderBy: "person_id" },
  { name: "ingestion_runs", orderBy: "id" },
  { name: "event_log", orderBy: "id" },
] as const;

export const snapshotDir = (): string => join(workspaceRoot(), "data", "snapshot");

export async function exportSnapshot(
  pglite: PGlite,
  dir = snapshotDir(),
): Promise<Record<string, number>> {
  await mkdir(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const { name, orderBy } of SNAPSHOT_TABLES) {
    const result = await pglite.query(
      `COPY (SELECT * FROM ${name} ORDER BY ${orderBy}) TO '/dev/blob' WITH (FORMAT csv, HEADER true)`,
    );
    const csv = Buffer.from(await result.blob!.arrayBuffer());
    await writeFile(join(dir, `${name}.csv.gz`), gzipSync(csv, { level: 9 }));
    const [{ count }] = (
      await pglite.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${name}`)
    ).rows as [{ count: number }];
    counts[name] = count;
  }
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify({ tables: counts }, null, 2)}\n`);
  return counts;
}

export async function importSnapshot(pglite: PGlite, dir = snapshotDir()): Promise<void> {
  for (const { name } of SNAPSHOT_TABLES) {
    const csv = gunzipSync(await readFile(join(dir, `${name}.csv.gz`)));
    // Name the columns from the header, so a snapshot written before a column was added still loads.
    const header = csv.subarray(0, csv.indexOf(0x0a)).toString("utf8").trim();
    const columns = header
      .split(",")
      .map((column) => `"${column.replace(/^"|"$/g, "")}"`)
      .join(", ");
    await pglite.query(`COPY ${name} (${columns}) FROM '/dev/blob' WITH (FORMAT csv, HEADER true)`, [], {
      blob: new Blob([csv]),
    });
  }
}
