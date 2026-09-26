import type { FinanceCommittee, FinanceSummary, Source } from "@for-the-people/core";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";

/** Campaign-finance totals for one person: aggregates only, with the FEC file they came from. */

export interface MoneyRecord {
  summary: FinanceSummary;
  committee: FinanceCommittee;
  source: Source;
  /**
   * Whether the FEC lists a candidacy for the person in this cycle's election. An FEC filing, not ballot
   * status: the FEC does not record primary results or withdrawals.
   */
  hasFecCandidacy: boolean;
  /** The first Source of that candidacy (its FEC filing), or null when there is none. */
  candidacySourceId: string | null;
}

export async function moneyFor(db: Db, personId: string, cycle = 2026): Promise<MoneyRecord | null> {
  const rows = await db
    .select({ summary: t.financeSummaries, committee: t.financeCommittees, source: t.sources })
    .from(t.financeSummaries)
    .innerJoin(t.financeCommittees, eq(t.financeCommittees.id, t.financeSummaries.financeCommitteeId))
    .innerJoin(t.sources, eq(t.sources.id, t.financeSummaries.sourceId))
    .where(and(eq(t.financeSummaries.personId, personId), eq(t.financeSummaries.cycle, cycle)))
    .orderBy(desc(t.financeSummaries.receipts))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const candidacies = await db
    .select({ id: t.candidacies.id, sourceIds: t.candidacies.sourceIds })
    .from(t.candidacies)
    .innerJoin(t.races, eq(t.races.id, t.candidacies.raceId))
    .innerJoin(t.elections, eq(t.elections.id, t.races.electionId))
    .where(
      and(
        eq(t.candidacies.personId, personId),
        eq(sql`extract(year from ${t.elections.date})`, cycle),
      ),
    )
    .orderBy(asc(t.candidacies.id))
    .limit(1);
  const candidacy = candidacies[0];
  return {
    summary: m.financeSummaryFromRow(row.summary),
    committee: m.financeCommitteeFromRow(row.committee),
    source: m.sourceFromRow(row.source),
    hasFecCandidacy: candidacy !== undefined,
    candidacySourceId: candidacy?.sourceIds[0] ?? null,
  };
}
