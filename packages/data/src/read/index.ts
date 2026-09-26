import type {
  IssueArea,
  KeyVote,
  Measure,
  Party,
  Person,
  Position,
  RollCall,
  Source,
  StateCode,
  Term,
} from "@for-the-people/core";
import { and, asc, desc, eq, gte, inArray, lte, not, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";

/**
 * The read layer: typed queries that return ontology objects. Pages, API routes, and Ask tools read
 * only through these functions. No function here writes.
 */

export interface DeckCard {
  keyVote: KeyVote;
  issueArea: IssueArea;
  measures: Measure[];
  rollCalls: RollCall[];
}

export async function publishedKeyVotes(db: Db): Promise<KeyVote[]> {
  const rows = await db
    .select()
    .from(t.keyVotes)
    .where(eq(t.keyVotes.status, "published"))
    .orderBy(asc(t.keyVotes.order));
  return rows.map(m.keyVoteFromRow);
}

export async function issueAreas(db: Db): Promise<IssueArea[]> {
  return (await db.select().from(t.issueAreas).orderBy(asc(t.issueAreas.label))).map(
    m.issueAreaFromRow,
  );
}

/** Every published card with the measures and official roll calls behind it. */
export async function deck(db: Db): Promise<DeckCard[]> {
  const keyVotes = await publishedKeyVotes(db);
  if (keyVotes.length === 0) return [];
  const areas = new Map((await issueAreas(db)).map((area) => [area.id, area]));
  const measureIds = [...new Set(keyVotes.flatMap((keyVote) => keyVote.measures))];
  const rollCallIds = [
    ...new Set(keyVotes.flatMap((keyVote) => keyVote.rollCallRefs.map((ref) => ref.rollCallId))),
  ];
  const [measureRows, rollCallRows] = await Promise.all([
    db.select().from(t.measures).where(inArray(t.measures.id, measureIds)),
    db.select().from(t.rollCalls).where(inArray(t.rollCalls.id, rollCallIds)),
  ]);
  const measures = new Map(measureRows.map((row) => [row.id, m.measureFromRow(row)]));
  const rollCalls = new Map(rollCallRows.map((row) => [row.id, m.rollCallFromRow(row)]));
  return keyVotes.flatMap((keyVote) => {
    const issueArea = areas.get(keyVote.issueArea);
    if (!issueArea) return [];
    return [
      {
        keyVote,
        issueArea,
        measures: keyVote.measures.flatMap((id) => measures.get(id) ?? []),
        rollCalls: keyVote.rollCallRefs.flatMap((ref) => rollCalls.get(ref.rollCallId) ?? []),
      },
    ];
  });
}

export interface MemberSummary {
  id: string;
  name: string;
  lastName: string;
  party: Party;
  state: StateCode;
  chamber: "house" | "senate";
  /** District number for House members (0 = at-large); null for senators. */
  district: number | null;
  title: string;
  portrait: Person["portrait"];
  serving: boolean;
  termStart: string;
  termEnd: string;
}

/** Everyone who served in the 119th Congress, with their latest term. `serving` is false for members who left. */
export async function members(db: Db, today: string): Promise<MemberSummary[]> {
  const rows = await db
    .select({ person: t.people, term: t.terms, office: t.offices, district: t.districts })
    .from(t.terms)
    .innerJoin(t.people, eq(t.people.id, t.terms.personId))
    .innerJoin(t.offices, eq(t.offices.id, t.terms.officeId))
    .leftJoin(t.districts, eq(t.districts.id, t.terms.districtId))
    .orderBy(asc(t.people.lastName), desc(t.terms.start));
  const latest = new Map<string, MemberSummary>();
  for (const { person, term, office, district } of rows) {
    if (latest.has(person.id)) continue;
    latest.set(person.id, {
      id: person.id,
      name: person.fullName,
      lastName: person.lastName,
      party: term.party as Party,
      state: term.state as StateCode,
      chamber: term.chamber,
      district: district?.number ?? null,
      title: office.title,
      portrait: person.portrait ?? null,
      serving: term.start <= today && today <= term.end,
      termStart: term.start,
      termEnd: term.end,
    });
  }
  return [...latest.values()];
}

export interface KeyVoteRecord {
  /** Roll call ids in a fixed order, shared by every member row. */
  rollCallIds: string[];
  /** personId to one character per roll call: Y, N, P (present), V (not voting), or "-" (not a member then). */
  positions: Record<string, string>;
}

const POSITION_CODE: Record<Position, string> = {
  Yea: "Y",
  Nay: "N",
  Present: "P",
  NotVoting: "V",
};

/** Every member's VotePosition on the published key-vote roll calls, packed small enough to ship to the device. */
export async function keyVoteRecord(db: Db): Promise<KeyVoteRecord> {
  const keyVotes = await publishedKeyVotes(db);
  const rollCallIds = [
    ...new Set(keyVotes.flatMap((keyVote) => keyVote.rollCallRefs.map((ref) => ref.rollCallId))),
  ].sort();
  if (rollCallIds.length === 0) return { rollCallIds, positions: {} };
  const rows = await db
    .select({
      rollCallId: t.votePositions.rollCallId,
      personId: t.votePositions.personId,
      position: t.votePositions.position,
    })
    .from(t.votePositions)
    .where(inArray(t.votePositions.rollCallId, rollCallIds));
  const index = new Map(rollCallIds.map((id, i) => [id, i]));
  const packed: Record<string, string[]> = {};
  for (const row of rows) {
    const codes = (packed[row.personId] ??= rollCallIds.map(() => "-"));
    codes[index.get(row.rollCallId)!] = POSITION_CODE[row.position];
  }
  return {
    rollCallIds,
    positions: Object.fromEntries(
      Object.entries(packed).map(([id, codes]) => [id, codes.join("")]),
    ),
  };
}

export function unpackPositions(record: KeyVoteRecord, personId: string): Map<string, Position> {
  const codes = record.positions[personId];
  const positions = new Map<string, Position>();
  if (!codes) return positions;
  const decode: Record<string, Position> = { Y: "Yea", N: "Nay", P: "Present", V: "NotVoting" };
  record.rollCallIds.forEach((id, i) => {
    const position = decode[codes[i] ?? "-"];
    if (position) positions.set(id, position);
  });
  return positions;
}

export interface MemberStatsView {
  chamber: "house" | "senate";
  eligibleVotes: number;
  missedVotes: number;
  partyUnityEligible: number;
  partyUnityVotes: number;
  firstVoteDate: string | null;
  lastVoteDate: string | null;
  computedAt: string;
}

/**
 * Each member's party-line record (method-party-unity) as [votes with their party, eligible votes],
 * small enough to ship to the device for the Explore map.
 */
export async function partyUnityRecord(db: Db): Promise<Record<string, [number, number]>> {
  const rows = await db
    .select({
      personId: t.memberStats.personId,
      votes: t.memberStats.partyUnityVotes,
      eligible: t.memberStats.partyUnityEligible,
    })
    .from(t.memberStats);
  return Object.fromEntries(
    rows
      .filter((row) => row.eligible > 0)
      .map((row) => [row.personId, [row.votes, row.eligible] as [number, number]]),
  );
}

export interface PersonProfile {
  person: Person;
  terms: Term[];
  stats: MemberStatsView | null;
  sponsored: Measure[];
  /** Every roll call on the sponsored measures, so their outcomes come from the recorded votes. */
  sponsoredRollCalls: RollCall[];
}

export async function personProfile(db: Db, id: string): Promise<PersonProfile | null> {
  const [row] = await db.select().from(t.people).where(eq(t.people.id, id));
  if (!row) return null;
  const [termRows, statRows, sponsoredRows] = await Promise.all([
    db.select().from(t.terms).where(eq(t.terms.personId, id)).orderBy(desc(t.terms.start)),
    db.select().from(t.memberStats).where(eq(t.memberStats.personId, id)),
    db
      .select()
      .from(t.measures)
      .where(eq(t.measures.sponsorId, id))
      .orderBy(desc(t.measures.latestActionDate))
      .limit(12),
  ]);
  const stats = statRows[0];
  const sponsoredIds = sponsoredRows.map((measure) => measure.id);
  const sponsoredRollCalls =
    sponsoredIds.length > 0
      ? await db.select().from(t.rollCalls).where(inArray(t.rollCalls.measureId, sponsoredIds))
      : [];
  return {
    person: m.personFromRow(row),
    terms: termRows.map(m.termFromRow),
    stats: stats
      ? {
          chamber: stats.chamber,
          eligibleVotes: stats.eligibleVotes,
          missedVotes: stats.missedVotes,
          partyUnityEligible: stats.partyUnityEligible,
          partyUnityVotes: stats.partyUnityVotes,
          firstVoteDate: stats.firstVoteDate,
          lastVoteDate: stats.lastVoteDate,
          computedAt: stats.computedAt,
        }
      : null,
    sponsored: sponsoredRows.map(m.measureFromRow),
    sponsoredRollCalls: sponsoredRollCalls.map(m.rollCallFromRow),
  };
}

export interface BoardSeat {
  personId: string;
  name: string;
  lastName: string;
  state: StateCode;
  party: Party;
  position: Position;
}

export interface RollCallDetail {
  rollCall: RollCall;
  measure: Measure | null;
  seats: BoardSeat[];
}

/** One roll call with every member's VotePosition in state order, for The Board and the hemicycle. */
export async function rollCallDetail(db: Db, id: string): Promise<RollCallDetail | null> {
  const [row] = await db.select().from(t.rollCalls).where(eq(t.rollCalls.id, id));
  if (!row) return null;
  const rollCall = m.rollCallFromRow(row);
  const [measureRows, seatRows] = await Promise.all([
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
      .where(eq(t.votePositions.rollCallId, id))
      .orderBy(asc(t.votePositions.state), asc(t.people.lastName)),
  ]);
  return {
    rollCall,
    measure: measureRows[0] ? m.measureFromRow(measureRows[0]) : null,
    seats: seatRows.map(({ position, person }) => ({
      personId: position.personId,
      name: person.name,
      lastName: person.lastName,
      state: position.state as StateCode,
      party: position.party as Party,
      position: position.position,
    })),
  };
}

export async function measureDetail(
  db: Db,
  id: string,
): Promise<{ measure: Measure; rollCalls: RollCall[] } | null> {
  const [row] = await db.select().from(t.measures).where(eq(t.measures.id, id));
  if (!row) return null;
  const rollCallRows = await db
    .select()
    .from(t.rollCalls)
    .where(eq(t.rollCalls.measureId, id))
    .orderBy(asc(t.rollCalls.date), asc(t.rollCalls.number));
  return { measure: m.measureFromRow(row), rollCalls: rollCallRows.map(m.rollCallFromRow) };
}

export async function sources(db: Db, ids: readonly string[]): Promise<Source[]> {
  if (ids.length === 0) return [];
  return (
    await db
      .select()
      .from(t.sources)
      .where(inArray(t.sources.id, [...ids]))
  ).map(m.sourceFromRow);
}

export async function rollCallsBetween(db: Db, from: string, to: string): Promise<RollCall[]> {
  const rows = await db
    .select()
    .from(t.rollCalls)
    .where(and(gte(t.rollCalls.date, from), lte(t.rollCalls.date, to)))
    .orderBy(desc(t.rollCalls.date));
  return rows.map(m.rollCallFromRow);
}

export interface StatusReport {
  runs: Array<{
    job: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    stats: Record<string, number>;
    notes: string[];
  }>;
  /** The last RUN_HISTORY runs of each job, newest first, for the freshness strip on /status. */
  history: Record<string, Array<{ status: string; startedAt: string; finishedAt: string | null }>>;
  counts: Record<string, number>;
}

/** How many past runs of each job /status shows. */
export const RUN_HISTORY = 14;

/**
 * A stored roll call that records a vote on a question: someone voted Yea or Nay. The other kind is a
 * quorum call ("Call of the House"), which records only who was present. The votes job skips those now,
 * but a run before that rule stored one, and stored rows are never deleted, so without this the table
 * would count one more roll call than the latest run reads.
 */
const RECORDS_A_VOTE = sql`${t.rollCalls.yea} + ${t.rollCalls.nay} > 0`;

/**
 * Feeds /status and the home page: the latest run of each ingestion job and table sizes. Roll calls
 * and member votes count only votes on a question, so every page shows the number the votes job reads;
 * stored quorum calls are counted apart (`quorumCalls`) for the page to say so.
 */
export async function status(db: Db): Promise<StatusReport> {
  const runs = await db.select().from(t.ingestionRuns).orderBy(desc(t.ingestionRuns.startedAt));
  const latest = new Map<string, (typeof runs)[number]>();
  const history: StatusReport["history"] = {};
  for (const run of runs) {
    if (!latest.has(run.job)) latest.set(run.job, run);
    const past = (history[run.job] ??= []);
    if (past.length < RUN_HISTORY)
      past.push({ status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt });
  }
  const votes = db.select({ id: t.rollCalls.id }).from(t.rollCalls).where(RECORDS_A_VOTE);
  const [people, rollCalls, quorumCalls, positions, measures, published, sourcesCount] =
    await Promise.all([
      db.$count(t.people),
      db.$count(t.rollCalls, RECORDS_A_VOTE),
      db.$count(t.rollCalls, not(RECORDS_A_VOTE)),
      db.$count(t.votePositions, inArray(t.votePositions.rollCallId, votes)),
      db.$count(t.measures),
      db.$count(t.keyVotes, eq(t.keyVotes.status, "published")),
      db.$count(t.sources),
    ]);
  return {
    runs: [...latest.values()].map((run) => ({
      job: run.job,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      stats: run.stats,
      notes: run.notes,
    })),
    history,
    counts: {
      people,
      rollCalls,
      quorumCalls,
      votePositions: positions,
      measures,
      publishedKeyVotes: published,
      sources: sourcesCount,
    },
  };
}

export interface RollCallTally {
  /**
   * Every roll call that records a vote in each chamber, oldest first, with the first and last dates and
   * the Receipt of the newest one, so a count of roll calls can carry one.
   */
  chambers: Record<
    "house" | "senate",
    { ids: string[]; first: string | null; last: string | null; latestSourceId: string | null }
  >;
  /** The Receipt of the newest roll call in either chamber. */
  latestSourceId: string | null;
}

/**
 * Home's roll-call figure: the same roll calls `status` counts (quorum calls left out), per chamber in
 * the order they were taken (date, then session and roll-call number).
 */
export async function rollCallTally(db: Db): Promise<RollCallTally> {
  const rows = await db
    .select({
      id: t.rollCalls.id,
      chamber: t.rollCalls.chamber,
      date: t.rollCalls.date,
      sourceId: t.rollCalls.sourceId,
    })
    .from(t.rollCalls)
    .where(RECORDS_A_VOTE)
    .orderBy(asc(t.rollCalls.date), asc(t.rollCalls.session), asc(t.rollCalls.number));
  const chamber = (name: "house" | "senate") => {
    const own = rows.filter((row) => row.chamber === name);
    return {
      ids: own.map((row) => row.id),
      first: own[0]?.date ?? null,
      last: own.at(-1)?.date ?? null,
      latestSourceId: own.at(-1)?.sourceId ?? null,
    };
  };
  return {
    chambers: { house: chamber("house"), senate: chamber("senate") },
    latestSourceId: rows.at(-1)?.sourceId ?? null,
  };
}

export const dataVersion = async (db: Db): Promise<string> => {
  const [row] = await db.select({ latest: sql<string>`max(${t.eventLog.at})` }).from(t.eventLog);
  return row?.latest ?? "empty";
};
