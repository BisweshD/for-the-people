import type {
  Chamber,
  FinanceSummary,
  Measure,
  MeasureType,
  Party,
  Person,
  Position,
  RollCall,
  Source,
  StateCode,
} from "@for-the-people/core";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";
import { deck, sources, type DeckCard, type MemberStatsView } from "./index";

/**
 * Read-only views for Ask For The People's tools. Everything here is public civic
 * data: no voter data, no donor names, no addresses.
 */

export interface AskMember {
  id: string;
  name: string;
  lastName: string;
  nickname: string | null;
  party: Party;
  state: StateCode;
  chamber: Chamber;
  /** District number for House members (0 = at-large); null for senators. */
  district: number | null;
  districtId: string | null;
  title: string;
  portrait: Person["portrait"];
  serving: boolean;
  termStart: string;
  termEnd: string;
  /** The Source behind the member's latest term. */
  termSourceId: string;
}

/** Everyone in the database with their latest term and the Source behind it. */
export async function askMembers(db: Db, today: string): Promise<AskMember[]> {
  const rows = await db
    .select({ person: t.people, term: t.terms, office: t.offices, district: t.districts })
    .from(t.terms)
    .innerJoin(t.people, eq(t.people.id, t.terms.personId))
    .innerJoin(t.offices, eq(t.offices.id, t.terms.officeId))
    .leftJoin(t.districts, eq(t.districts.id, t.terms.districtId))
    .orderBy(asc(t.people.lastName), desc(t.terms.start));
  const latest = new Map<string, AskMember>();
  for (const { person, term, office, district } of rows) {
    if (latest.has(person.id)) continue;
    const termSourceId = term.sourceIds[0] ?? person.sourceIds[0];
    if (!termSourceId) continue;
    latest.set(person.id, {
      id: person.id,
      name: person.fullName,
      lastName: person.lastName,
      nickname: person.nickname,
      party: term.party as Party,
      state: term.state as StateCode,
      chamber: term.chamber,
      district: district?.number ?? null,
      districtId: term.districtId,
      title: office.title,
      portrait: person.portrait ?? null,
      serving: term.start <= today && today <= term.end,
      termStart: term.start,
      termEnd: term.end,
      termSourceId,
    });
  }
  return [...latest.values()];
}

const TITLE_WORDS = new Set([
  "sen",
  "senator",
  "rep",
  "representative",
  "congressman",
  "congresswoman",
  "congressmember",
  "delegate",
  "mr",
  "mrs",
  "ms",
  "dr",
]);

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ");

const words = (text: string): string[] =>
  fold(text)
    .split(/[\s-]+/)
    .filter(Boolean);

export interface PeopleQuery {
  /** A name or part of one. */
  query?: string | undefined;
  state?: StateCode | undefined;
  chamber?: Chamber | undefined;
  /** Leave out members who no longer serve. */
  servingOnly?: boolean | undefined;
  limit: number;
}

/**
 * Name search over members, ranked: an exact full-name match first, then an exact last name, then
 * every query word matching the start of a name word. Serving members rank above former ones.
 */
export function searchMembers(members: readonly AskMember[], query: PeopleQuery): AskMember[] {
  const tokens = words(query.query ?? "").filter((token) => !TITLE_WORDS.has(token));
  const scored: Array<{ member: AskMember; score: number }> = [];
  for (const member of members) {
    if (query.state && member.state !== query.state) continue;
    if (query.chamber && member.chamber !== query.chamber) continue;
    if (query.servingOnly && !member.serving) continue;
    let score = member.serving ? 10 : 0;
    if (tokens.length > 0) {
      const nameWords = [
        ...words(member.name),
        ...words(member.nickname ?? ""),
        ...words(member.lastName),
      ];
      const matched = tokens.every((token) => nameWords.some((word) => word.startsWith(token)));
      if (!matched) continue;
      const full = words(member.name).join(" ");
      const asked = tokens.join(" ");
      if (full === asked) score += 100;
      else if (tokens.length === 1 && words(member.lastName).join(" ") === asked) score += 50;
      else if (tokens.every((token) => nameWords.includes(token))) score += 30;
      else score += 10;
    }
    scored.push({ member, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.member.lastName.localeCompare(b.member.lastName))
    .slice(0, query.limit)
    .map(({ member }) => member);
}

export async function findPeople(db: Db, query: PeopleQuery, today: string): Promise<AskMember[]> {
  return searchMembers(await askMembers(db, today), query);
}

export async function askMember(
  db: Db,
  personId: string,
  today: string,
): Promise<AskMember | null> {
  return (await askMembers(db, today)).find((member) => member.id === personId) ?? null;
}

/** Current House members for the given districts, plus the senators of those states. */
export async function membersForDistricts(
  db: Db,
  districtIds: readonly string[],
  today: string,
): Promise<AskMember[]> {
  if (districtIds.length === 0) return [];
  const states = new Set(districtIds.map((id) => id.slice(0, 2)));
  const numbers = new Set(districtIds.map((id) => id.split("@")[0]));
  return (await askMembers(db, today))
    .filter((member) => member.serving && states.has(member.state))
    .filter(
      (member) =>
        member.chamber === "senate" ||
        (member.districtId !== null && numbers.has(member.districtId.split("@")[0])),
    )
    .sort((a, b) =>
      a.chamber === b.chamber
        ? a.lastName.localeCompare(b.lastName)
        : a.chamber === "senate"
          ? -1
          : 1,
    );
}

export async function memberStats(db: Db, personId: string): Promise<MemberStatsView | null> {
  const [row] = await db.select().from(t.memberStats).where(eq(t.memberStats.personId, personId));
  if (!row) return null;
  return {
    chamber: row.chamber,
    eligibleVotes: row.eligibleVotes,
    missedVotes: row.missedVotes,
    partyUnityEligible: row.partyUnityEligible,
    partyUnityVotes: row.partyUnityVotes,
    firstVoteDate: row.firstVoteDate,
    lastVoteDate: row.lastVoteDate,
    computedAt: row.computedAt,
  };
}

export interface KeyVoteLibrary {
  cards: DeckCard[];
  /** The Source behind each roll call, by Source id. */
  sources: Map<string, Source>;
}

/** Published key votes with their measures, roll calls, and receipts. */
export async function keyVoteLibrary(db: Db): Promise<KeyVoteLibrary> {
  const cards = await deck(db);
  const ids = [...new Set(cards.flatMap((card) => card.rollCalls.map((rc) => rc.sourceId)))];
  return { cards, sources: new Map((await sources(db, ids)).map((source) => [source.id, source])) };
}

/** VotePositions of some members on some roll calls, keyed by person then roll call. */
export async function positionsOf(
  db: Db,
  personIds: readonly string[],
  rollCallIds: readonly string[],
): Promise<Map<string, Map<string, Position>>> {
  const byPerson = new Map<string, Map<string, Position>>(personIds.map((id) => [id, new Map()]));
  if (personIds.length === 0 || rollCallIds.length === 0) return byPerson;
  const rows = await db
    .select({
      personId: t.votePositions.personId,
      rollCallId: t.votePositions.rollCallId,
      position: t.votePositions.position,
    })
    .from(t.votePositions)
    .where(
      and(
        inArray(t.votePositions.personId, [...personIds]),
        inArray(t.votePositions.rollCallId, [...rollCallIds]),
      ),
    );
  for (const row of rows) byPerson.get(row.personId)?.set(row.rollCallId, row.position);
  return byPerson;
}

export interface PartyTally {
  party: Party;
  yea: number;
  nay: number;
  present: number;
  notVoting: number;
}

export interface RollCallSummary {
  rollCall: RollCall;
  source: Source;
  measure: Measure | null;
  byParty: PartyTally[];
}

/** One roll call with its receipt, its measure, and Yea/Nay counts by party. */
export async function rollCallSummary(db: Db, id: string): Promise<RollCallSummary | null> {
  const [row] = await db.select().from(t.rollCalls).where(eq(t.rollCalls.id, id));
  if (!row) return null;
  const rollCall = m.rollCallFromRow(row);
  const [sourceRows, measureRows, tallies] = await Promise.all([
    sources(db, [rollCall.sourceId]),
    rollCall.measureId
      ? db.select().from(t.measures).where(eq(t.measures.id, rollCall.measureId))
      : Promise.resolve([]),
    db
      .select({ party: t.votePositions.party, position: t.votePositions.position, n: count() })
      .from(t.votePositions)
      .where(eq(t.votePositions.rollCallId, id))
      .groupBy(t.votePositions.party, t.votePositions.position),
  ]);
  const source = sourceRows[0];
  if (!source) return null;
  const parties = new Map<Party, PartyTally>();
  for (const tally of tallies) {
    const party = tally.party as Party;
    const entry = parties.get(party) ?? { party, yea: 0, nay: 0, present: 0, notVoting: 0 };
    if (tally.position === "Yea") entry.yea += tally.n;
    else if (tally.position === "Nay") entry.nay += tally.n;
    else if (tally.position === "Present") entry.present += tally.n;
    else entry.notVoting += tally.n;
    parties.set(party, entry);
  }
  return {
    rollCall,
    source,
    measure: measureRows[0] ? m.measureFromRow(measureRows[0]) : null,
    byParty: [...parties.values()].sort((a, b) => a.party.localeCompare(b.party)),
  };
}

const MEASURE_LABEL: Array<{ pattern: RegExp; type: MeasureType }> = [
  { pattern: /^h\.?\s*j\.?\s*res\.?$/, type: "hjres" },
  { pattern: /^s\.?\s*j\.?\s*res\.?$/, type: "sjres" },
  { pattern: /^h\.?\s*con\.?\s*res\.?$/, type: "hconres" },
  { pattern: /^s\.?\s*con\.?\s*res\.?$/, type: "sconres" },
  { pattern: /^h\.?\s*res\.?$/, type: "hres" },
  { pattern: /^s\.?\s*res\.?$/, type: "sres" },
  { pattern: /^h\.?\s*r\.?$/, type: "hr" },
  { pattern: /^s\.?$/, type: "s" },
];

/** "H.R. 22", "hr22", "S.J.Res. 37" or "119-hr-22" to a measure id in the 119th Congress. */
export function parseMeasureReference(text: string): string | null {
  const id = /\b(\d{2,3})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)\b/i.exec(text);
  if (id) return `${id[1]}-${id[2]!.toLowerCase()}-${id[3]}`;
  const label =
    /(?:^|[^a-z])((?:h|s)\.?\s*(?:j\.?\s*res|con\.?\s*res|res|r)?\.?)\s*(\d{1,5})\b/i.exec(text);
  if (!label) return null;
  const prefix = label[1]!.toLowerCase().trim();
  const match = MEASURE_LABEL.find(({ pattern }) => pattern.test(prefix));
  return match ? `119-${match.type}-${label[2]}` : null;
}

export interface MeasureSummary {
  measure: Measure;
  rollCalls: RollCall[];
  sources: Map<string, Source>;
}

/**
 * Measures by label ("H.R. 22"), by a published key vote's card title (which carries popular names like
 * "GENIUS Act" that official titles lack), or by words in their titles. Laws rank first, then the most
 * recent action. Each comes with its roll calls and receipts.
 */
export async function findMeasures(db: Db, text: string, limit: number): Promise<MeasureSummary[]> {
  const reference = parseMeasureReference(text);
  const ranked = [desc(t.measures.becameLaw), desc(t.measures.latestActionDate)];
  let rows: Array<typeof t.measures.$inferSelect> = [];
  if (reference) {
    rows = await db.select().from(t.measures).where(eq(t.measures.id, reference));
  }
  const phrase = text
    .trim()
    .replace(/[%_\\]/g, "")
    .replace(/^the\s+/i, "")
    .replace(/[?.!]+$/, "");
  if (rows.length === 0 && phrase.length >= 3) {
    const cards = await db
      .select({ measures: t.keyVotes.measures })
      .from(t.keyVotes)
      .where(
        and(
          eq(t.keyVotes.status, "published"),
          sql`${t.keyVotes.card}->>'title' ilike ${`%${phrase}%`}`,
        ),
      );
    const ids = [...new Set(cards.flatMap((card) => card.measures))];
    if (ids.length > 0) {
      rows = await db
        .select()
        .from(t.measures)
        .where(inArray(t.measures.id, ids))
        .orderBy(...ranked)
        .limit(limit);
    }
  }
  if (rows.length === 0) {
    const titleMatch = (value: string): SQL | undefined =>
      or(
        ilike(t.measures.titleDisplay, `%${value}%`),
        ilike(t.measures.titleShort, `%${value}%`),
        ilike(t.measures.titlePopular, `%${value}%`),
      );
    if (phrase.length >= 3) {
      rows = await db
        .select()
        .from(t.measures)
        .where(titleMatch(phrase))
        .orderBy(...ranked)
        .limit(limit);
    }
    const terms = words(phrase).filter((word) => word.length >= 4);
    if (rows.length === 0 && terms.length > 0) {
      rows = await db
        .select()
        .from(t.measures)
        .where(and(...terms.map((term) => titleMatch(term))))
        .orderBy(...ranked)
        .limit(limit);
    }
  }
  if (rows.length === 0) return [];
  const measures = rows.slice(0, limit).map(m.measureFromRow);
  const rollCallRows = await db
    .select()
    .from(t.rollCalls)
    .where(
      inArray(
        t.rollCalls.measureId,
        measures.map((measure) => measure.id),
      ),
    )
    .orderBy(asc(t.rollCalls.date), asc(t.rollCalls.number));
  const rollCalls = rollCallRows.map(m.rollCallFromRow);
  const sourceIds = [
    ...new Set([
      ...rollCalls.map((rollCall) => rollCall.sourceId),
      ...measures.flatMap((measure) => measure.sourceIds.slice(0, 1)),
    ]),
  ];
  const sourceMap = new Map((await sources(db, sourceIds)).map((source) => [source.id, source]));
  return measures.map((measure) => ({
    measure,
    rollCalls: rollCalls.filter((rollCall) => rollCall.measureId === measure.id),
    sources: sourceMap,
  }));
}

/** FEC aggregates for one person and cycle. Empty until finance data is ingested. */
export async function financeSummaries(
  db: Db,
  personId: string,
  cycle: number,
): Promise<FinanceSummary[]> {
  const rows = await db
    .select()
    .from(t.financeSummaries)
    .where(and(eq(t.financeSummaries.personId, personId), eq(t.financeSummaries.cycle, cycle)));
  return rows.map(m.financeSummaryFromRow);
}
