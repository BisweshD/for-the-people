import { join } from "node:path";
import { revalidateSecret, SIGNATURE_HEADER, signBody } from "@for-the-people/core/signing";
import { openFileDb, openNeonDbMigrated, workspaceRoot } from "../db/client";
import { withIngestionRun, type IngestContext } from "../ingest/context";
import { ingestFec } from "../ingest/jobs/fec";
import { ingestFecAggregates } from "../ingest/jobs/fec-aggregates";
import { ingestKeyVotes } from "../ingest/jobs/keyvotes";
import { ingestLegislators } from "../ingest/jobs/legislators";
import { ingestPortraits } from "../ingest/jobs/portraits";
import { ingestStats } from "../ingest/jobs/stats";
import { ingestVotes } from "../ingest/jobs/votes";

/**
 * Usage: pnpm ingest [job...|all]. Writes Neon when DATABASE_URL is set (CI and production), otherwise the
 * local PGlite folder (.data/pglite). With REVALIDATE_URL and REVALIDATE_SECRET set, it then tells the web
 * app which cache tags changed, through the signed /api/revalidate endpoint.
 */

const JOBS: Record<string, (context: IngestContext) => Promise<void>> = {
  legislators: ingestLegislators,
  votes: ingestVotes,
  stats: ingestStats,
  keyvotes: ingestKeyVotes,
  portraits: ingestPortraits,
  fec: ingestFec,
  "fec-aggregates": ingestFecAggregates,
};
const ORDER = ["legislators", "votes", "stats", "keyvotes", "portraits", "fec", "fec-aggregates"];

/** Cache tags each job can change (apps/web/src/server/data.ts TAGS). */
const TAGS_BY_JOB: Record<string, string[]> = {
  legislators: ["members"],
  votes: ["key-votes", "members"],
  stats: ["members"],
  keyvotes: ["key-votes"],
  portraits: ["members"],
  fec: ["members", "money"],
  "fec-aggregates": ["money"],
};

try {
  process.loadEnvFile(join(workspaceRoot(), ".env"));
} catch {
  // No .env: jobs that need a key record that they were skipped.
}

const requested = process.argv.slice(2);
const jobs = requested.length === 0 || requested.includes("all") ? ORDER : requested;
const unknown = jobs.filter((job) => !JOBS[job]);
if (unknown.length > 0) throw new Error(`Unknown job(s): ${unknown.join(", ")}. Known: ${Object.keys(JOBS).join(", ")}`);

const target = process.env.DATABASE_URL
  ? `Neon (${new URL(process.env.DATABASE_URL).hostname})`
  : "the local PGlite folder (.data/pglite)";
// Say where writes go before any happen: a DATABASE_URL in .env sends every job to Neon.
console.log(`Writing to ${target}.`);
const open = process.env.DATABASE_URL
  ? await openNeonDbMigrated(process.env.DATABASE_URL)
  : await openFileDb();
try {
  for (const job of jobs) {
    const started = Date.now();
    const report = await withIngestionRun(open.db, job, JOBS[job]!);
    console.log(`${job}: ${((Date.now() - started) / 1000).toFixed(1)}s ${JSON.stringify(report.stats)}`);
    for (const note of report.notes.slice(0, 15)) console.log(`  note: ${note}`);
    if (report.notes.length > 15) console.log(`  ...and ${report.notes.length - 15} more notes`);
  }
} finally {
  await open.close();
}

const url = process.env.REVALIDATE_URL;
const secret = revalidateSecret(process.env.REVALIDATE_SECRET);
if (url && secret) {
  const tags = [...new Set(["status", ...jobs.flatMap((job) => TAGS_BY_JOB[job] ?? [])])];
  const body = JSON.stringify({ tags, at: new Date().toISOString() });
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", [SIGNATURE_HEADER]: await signBody(secret, body) },
    body,
  });
  console.log(`revalidate ${tags.join(", ")}: HTTP ${response.status}`);
}
