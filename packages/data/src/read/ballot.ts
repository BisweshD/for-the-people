import type {
  Candidacy,
  DistrictId,
  Election,
  FinanceSummary,
  Office,
  Person,
  Race,
  Source,
  StateCode,
} from "@for-the-people/core";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";
import { mergeRepeatFilings } from "./candidate-order";
import { applyStateList, senateLists, type BallotStateList } from "./senate-lists";

export { compareCandidates, mergeRepeatFilings } from "./candidate-order";

/**
 * Ballot reads: the 2026 races for a state and its ballot districts, every candidate who filed with the
 * FEC for them, each candidate's latest campaign-finance totals (aggregates only), and, for Senate
 * races, the state's official candidate list where one has been read (data/candidates-2026-senate.json).
 */

export const BALLOT_ELECTION_DAY = "2026-11-03";
export const FINANCE_CYCLE = 2026;

export interface BallotCandidate {
  candidacy: Candidacy;
  person: Pick<Person, "id" | "names"> & {
    portrait: { asset: string; sourceId: string } | null;
    /** Set for anyone who has served in Congress (the congress-legislators crosswalk). */
    bioguide: string | null;
  };
  /** Totals from the candidate's principal campaign committee for this race; null when none is on file. */
  finance: FinanceSummary | null;
}

export interface BallotRace {
  race: Race;
  election: Election;
  office: Office;
  /** Every FEC filing for the seat, alphabetical by last name (compareCandidates). */
  candidates: BallotCandidate[];
  /** The state's official list for a Senate seat, when the file has an entry for it; null otherwise. */
  stateList: BallotStateList | null;
}

export interface Ballot {
  races: BallotRace[];
  /** Every Source the races, candidacies, and finance totals cite. */
  sources: Source[];
}

function pickFinance(
  candidacy: Candidacy,
  summaries: readonly FinanceSummary[],
  committeeCandidate: ReadonlyMap<string, string | null>,
): FinanceSummary | null {
  const mine = summaries.filter((summary) => summary.personId === candidacy.personId);
  const forThisFiling = mine.find(
    (summary) => committeeCandidate.get(summary.financeCommitteeId) === candidacy.fecCandidateId,
  );
  if (forThisFiling) return forThisFiling;
  return (
    mine.toSorted((a, b) => b.asOf.localeCompare(a.asOf) || b.receipts - a.receipts)[0] ?? null
  );
}

/** The 2026 races on one ballot: U.S. Senate races for the state and the U.S. House race for each ballot district. */
export async function ballot(
  db: Db,
  { state, districtIds }: { state: StateCode; districtIds: readonly DistrictId[] },
): Promise<Ballot> {
  const ballotDistricts = districtIds.filter((id) => id.endsWith("@cd120"));
  const raceRows = await db
    .select({ race: t.races, election: t.elections, office: t.offices })
    .from(t.races)
    .innerJoin(t.elections, eq(t.elections.id, t.races.electionId))
    .innerJoin(t.offices, eq(t.offices.id, t.races.officeId))
    .where(
      and(
        eq(t.elections.date, BALLOT_ELECTION_DAY),
        eq(t.races.state, state),
        or(
          and(eq(t.races.chamber, "senate"), isNull(t.races.districtId)),
          ballotDistricts.length > 0
            ? inArray(t.races.districtId, [...ballotDistricts])
            : undefined,
        ),
      ),
    );
  if (raceRows.length === 0) return { races: [], sources: [] };

  const raceIds = raceRows.map(({ race }) => race.id);
  const candidacyRows = await db
    .select({
      candidacy: t.candidacies,
      person: {
        id: t.people.id,
        full: t.people.fullName,
        first: t.people.firstName,
        last: t.people.lastName,
        nickname: t.people.nickname,
        suffix: t.people.suffix,
        portrait: t.people.portrait,
        bioguide: t.people.bioguide,
      },
    })
    .from(t.candidacies)
    .innerJoin(t.people, eq(t.people.id, t.candidacies.personId))
    .where(inArray(t.candidacies.raceId, raceIds));

  const personIds = [...new Set(candidacyRows.map(({ candidacy }) => candidacy.personId))];
  const summaryRows =
    personIds.length > 0
      ? await db
          .select({ summary: t.financeSummaries, candidateId: t.financeCommittees.candidateId })
          .from(t.financeSummaries)
          .innerJoin(
            t.financeCommittees,
            eq(t.financeCommittees.id, t.financeSummaries.financeCommitteeId),
          )
          .where(
            and(
              inArray(t.financeSummaries.personId, personIds),
              eq(t.financeSummaries.cycle, FINANCE_CYCLE),
            ),
          )
      : [];
  const summaries = summaryRows.map(({ summary }) => m.financeSummaryFromRow(summary));
  const committeeCandidate = new Map(
    summaryRows.map(({ summary, candidateId }) => [summary.financeCommitteeId, candidateId]),
  );

  const byRace = new Map<string, BallotCandidate[]>();
  for (const { candidacy: row, person } of candidacyRows) {
    const candidacy = m.candidacyFromRow(row);
    const list = byRace.get(candidacy.raceId) ?? [];
    list.push({
      candidacy,
      person: {
        id: person.id,
        names: {
          full: person.full,
          first: person.first,
          last: person.last,
          nickname: person.nickname,
          suffix: person.suffix,
        },
        portrait: person.portrait
          ? { asset: person.portrait.asset, sourceId: person.portrait.sourceId }
          : null,
        bioguide: person.bioguide,
      },
      finance: pickFinance(candidacy, summaries, committeeCandidate),
    });
    byRace.set(candidacy.raceId, list);
  }

  const lists = await senateLists();
  const races: BallotRace[] = raceRows
    .map(({ race, election, office }) => {
      const candidates = mergeRepeatFilings(byRace.get(race.id) ?? []);
      const listed =
        race.chamber === "senate"
          ? lists.races.find(
              (entry) => entry.state === office.state && entry.seatClass === office.seatClass,
            )
          : undefined;
      return {
        race: m.raceFromRow(race),
        election: m.electionFromRow(election),
        office: m.officeFromRow(office),
        candidates,
        stateList: listed ? applyStateList(listed, candidates) : null,
      };
    })
    .toSorted(
      (a, b) =>
        (a.race.chamber === "senate" ? 0 : 1) - (b.race.chamber === "senate" ? 0 : 1) ||
        (a.race.districtId ?? "").localeCompare(b.race.districtId ?? "") ||
        a.race.id.localeCompare(b.race.id),
    );

  const sourceIds = new Set<string>();
  for (const { race, election, candidates } of races) {
    race.sourceIds.forEach((id) => sourceIds.add(id));
    election.sourceIds.forEach((id) => sourceIds.add(id));
    for (const { candidacy, finance, person } of candidates) {
      candidacy.sourceIds.forEach((id) => sourceIds.add(id));
      if (finance) sourceIds.add(finance.sourceId);
      if (person.portrait) sourceIds.add(person.portrait.sourceId);
    }
  }
  const sourceRows = await db
    .select()
    .from(t.sources)
    .where(inArray(t.sources.id, [...sourceIds]));
  const listSources = races.flatMap(({ stateList }) => (stateList ? [stateList.source] : []));
  return { races, sources: [...sourceRows.map(m.sourceFromRow), ...listSources] };
}

export interface BallotDistrictOption {
  state: StateCode;
  number: number;
}

/** Every 2026 ballot (120th Congress) district that has a House race, for picking a district by hand. */
export async function ballotDistricts(db: Db): Promise<BallotDistrictOption[]> {
  const rows = await db
    .select({ state: t.districts.state, number: t.districts.number })
    .from(t.districts)
    .innerJoin(t.races, eq(t.races.districtId, t.districts.id))
    .where(eq(t.districts.mapVersion, "cd120"));
  return rows
    .map((row) => ({ state: row.state as StateCode, number: row.number }))
    .toSorted((a, b) => a.state.localeCompare(b.state) || a.number - b.number);
}
