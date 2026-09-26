import type {
  KeyVote,
  Measure,
  Party,
  Person,
  Position,
  RollCall,
  Source,
  StateCode,
} from "@for-the-people/core";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";
import { publishedKeyVotes, sources } from "./index";

/**
 * Reads for the bill page, the roll call page, The Board, and the hemicycle. Each returns ontology
 * objects plus the Sources behind them, so every rendered fact can carry its receipt.
 */

/** A member as a Board cell or hemicycle seat needs them: identity, where they sit, and how they voted. */
export interface Seat {
  personId: string;
  name: string;
  lastName: string;
  state: StateCode;
  /** House district served on the day of the vote (0 = at-large); null for senators or when unknown. */
  district: number | null;
  /** Party as printed on the official roll call. */
  party: Party;
  position: Position;
}

export interface RollCallSeats {
  rollCall: RollCall;
  measure: Measure | null;
  seats: Seat[];
  source: Source;
}

export interface Sponsor {
  person: Pick<Person, "id" | "names">;
  party: Party;
  state: StateCode;
  chamber: "house" | "senate";
  district: number | null;
  title: string;
}

export interface MeasurePage {
  measure: Measure;
  sponsor: Sponsor | null;
  /** Every recorded vote on the measure, oldest first. */
  rollCalls: RollCall[];
  /** Published key-vote cards that include this measure. */
  keyVotes: KeyVote[];
  /** The Sources behind the measure, its CRS summary, and its roll calls. */
  sources: Source[];
}

async function sponsorOf(db: Db, measure: Measure): Promise<Sponsor | null> {
  if (!measure.sponsorId) return null;
  const rows = await db
    .select({ person: t.people, term: t.terms, office: t.offices, district: t.districts })
    .from(t.people)
    .innerJoin(t.terms, eq(t.terms.personId, t.people.id))
    .innerJoin(t.offices, eq(t.offices.id, t.terms.officeId))
    .leftJoin(t.districts, eq(t.districts.id, t.terms.districtId))
    .where(eq(t.people.id, measure.sponsorId))
    .orderBy(desc(t.terms.start));
  const introduced = measure.introducedDate;
  const row =
    (introduced && rows.find(({ term }) => term.start <= introduced && introduced <= term.end)) ||
    rows[0];
  if (!row) return null;
  const person = m.personFromRow(row.person);
  return {
    person: { id: person.id, names: person.names },
    party: row.term.party as Party,
    state: row.term.state as StateCode,
    chamber: row.term.chamber,
    district: row.district?.number ?? null,
    title: row.office.title,
  };
}

export async function measurePage(db: Db, id: string): Promise<MeasurePage | null> {
  const [row] = await db.select().from(t.measures).where(eq(t.measures.id, id));
  if (!row) return null;
  const measure = m.measureFromRow(row);
  const [rollCallRows, sponsor, keyVotes] = await Promise.all([
    db
      .select()
      .from(t.rollCalls)
      .where(eq(t.rollCalls.measureId, id))
      .orderBy(asc(t.rollCalls.date), asc(t.rollCalls.chamber), asc(t.rollCalls.number)),
    sponsorOf(db, measure),
    publishedKeyVotes(db),
  ]);
  const rollCalls = rollCallRows.map(m.rollCallFromRow);
  const sourceIds = [
    ...measure.sourceIds,
    ...(measure.crsSummary ? [measure.crsSummary.sourceId] : []),
    ...rollCalls.map((rollCall) => rollCall.sourceId),
  ];
  return {
    measure,
    sponsor,
    rollCalls,
    keyVotes: keyVotes.filter((keyVote) => keyVote.measures.includes(id)),
    sources: await sources(db, [...new Set(sourceIds)]),
  };
}

/**
 * One roll call with every member's VotePosition and the House district each member served that day.
 * Seats come back in no particular order; the Board and the hemicycle each sort them their own way.
 */
export async function rollCallSeats(db: Db, id: string): Promise<RollCallSeats | null> {
  const [row] = await db.select().from(t.rollCalls).where(eq(t.rollCalls.id, id));
  if (!row) return null;
  const rollCall = m.rollCallFromRow(row);
  const [measureRows, positionRows, termRows, sourceRows] = await Promise.all([
    rollCall.measureId
      ? db.select().from(t.measures).where(eq(t.measures.id, rollCall.measureId))
      : Promise.resolve([]),
    db
      .select({
        position: t.votePositions,
        person: { name: t.people.fullName, lastName: t.people.lastName },
      })
      .from(t.votePositions)
      .innerJoin(t.people, eq(t.people.id, t.votePositions.personId))
      .where(eq(t.votePositions.rollCallId, id)),
    rollCall.chamber === "house"
      ? db
          .select({ personId: t.terms.personId, number: t.districts.number })
          .from(t.terms)
          .innerJoin(t.districts, eq(t.districts.id, t.terms.districtId))
          .where(
            and(
              eq(t.terms.chamber, "house"),
              lte(t.terms.start, rollCall.date),
              gte(t.terms.end, rollCall.date),
            ),
          )
      : Promise.resolve([]),
    sources(db, [rollCall.sourceId]),
  ]);
  const source = sourceRows[0];
  if (!source) return null;
  const districts = new Map(termRows.map((term) => [term.personId, term.number]));
  return {
    rollCall,
    measure: measureRows[0] ? m.measureFromRow(measureRows[0]) : null,
    source,
    seats: positionRows.map(({ position, person }) => ({
      personId: position.personId,
      name: person.name,
      lastName: person.lastName,
      state: position.state as StateCode,
      district: districts.get(position.personId) ?? null,
      party: position.party as Party,
      position: position.position,
    })),
  };
}

/** Published key-vote cards that cite a roll call. */
export async function keyVotesForRollCall(db: Db, id: string): Promise<KeyVote[]> {
  return (await publishedKeyVotes(db)).filter((keyVote) =>
    keyVote.rollCallRefs.some((ref) => ref.rollCallId === id),
  );
}

/** Measures on published key-vote cards that exist in our database, for prerendering bill pages. */
export async function keyVoteMeasureIds(db: Db): Promise<string[]> {
  const ids = [...new Set((await publishedKeyVotes(db)).flatMap((keyVote) => keyVote.measures))];
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: t.measures.id })
    .from(t.measures)
    .where(inArray(t.measures.id, ids));
  return rows.map((row) => row.id).sort();
}

/** Decisive roll calls on published key-vote cards, for prerendering roll call pages. */
export async function keyVoteRollCallIds(db: Db): Promise<string[]> {
  return [
    ...new Set(
      (await publishedKeyVotes(db)).flatMap((keyVote) =>
        keyVote.rollCallRefs.map((ref) => ref.rollCallId),
      ),
    ),
  ].sort();
}
