import { eq } from "drizzle-orm";
import * as z from "zod";
import { upsertFinanceSummary } from "../../actions/ingestion";
import * as m from "../../db/mappers";
import { financeCommittees, financeSummaries, terms } from "../../db/schema";
import type { IngestContext } from "../context";

/**
 * OpenFEC aggregates for sitting members: the share of individual contributions
 * that were $200 or less each (the FEC's size bucket counts contributions, not donors), and the share of
 * itemized individual contributions from inside the state.
 * Aggregates only; one API call per measure per member, spaced to stay inside the key's hourly limit.
 */

const CYCLE = 2026;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const API = "https://api.open.fec.gov/v1/schedules/schedule_a";

const bySize = z.object({ results: z.array(z.object({ size: z.number(), total: z.number() })) });
const byState = z.object({ results: z.array(z.object({ state: z.string().nullable(), total: z.number() })) });

export async function ingestFecAggregates(context: IngestContext): Promise<void> {
  const key = process.env.FEC_API_KEY;
  if (!key) {
    context.note("FEC_API_KEY is not set; small-dollar and in-state shares were not loaded.");
    return;
  }
  const today = context.now.toISOString().slice(0, 10);
  const serving = new Set(
    (await context.db.select({ personId: terms.personId, end: terms.end }).from(terms))
      .filter((term) => term.end >= today)
      .map((term) => term.personId),
  );
  const rows = await context.db
    .select({ summary: financeSummaries, candidateId: financeCommittees.candidateId })
    .from(financeSummaries)
    .innerJoin(financeCommittees, eq(financeCommittees.id, financeSummaries.financeCommitteeId))
    .where(eq(financeSummaries.cycle, CYCLE));

  for (const row of rows) {
    const summary = m.financeSummaryFromRow(row.summary);
    const candidateId = row.candidateId;
    if (!serving.has(summary.personId) || !candidateId) continue;
    const params = `candidate_id=${candidateId}&cycle=${CYCLE}&election_full=false&per_page=100&api_key=${encodeURIComponent(key)}`;
    const size = await context.fetchWithSource(`${API}/by_size/by_candidate/?${params}`, { maxAgeMs: WEEK });
    const state = await context.fetchWithSource(`${API}/by_state/by_candidate/?${params}`, { maxAgeMs: WEEK });
    const sizes = bySize.parse(JSON.parse(size.raw.body.toString("utf8"))).results;
    const states = byState.parse(JSON.parse(state.raw.body.toString("utf8"))).results;
    const sizeTotal = sizes.reduce((sum, bucket) => sum + bucket.total, 0);
    const stateTotal = states.reduce((sum, bucket) => sum + bucket.total, 0);
    const homeState = candidateId.slice(2, 4);
    const small = sizes.find((bucket) => bucket.size === 0)?.total ?? 0;
    const home = states.find((bucket) => bucket.state === homeState)?.total ?? 0;
    const result = await context.act(upsertFinanceSummary, {
      ...summary,
      smallDollarShare: sizeTotal > 0 ? Number((small / sizeTotal).toFixed(5)) : null,
      inStateShare: stateTotal > 0 ? Number((home / stateTotal).toFixed(5)) : null,
    });
    if (result.ok) context.count("fecAggregates.members");
  }
}
