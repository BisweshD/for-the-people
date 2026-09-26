import {
  BALLOT_MAP_VERSION,
  candidacyId,
  districtId,
  houseOfficeId,
  parseDistrictId,
  personIdFromFec,
  raceId,
  senateOfficeId,
  StateCode,
  type Candidacy,
  type ElectionId,
  type Office,
  type Party,
  type Person,
  type Source,
} from "@for-the-people/core";
import { eq } from "drizzle-orm";
import * as z from "zod";
import {
  mergePersonIdentity,
  removeRace,
  upsertCandidacy,
  upsertDistrictMap,
  upsertElection,
  upsertFinanceCommittee,
  upsertFinanceSummary,
  upsertPerson,
  upsertRace,
} from "../../actions/ingestion";
import { districts, financeSummaries, offices, people, terms } from "../../db/schema";
import type { IngestContext } from "../context";
import { formerMembersByFec } from "../parsers/legislators";
import {
  fecDate,
  parseAllCandidates,
  parseCandidateMaster,
  parseCommitteeMaster,
  parseFecName,
  unzipSingleText,
  type FecCandidateRow,
} from "../parsers/fec";
import { fecBulkUrl, legislatorsHistoricalUrl } from "../sources";

/**
 * 2026 federal elections from the FEC: the races (from the FEC's official election dates), every
 * statutory candidate who filed for them (status "filed": the FEC does not record primary results),
 * and campaign-finance totals (aggregates only).
 */

const CYCLE = 2026;
const ELECTION_DAY = "2026-11-03";
const GENERAL: ElectionId = `${ELECTION_DAY}-general`;
const DAY = 24 * 60 * 60 * 1000;

const electionDatesSchema = z.object({
  pagination: z.object({ pages: z.number() }),
  results: z.array(
    z.object({
      election_state: z.string().nullable(),
      election_date: z.string(),
      election_type_id: z.string(),
      office_sought: z.string().nullable(),
    }),
  ),
});

const PARTY: Record<string, Party> = { DEM: "D", REP: "R", IND: "I", LIB: "L", GRE: "G", DFL: "D" };
const DESIGNATION: Record<string, string> = {
  P: "Principal campaign committee",
  A: "Authorized by a candidate",
  J: "Joint fundraiser",
  U: "Unauthorized",
  B: "Lobbyist or registrant PAC",
  D: "Leadership PAC",
};

async function electionDates(context: IngestContext, key: string) {
  const results: z.infer<typeof electionDatesSchema>["results"] = [];
  let source: Source | null = null;
  for (let page = 1; ; page++) {
    const url = `https://api.open.fec.gov/v1/election-dates/?election_year=${CYCLE}&per_page=100&page=${page}&sort=election_date&api_key=${encodeURIComponent(key)}`;
    const fetched = await context.fetchWithSource(url, { maxAgeMs: DAY });
    source ??= fetched.source;
    const parsed = electionDatesSchema.parse(JSON.parse(fetched.raw.body.toString("utf8")));
    results.push(...parsed.results);
    if (page >= parsed.pagination.pages) break;
  }
  return { results, source: source! };
}

/**
 * Whether an office is on the ballot in a cycle. Puerto Rico's Resident Commissioner serves a four-year
 * term elected with the governor (48 U.S.C. 891; last elected in 2024, next in 2028), so no race in 2026.
 */
export const onBallotInCycle = (office: { title: string }, cycle: number): boolean =>
  office.title !== "Resident Commissioner" || cycle % 4 === 0;

/** A seat: the Senate office (state and class), or the House office plus the district number. */
export const seatKey = (officeId: string, districtNumber: number | null): string =>
  districtNumber === null ? officeId : `${officeId}#${districtNumber}`;

/**
 * Who holds each seat on a date, from the terms table: a candidacy is incumbent only when the person
 * serves in that same seat, never from the FEC's incumbent/challenger code (a departed member keeps it).
 */
export function seatHolders(
  rows: ReadonlyArray<{
    personId: string;
    officeId: string;
    districtId: string | null;
    start: string;
    end: string;
  }>,
  onDate: string,
): Set<string> {
  const holders = new Set<string>();
  for (const term of rows) {
    if (term.start > onDate || onDate > term.end) continue;
    const number = term.districtId ? parseDistrictId(term.districtId).number : null;
    holders.add(`${term.personId}|${seatKey(term.officeId, number)}`);
  }
  return holders;
}

function fecPerson(row: FecCandidateRow, sourceId: string, bioguide: string | null): Person {
  const name = parseFecName(row.name);
  return {
    id: personIdFromFec(row.candidateId),
    names: {
      full: name.full,
      first: name.first,
      last: name.last,
      nickname: null,
      suffix: name.suffix,
    },
    ids: {
      bioguide,
      fec: [row.candidateId],
      wikidata: null,
      ballotpedia: null,
      govtrack: null,
      lis: null,
    },
    portrait: null,
    links: bioguide
      ? [
          {
            label: "Earlier service in Congress",
            url: `https://bioguide.congress.gov/search/bio/${bioguide}`,
          },
        ]
      : [],
    sourceIds: [sourceId],
  };
}

export async function ingestFec(context: IngestContext): Promise<void> {
  const key = process.env.FEC_API_KEY;
  if (!key) {
    context.note("FEC_API_KEY is not set; 2026 races and campaign finance were not refreshed.");
    return;
  }

  // 1. Elections and races, from the FEC's official election dates.
  const dates = await electionDates(context, key);
  const generals = dates.results.filter(
    (row) => row.election_date === ELECTION_DAY && row.election_type_id === "G",
  );
  const senateStates = new Set(
    generals.filter((row) => row.office_sought === "S").map((row) => row.election_state!),
  );
  const houseStates = new Set(
    generals.filter((row) => row.office_sought === "H").map((row) => row.election_state!),
  );
  await context.act(upsertElection, {
    id: GENERAL,
    date: ELECTION_DAY,
    type: "general",
    state: null,
    name: "2026 general election",
    sourceIds: [dates.source.id],
  });

  const officeRows = await context.db.select().from(offices);
  const classTwoStates = new Set(
    officeRows.filter((office) => office.seatClass === 2).map((office) => office.state),
  );
  const senateRaces = new Map<string, string>();
  const senateSeats = new Map<string, string>();
  for (const state of [...senateStates].sort()) {
    const parsedState = StateCode.safeParse(state);
    if (!parsedState.success) continue;
    // Class 2 seats are regularly up in 2026; any other Senate race this year fills a Class 3 vacancy.
    const seatClass = classTwoStates.has(state) ? 2 : 3;
    let electionId: ElectionId = GENERAL;
    if (seatClass === 3) {
      electionId = `${ELECTION_DAY}-special-${parsedState.data}`;
      await context.act(upsertElection, {
        id: electionId,
        date: ELECTION_DAY,
        type: "special",
        state: parsedState.data,
        name: `2026 special election for U.S. Senate (${parsedState.data})`,
        sourceIds: [dates.source.id],
      });
    }
    const office: Office = {
      id: senateOfficeId(parsedState.data, seatClass),
      level: "federal",
      chamber: "senate",
      title: "U.S. Senator",
      state: parsedState.data,
      seatClass,
    };
    const id = raceId(electionId, office.id, null);
    await context.act(upsertRace, {
      race: {
        id,
        electionId,
        officeId: office.id,
        chamber: "senate",
        state: parsedState.data,
        districtId: null,
        sourceIds: [dates.source.id],
      },
      office,
    });
    senateRaces.set(state, id);
    senateSeats.set(state, office.id);
  }

  // 2. Candidate filings (the FEC candidate master), districts for the 2026 ballot, and House races.
  const candidates = await context.fetchWithSource(fecBulkUrl("cn", CYCLE), { maxAgeMs: DAY });
  const filings = parseCandidateMaster(unzipSingleText(candidates.raw.body)).filter(
    (row) =>
      row.electionYear === CYCLE &&
      row.status === "C" &&
      (row.office === "H" || row.office === "S"),
  );
  context.count("fec.statutoryCandidates", filings.length);

  const servingDistricts = await context.db
    .select()
    .from(districts)
    .where(eq(districts.mapVersion, "cd119"));
  const houseOffice = (state: string) =>
    officeRows.find((row) => row.id === houseOfficeId(state as StateCode));
  const notUp = servingDistricts.filter((district) => {
    const office = houseOffice(district.state);
    return houseStates.has(district.state) && office && !onBallotInCycle(office, CYCLE);
  });
  for (const district of notUp) {
    // The FEC's feed lists a general election here, but the seat's term does not end this cycle.
    await context.act(removeRace, {
      raceId: raceId(
        GENERAL,
        houseOfficeId(district.state as StateCode),
        districtId(district.state as StateCode, district.number, BALLOT_MAP_VERSION),
      ),
      why: `No ${CYCLE} election: ${district.state}'s ${houseOffice(district.state)!.title} serves a four-year term (48 U.S.C. 891).`,
      sourceIds: [dates.source.id],
    });
  }
  const ballotDistricts = servingDistricts
    .filter((district) => houseStates.has(district.state) && !notUp.includes(district))
    .map((district) => ({
      id: districtId(district.state as StateCode, district.number, BALLOT_MAP_VERSION),
      state: district.state as StateCode,
      number: district.number,
      mapVersion: BALLOT_MAP_VERSION,
      geometryRef: null,
      sourceId: candidates.source.id,
    }));
  await context.act(upsertDistrictMap, {
    mapVersion: BALLOT_MAP_VERSION,
    districts: ballotDistricts,
  });

  const houseRaces = new Map<string, string>();
  for (const district of ballotDistricts) {
    const office = houseOffice(district.state);
    if (!office) continue;
    const id = raceId(GENERAL, office.id, district.id);
    await context.act(upsertRace, {
      race: {
        id,
        electionId: GENERAL,
        officeId: office.id,
        chamber: "house",
        state: district.state,
        districtId: district.id,
        sourceIds: [dates.source.id],
      },
      office: {
        ...office,
        level: "federal",
        title: office.title as Office["title"],
        state: district.state,
        seatClass: null,
      },
    });
    houseRaces.set(district.id, id);
  }

  // 3. People and candidacies. A filing whose FEC id belongs to a member uses the member's bioguide identity.
  // Someone who served before the 119th Congress keeps an FEC identity, with the crosswalk's bioguide id.
  const personRows = await context.db
    .select({ id: people.id, fecIds: people.fecIds, bioguide: people.bioguide })
    .from(people);
  const byFec = new Map(
    personRows.flatMap((row) =>
      row.id.startsWith("fec:") ? [] : row.fecIds.map((fec) => [fec, row.id] as const),
    ),
  );
  const historical = await context.fetchWithSource(legislatorsHistoricalUrl, {
    maxAgeMs: 12 * 60 * 60 * 1000,
  });
  const formerByFec = formerMembersByFec(JSON.parse(historical.raw.body.toString("utf8")));
  const bioguideOwner = new Map(
    personRows.flatMap((row) => (row.bioguide ? [[row.bioguide, row.id] as const] : [])),
  );
  const today = context.now.toISOString().slice(0, 10);
  const holders = seatHolders(
    await context.db
      .select({
        personId: terms.personId,
        officeId: terms.officeId,
        districtId: terms.districtId,
        start: terms.start,
        end: terms.end,
      })
      .from(terms),
    today,
  );
  const existing = new Set(personRows.map((row) => row.id));
  const personForFec = new Map<string, string>();
  for (const filing of filings) {
    const state = filing.officeState;
    const houseDistrict = Number(filing.officeDistrict || "0");
    const race =
      filing.office === "S"
        ? senateRaces.get(state)
        : houseRaces.get(districtId(state as StateCode, houseDistrict, BALLOT_MAP_VERSION));
    if (!race) {
      context.count("fec.filingsWithoutRace");
      continue;
    }
    const member = byFec.get(filing.candidateId);
    let personId: string;
    if (member) {
      personId = member;
      if (existing.has(personIdFromFec(filing.candidateId))) {
        await context.act(mergePersonIdentity, {
          from: personIdFromFec(filing.candidateId),
          into: member,
          evidence: `FEC id ${filing.candidateId} is listed for ${member} in congress-legislators`,
          sourceIds: [candidates.source.id],
        });
      }
    } else {
      const id = personIdFromFec(filing.candidateId);
      const bioguide = formerByFec.get(filing.candidateId) ?? null;
      // One bioguide id per person: a second FEC filing by the same former member stays unlinked.
      const owner = bioguide ? bioguideOwner.get(bioguide) : undefined;
      const linked = bioguide && (!owner || owner === id) ? bioguide : null;
      if (linked) bioguideOwner.set(linked, id);
      const person = fecPerson(filing, candidates.source.id, linked);
      if (linked) person.sourceIds.push(historical.source.id);
      const result = await context.act(upsertPerson, person);
      if (!result.ok) continue;
      personId = person.id;
    }
    personForFec.set(filing.candidateId, personId);
    // The race's seat: the Senate office (with its class), or the House office and district number.
    const raceSeat =
      filing.office === "S"
        ? seatKey(senateSeats.get(state)!, null)
        : seatKey(houseOfficeId(state as StateCode), houseDistrict);
    const candidacy: Candidacy = {
      id: candidacyId(race, personId),
      personId,
      raceId: race,
      party: PARTY[filing.party] ?? "O",
      status: "filed",
      incumbent: holders.has(`${personId}|${raceSeat}`),
      fecCandidateId: filing.candidateId,
      sourceIds: [candidates.source.id],
    };
    await context.act(upsertCandidacy, candidacy);
  }

  // 4. Campaign-finance totals for members and 2026 candidates (aggregates only).
  const committees = await context.fetchWithSource(fecBulkUrl("cm", CYCLE), { maxAgeMs: DAY });
  const committeeById = new Map(
    parseCommitteeMaster(unzipSingleText(committees.raw.body)).map((row) => [row.committeeId, row]),
  );
  const allCandidates = parseCandidateMaster(unzipSingleText(candidates.raw.body));
  const pccByCandidate = new Map(
    allCandidates.map((row) => [row.candidateId, row.principalCommitteeId]),
  );
  const totals = await context.fetchWithSource(fecBulkUrl("weball", CYCLE), { maxAgeMs: DAY });
  // Small-dollar and in-state shares come from the fec-aggregates job; a totals refresh keeps them.
  const shares = new Map(
    (await context.db.select().from(financeSummaries))
      .filter((row) => row.cycle === CYCLE)
      .map((row) => [
        `${row.personId}|${row.financeCommitteeId}`,
        { smallDollarShare: row.smallDollarShare, inStateShare: row.inStateShare },
      ]),
  );
  for (const row of parseAllCandidates(unzipSingleText(totals.raw.body))) {
    const personId = personForFec.get(row.candidateId) ?? byFec.get(row.candidateId);
    const committeeId = pccByCandidate.get(row.candidateId);
    const committee = committeeId ? committeeById.get(committeeId) : undefined;
    const asOf = fecDate(row.coverageEnd);
    if (!personId || !committee || !asOf) continue;
    await context.act(upsertFinanceCommittee, {
      id: committee.committeeId,
      name: committee.name,
      designation: DESIGNATION[committee.designation] ?? null,
      candidateId: row.candidateId,
      sourceId: committees.source.id,
    });
    const stored = shares.get(`${personId}|${committee.committeeId}`);
    await context.act(upsertFinanceSummary, {
      personId,
      cycle: CYCLE,
      financeCommitteeId: committee.committeeId,
      receipts: row.receipts,
      individual: row.individual,
      smallDollarShare: stored?.smallDollarShare ?? null,
      pacs: row.otherCommittees,
      party: row.partyCommittees,
      selfFunding: row.candidateContributions + row.candidateLoans,
      transfers: row.transfersFromAuthorized,
      cashOnHand: row.cashOnHand,
      debts: row.debts,
      inStateShare: stored?.inStateShare ?? null,
      asOf,
      sourceId: totals.source.id,
    });
  }
}
