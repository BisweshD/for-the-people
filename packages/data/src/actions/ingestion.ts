import {
  AttachSourceInput,
  chamberViolations,
  MergePersonIdentityInput,
  RecordRollCallInput,
  RemoveRaceInput,
  RemoveRollCallInput,
  rollCallTotalsViolations,
  UpsertCandidacyInput,
  UpsertDistrictMapInput,
  UpsertElectionInput,
  UpsertFinanceCommitteeInput,
  UpsertFinanceSummaryInput,
  UpsertMeasureInput,
  UpsertPersonInput,
  UpsertRaceInput,
  UpsertTermInput,
  type Office,
  type Person,
} from "@for-the-people/core";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";
import { type ActionSpec, canonical, chunk, reject } from "./runner";

/** Ingestion actions: the only way official data enters the database. */

async function upsertOffice(tx: Db, office: Office): Promise<boolean> {
  const [existing] = await tx.select().from(t.offices).where(eq(t.offices.id, office.id));
  if (existing && canonical(m.officeFromRow(existing)) === canonical(office)) return false;
  const row = m.officeToRow(office);
  await tx.insert(t.offices).values(row).onConflictDoUpdate({ target: t.offices.id, set: row });
  return true;
}

export const attachSource: ActionSpec<typeof AttachSourceInput, string> = {
  name: "AttachSource",
  input: AttachSourceInput,
  async run(tx, source) {
    const [existing] = await tx.select().from(t.sources).where(eq(t.sources.id, source.id));
    if (existing && existing.retrievedAt >= source.retrievedAt)
      return { kind: "unchanged", result: source.id };
    const row = m.sourceToRow(source);
    await tx
      .insert(t.sources)
      .values(row)
      .onConflictDoUpdate({ target: t.sources.id, set: { retrievedAt: row.retrievedAt } });
    return {
      kind: "written",
      result: source.id,
      target: { kind: "source", id: source.id },
      sourceIds: [source.id],
      summary: { url: source.url, refreshed: Boolean(existing) },
    };
  },
};

/**
 * Portraits come from a separate job, so a person upsert without a portrait keeps the stored one, and
 * keeps citing the portrait's Source.
 */
export const upsertPerson: ActionSpec<typeof UpsertPersonInput, Person> = {
  name: "UpsertPerson",
  input: UpsertPersonInput,
  async run(tx, person) {
    const [existing] = await tx.select().from(t.people).where(eq(t.people.id, person.id));
    const kept = person.portrait ? null : (existing?.portrait ?? null);
    const next: Person = {
      ...person,
      portrait: person.portrait ?? kept,
      sourceIds: kept ? [...new Set([...person.sourceIds, kept.sourceId])] : person.sourceIds,
    };
    if (existing && canonical(m.personFromRow(existing)) === canonical(next))
      return { kind: "unchanged", result: next };
    const row = m.personToRow(next);
    await tx.insert(t.people).values(row).onConflictDoUpdate({ target: t.people.id, set: row });
    return {
      kind: "written",
      result: next,
      target: { kind: "person", id: person.id },
      sourceIds: person.sourceIds,
      summary: { created: !existing, portrait: Boolean(next.portrait) },
    };
  },
};

/** Moves everything that points at `from` (an FEC-only identity) onto `into` (the bioguide identity). */
export const mergePersonIdentity: ActionSpec<typeof MergePersonIdentityInput, string> = {
  name: "MergePersonIdentity",
  input: MergePersonIdentityInput,
  async run(tx, { from, into, evidence, sourceIds }) {
    if (from === into)
      reject({ code: "invariant", message: "Cannot merge a person into themselves." });
    const [target] = await tx
      .select({ id: t.people.id })
      .from(t.people)
      .where(eq(t.people.id, into));
    if (!target) reject({ code: "not_found", message: `No person ${into} to merge into.` });
    const [source] = await tx
      .select({ id: t.people.id })
      .from(t.people)
      .where(eq(t.people.id, from));
    if (!source) return { kind: "unchanged", result: into };
    const moved = await tx
      .update(t.candidacies)
      .set({ personId: into })
      .where(eq(t.candidacies.personId, from))
      .returning({ id: t.candidacies.id });
    await tx
      .update(t.financeSummaries)
      .set({ personId: into })
      .where(eq(t.financeSummaries.personId, from));
    await tx.update(t.measures).set({ sponsorId: into }).where(eq(t.measures.sponsorId, from));
    await tx.delete(t.people).where(eq(t.people.id, from));
    return {
      kind: "written",
      result: into,
      target: { kind: "person", id: into },
      sourceIds,
      summary: { from, into, evidence, candidaciesMoved: moved.length },
    };
  },
};

export const upsertTerm: ActionSpec<typeof UpsertTermInput, string> = {
  name: "UpsertTerm",
  input: UpsertTermInput,
  async run(tx, { term, office }) {
    if (term.officeId !== office.id)
      reject({
        code: "invariant",
        message: `Term ${term.id} points at ${term.officeId}, not ${office.id}.`,
      });
    if (term.chamber !== office.chamber)
      reject({ code: "invariant", message: `Term ${term.id} chamber does not match its office.` });
    if (term.end < term.start)
      reject({ code: "invariant", message: `Term ${term.id} ends before it starts.` });
    const officeChanged = await upsertOffice(tx, office);
    const [existing] = await tx.select().from(t.terms).where(eq(t.terms.id, term.id));
    if (existing && canonical(m.termFromRow(existing)) === canonical(term) && !officeChanged) {
      return { kind: "unchanged", result: term.id };
    }
    const row = m.termToRow(term);
    await tx.insert(t.terms).values(row).onConflictDoUpdate({ target: t.terms.id, set: row });
    return {
      kind: "written",
      result: term.id,
      target: { kind: "term", id: term.id },
      sourceIds: term.sourceIds,
      summary: {
        personId: term.personId,
        chamber: term.chamber,
        party: term.party,
        created: !existing,
      },
    };
  },
};

export const upsertDistrictMap: ActionSpec<typeof UpsertDistrictMapInput, number> = {
  name: "UpsertDistrictMap",
  input: UpsertDistrictMapInput,
  async run(tx, { mapVersion, districts }) {
    if (districts.some((district) => district.mapVersion !== mapVersion)) {
      reject({
        code: "invariant",
        message: `Every district must carry map version ${mapVersion}.`,
      });
    }
    const existing = await tx
      .select()
      .from(t.districts)
      .where(
        inArray(
          t.districts.id,
          districts.map((district) => district.id),
        ),
      );
    const stored = new Map(existing.map((row) => [row.id, canonical(m.districtFromRow(row))]));
    const changed = districts.filter((district) => stored.get(district.id) !== canonical(district));
    if (changed.length === 0) return { kind: "unchanged", result: 0 };
    for (const district of changed) {
      const row = m.districtToRow(district);
      await tx.insert(t.districts).values(row).onConflictDoUpdate({ target: t.districts.id, set: row });
    }
    return {
      kind: "written",
      result: changed.length,
      target: { kind: "districtMap", id: mapVersion },
      sourceIds: [...new Set(changed.map((district) => district.sourceId))],
      summary: { mapVersion, districtsChanged: changed.length },
    };
  },
};

export const upsertElection: ActionSpec<typeof UpsertElectionInput, string> = {
  name: "UpsertElection",
  input: UpsertElectionInput,
  async run(tx, election) {
    const [existing] = await tx.select().from(t.elections).where(eq(t.elections.id, election.id));
    if (existing && canonical(m.electionFromRow(existing)) === canonical(election))
      return { kind: "unchanged", result: election.id };
    const row = m.electionToRow(election);
    await tx
      .insert(t.elections)
      .values(row)
      .onConflictDoUpdate({ target: t.elections.id, set: row });
    return {
      kind: "written",
      result: election.id,
      target: { kind: "election", id: election.id },
      sourceIds: election.sourceIds,
      summary: { date: election.date, type: election.type },
    };
  },
};

export const upsertRace: ActionSpec<typeof UpsertRaceInput, string> = {
  name: "UpsertRace",
  input: UpsertRaceInput,
  async run(tx, { race, office }) {
    if (race.officeId !== office.id)
      reject({
        code: "invariant",
        message: `Race ${race.id} points at ${race.officeId}, not ${office.id}.`,
      });
    if (race.chamber === "house" && !race.districtId)
      reject({ code: "invariant", message: `House race ${race.id} needs a district.` });
    const officeChanged = await upsertOffice(tx, office);
    const [existing] = await tx.select().from(t.races).where(eq(t.races.id, race.id));
    if (existing && canonical(m.raceFromRow(existing)) === canonical(race) && !officeChanged)
      return { kind: "unchanged", result: race.id };
    const row = m.raceToRow(race);
    await tx.insert(t.races).values(row).onConflictDoUpdate({ target: t.races.id, set: row });
    return {
      kind: "written",
      result: race.id,
      target: { kind: "race", id: race.id },
      sourceIds: race.sourceIds,
      summary: { chamber: race.chamber, state: race.state },
    };
  },
};

export const upsertCandidacy: ActionSpec<typeof UpsertCandidacyInput, string> = {
  name: "UpsertCandidacy",
  input: UpsertCandidacyInput,
  async run(tx, candidacy) {
    const [existing] = await tx
      .select()
      .from(t.candidacies)
      .where(eq(t.candidacies.id, candidacy.id));
    if (existing && canonical(m.candidacyFromRow(existing)) === canonical(candidacy))
      return { kind: "unchanged", result: candidacy.id };
    const row = m.candidacyToRow(candidacy);
    await tx
      .insert(t.candidacies)
      .values(row)
      .onConflictDoUpdate({ target: t.candidacies.id, set: row });
    return {
      kind: "written",
      result: candidacy.id,
      target: { kind: "candidacy", id: candidacy.id },
      sourceIds: candidacy.sourceIds,
      summary: { personId: candidacy.personId, raceId: candidacy.raceId, status: candidacy.status },
    };
  },
};

/**
 * Takes a race off the ballot with its candidacies, for a seat that is not up this year (for example a
 * four-year term). Nothing else points at a race; ballot plans live on voters' devices.
 */
export const removeRace: ActionSpec<typeof RemoveRaceInput, string> = {
  name: "RemoveRace",
  input: RemoveRaceInput,
  async run(tx, { raceId, why, sourceIds }) {
    const [existing] = await tx.select().from(t.races).where(eq(t.races.id, raceId));
    if (!existing) return { kind: "unchanged", result: raceId };
    const removed = await tx
      .delete(t.candidacies)
      .where(eq(t.candidacies.raceId, raceId))
      .returning({ id: t.candidacies.id });
    await tx.delete(t.races).where(eq(t.races.id, raceId));
    return {
      kind: "written",
      result: raceId,
      target: { kind: "race", id: raceId },
      sourceIds,
      summary: { why, candidaciesRemoved: removed.length, state: existing.state },
    };
  },
};

export const upsertMeasure: ActionSpec<typeof UpsertMeasureInput, string> = {
  name: "UpsertMeasure",
  input: UpsertMeasureInput,
  async run(tx, measure) {
    const [existing] = await tx.select().from(t.measures).where(eq(t.measures.id, measure.id));
    // A reviewed plain-language summary is editorial work; ingestion never overwrites it.
    const next = {
      ...measure,
      plainSummary: measure.plainSummary ?? existing?.plainSummary ?? null,
    };
    if (existing && canonical(m.measureFromRow(existing)) === canonical(next))
      return { kind: "unchanged", result: measure.id };
    const row = m.measureToRow(next);
    await tx.insert(t.measures).values(row).onConflictDoUpdate({ target: t.measures.id, set: row });
    return {
      kind: "written",
      result: measure.id,
      target: { kind: "measure", id: measure.id },
      sourceIds: measure.sourceIds,
      summary: {
        latestActionDate: measure.status.latestActionDate,
        hasCrsSummary: Boolean(measure.crsSummary),
      },
    };
  },
};

/** Idempotent: re-recording identical content is a no-op. Rejects totals that disagree with positions. */
export const recordRollCall: ActionSpec<typeof RecordRollCallInput, string> = {
  name: "RecordRollCall",
  input: RecordRollCallInput,
  async run(tx, { rollCall, positions }) {
    const totals = rollCallTotalsViolations(rollCall, positions);
    if (totals.length > 0) reject({ code: "invariant", message: totals.join("; ") });

    const personIds = positions.map((position) => position.personId);
    const terms = await tx
      .select({
        personId: t.terms.personId,
        chamber: t.terms.chamber,
        start: t.terms.start,
        end: t.terms.end,
      })
      .from(t.terms)
      .where(inArray(t.terms.personId, personIds));
    const chamberOn = (personId: string, date: string) =>
      terms.find((term) => term.personId === personId && term.start <= date && date <= term.end)
        ?.chamber ?? null;
    const chambers = chamberViolations(rollCall, positions, chamberOn);
    if (chambers.length > 0)
      reject({ code: "invariant", message: chambers.slice(0, 5).join("; ") });

    const [existing] = await tx.select().from(t.rollCalls).where(eq(t.rollCalls.id, rollCall.id));
    if (existing && canonical(m.rollCallFromRow(existing)) === canonical(rollCall))
      return { kind: "unchanged", result: rollCall.id };

    const row = m.rollCallToRow(rollCall);
    await tx
      .insert(t.rollCalls)
      .values(row)
      .onConflictDoUpdate({ target: t.rollCalls.id, set: row });
    await tx.delete(t.votePositions).where(eq(t.votePositions.rollCallId, rollCall.id));
    for (const rows of chunk(positions.map(m.votePositionToRow), 2000))
      await tx.insert(t.votePositions).values(rows);
    return {
      kind: "written",
      result: rollCall.id,
      target: { kind: "rollCall", id: rollCall.id },
      sourceIds: [rollCall.sourceId],
      summary: {
        positions: positions.length,
        yea: rollCall.totals.yea,
        nay: rollCall.totals.nay,
        replaced: Boolean(existing),
      },
    };
  },
};

/**
 * Deletes a stored roll call and its positions when the official record no longer yields a vote for it
 * (an earlier parser stored a quorum call, which only records who was present). Refused while any key
 * vote maps to it, so a published answer can never lose its roll call this way.
 */
export const removeRollCall: ActionSpec<typeof RemoveRollCallInput, string> = {
  name: "RemoveRollCall",
  input: RemoveRollCallInput,
  async run(tx, { rollCallId, why, sourceIds }) {
    const [existing] = await tx.select().from(t.rollCalls).where(eq(t.rollCalls.id, rollCallId));
    if (!existing) return { kind: "unchanged", result: rollCallId };
    const mapped = (await tx.select({ id: t.keyVotes.id, refs: t.keyVotes.rollCallRefs }).from(t.keyVotes))
      .filter((keyVote) => keyVote.refs.some((ref) => ref.rollCallId === rollCallId))
      .map((keyVote) => keyVote.id);
    if (mapped.length > 0)
      reject({
        code: "invariant",
        message: `${rollCallId} is mapped by key votes ${mapped.join(", ")}; retire or remap them first.`,
      });
    const removed = await tx
      .delete(t.votePositions)
      .where(eq(t.votePositions.rollCallId, rollCallId))
      .returning({ personId: t.votePositions.personId });
    await tx.delete(t.rollCalls).where(eq(t.rollCalls.id, rollCallId));
    return {
      kind: "written",
      result: rollCallId,
      target: { kind: "rollCall", id: rollCallId },
      sourceIds,
      summary: { why, positionsRemoved: removed.length, chamber: existing.chamber },
    };
  },
};

export const upsertFinanceCommittee: ActionSpec<typeof UpsertFinanceCommitteeInput, string> = {
  name: "UpsertFinanceCommittee",
  input: UpsertFinanceCommitteeInput,
  async run(tx, committee) {
    const [existing] = await tx
      .select()
      .from(t.financeCommittees)
      .where(eq(t.financeCommittees.id, committee.id));
    if (existing && canonical(m.financeCommitteeFromRow(existing)) === canonical(committee))
      return { kind: "unchanged", result: committee.id };
    const row = m.financeCommitteeToRow(committee);
    await tx
      .insert(t.financeCommittees)
      .values(row)
      .onConflictDoUpdate({ target: t.financeCommittees.id, set: row });
    return {
      kind: "written",
      result: committee.id,
      target: { kind: "financeCommittee", id: committee.id },
      sourceIds: [committee.sourceId],
      summary: { candidateId: committee.candidateId },
    };
  },
};

/** The schema is strict: any extra field (a donor name, an address) fails validation before this runs. */
export const upsertFinanceSummary: ActionSpec<typeof UpsertFinanceSummaryInput, string> = {
  name: "UpsertFinanceSummary",
  input: UpsertFinanceSummaryInput,
  async run(tx, summary) {
    const key = `${summary.personId}|${summary.cycle}|${summary.financeCommitteeId}`;
    const [existing] = await tx
      .select()
      .from(t.financeSummaries)
      .where(
        and(
          eq(t.financeSummaries.personId, summary.personId),
          eq(t.financeSummaries.cycle, summary.cycle),
          eq(t.financeSummaries.financeCommitteeId, summary.financeCommitteeId),
        ),
      );
    if (existing && canonical(m.financeSummaryFromRow(existing)) === canonical(summary))
      return { kind: "unchanged", result: key };
    const row = m.financeSummaryToRow(summary);
    await tx
      .insert(t.financeSummaries)
      .values(row)
      .onConflictDoUpdate({
        target: [
          t.financeSummaries.personId,
          t.financeSummaries.cycle,
          t.financeSummaries.financeCommitteeId,
        ],
        set: row,
      });
    return {
      kind: "written",
      result: key,
      target: { kind: "financeSummary", id: key },
      sourceIds: [summary.sourceId],
      summary: { receipts: summary.receipts, asOf: summary.asOf },
    };
  },
};
