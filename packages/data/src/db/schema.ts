import type {
  KeyVote,
  Measure,
  Person,
  Portrait,
  Reviewer,
  RollCall,
  RollCallRef,
} from "@for-the-people/core";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Tables mirror the ontology in packages/core one-to-one.
 * test/schema-contract.test.ts proves every row maps to its core type and back.
 * No table stores raw addresses, individual donor data, or voter stances.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const day = (name: string) => date(name, { mode: "string" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });

export const chamberEnum = pgEnum("chamber", ["house", "senate"]);
export const positionEnum = pgEnum("position", ["Yea", "Nay", "Present", "NotVoting"]);

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  retrievedAt: ts("retrieved_at").notNull(),
  contentHash: text("content_hash").notNull(),
  notes: text("notes"),
});

export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    nickname: text("nickname"),
    suffix: text("suffix"),
    bioguide: text("bioguide").unique(),
    fecIds: text("fec_ids").array().notNull(),
    wikidata: text("wikidata"),
    ballotpedia: text("ballotpedia"),
    govtrack: integer("govtrack"),
    lis: text("lis"),
    portrait: jsonb("portrait").$type<Portrait>(),
    links: jsonb("links").$type<Person["links"]>().notNull(),
    sourceIds: text("source_ids").array().notNull(),
  },
  (table) => [
    index("people_last_name_idx").on(table.lastName),
    index("people_lis_idx").on(table.lis),
  ],
);

export const offices = pgTable("offices", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  chamber: chamberEnum("chamber").notNull(),
  title: text("title").notNull(),
  state: text("state").notNull(),
  seatClass: smallint("seat_class"),
});

export const districts = pgTable(
  "districts",
  {
    id: text("id").primaryKey(),
    state: text("state").notNull(),
    number: smallint("number").notNull(),
    mapVersion: text("map_version").notNull(),
    geometryRef: text("geometry_ref"),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (table) => [index("districts_state_idx").on(table.state, table.mapVersion)],
);

export const terms = pgTable(
  "terms",
  {
    id: text("id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    officeId: text("office_id")
      .notNull()
      .references(() => offices.id),
    chamber: chamberEnum("chamber").notNull(),
    state: text("state").notNull(),
    districtId: text("district_id").references(() => districts.id),
    party: text("party").notNull(),
    caucus: text("caucus"),
    start: day("start_date").notNull(),
    end: day("end_date").notNull(),
    sourceIds: text("source_ids").array().notNull(),
  },
  (table) => [
    index("terms_person_idx").on(table.personId),
    index("terms_district_idx").on(table.districtId),
    index("terms_state_idx").on(table.state, table.chamber),
  ],
);

export const elections = pgTable("elections", {
  id: text("id").primaryKey(),
  date: day("date").notNull(),
  type: text("type").notNull(),
  state: text("state"),
  name: text("name").notNull(),
  sourceIds: text("source_ids").array().notNull(),
});

export const races = pgTable(
  "races",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => elections.id),
    officeId: text("office_id")
      .notNull()
      .references(() => offices.id),
    chamber: chamberEnum("chamber").notNull(),
    state: text("state").notNull(),
    districtId: text("district_id").references(() => districts.id),
    sourceIds: text("source_ids").array().notNull(),
  },
  (table) => [
    index("races_state_idx").on(table.state),
    index("races_district_idx").on(table.districtId),
  ],
);

export const candidacies = pgTable(
  "candidacies",
  {
    id: text("id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    raceId: text("race_id")
      .notNull()
      .references(() => races.id),
    party: text("party").notNull(),
    status: text("status").notNull(),
    incumbent: boolean("incumbent").notNull(),
    fecCandidateId: text("fec_candidate_id"),
    sourceIds: text("source_ids").array().notNull(),
  },
  (table) => [
    index("candidacies_race_idx").on(table.raceId),
    index("candidacies_person_idx").on(table.personId),
  ],
);

export const measures = pgTable(
  "measures",
  {
    id: text("id").primaryKey(),
    congress: smallint("congress").notNull(),
    type: text("type").notNull(),
    number: integer("number").notNull(),
    titleDisplay: text("title_display").notNull(),
    titleOfficial: text("title_official").notNull(),
    titleShort: text("title_short"),
    titlePopular: text("title_popular"),
    sponsorId: text("sponsor_id").references(() => people.id),
    introducedDate: day("introduced_date"),
    latestAction: text("latest_action").notNull(),
    latestActionDate: day("latest_action_date").notNull(),
    becameLaw: boolean("became_law").notNull(),
    crsSummary: jsonb("crs_summary").$type<Measure["crsSummary"]>(),
    plainSummary: jsonb("plain_summary").$type<Measure["plainSummary"]>(),
    sourceIds: text("source_ids").array().notNull(),
  },
  (table) => [index("measures_sponsor_idx").on(table.sponsorId)],
);

export const rollCalls = pgTable(
  "roll_calls",
  {
    id: text("id").primaryKey(),
    chamber: chamberEnum("chamber").notNull(),
    congress: smallint("congress").notNull(),
    session: smallint("session").notNull(),
    number: integer("number").notNull(),
    date: day("date").notNull(),
    question: text("question").notNull(),
    result: text("result").notNull(),
    requires: text("requires"),
    title: text("title"),
    yea: smallint("yea").notNull(),
    nay: smallint("nay").notNull(),
    present: smallint("present").notNull(),
    notVoting: smallint("not_voting").notNull(),
    tieBreaker: jsonb("tie_breaker").$type<RollCall["tieBreaker"]>(),
    measureId: text("measure_id").references(() => measures.id),
    officialUrl: text("official_url").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (table) => [
    index("roll_calls_measure_idx").on(table.measureId),
    index("roll_calls_date_idx").on(table.chamber, table.date),
  ],
);

export const votePositions = pgTable(
  "vote_positions",
  {
    rollCallId: text("roll_call_id")
      .notNull()
      .references(() => rollCalls.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    position: positionEnum("position").notNull(),
    party: text("party").notNull(),
    state: text("state").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.rollCallId, table.personId] }),
    index("vote_positions_person_idx").on(table.personId),
  ],
);

export const issueAreas = pgTable("issue_areas", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
});

export const keyVotes = pgTable("key_votes", {
  id: text("id").primaryKey(),
  order: smallint("sort_order").notNull(),
  issueArea: text("issue_area")
    .notNull()
    .references(() => issueAreas.id),
  card: jsonb("card").$type<KeyVote["card"]>().notNull(),
  measures: text("measures").array().notNull(),
  rollCallRefs: jsonb("roll_call_refs").$type<RollCallRef[]>().notNull(),
  yeaLean: text("yea_lean").notNull(),
  status: text("status").notNull(),
  selectionReason: text("selection_reason").notNull(),
  reviewers: jsonb("reviewers").$type<Reviewer[]>().notNull(),
});

export const financeCommittees = pgTable("finance_committees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  designation: text("designation"),
  candidateId: text("candidate_id"),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
});

export const financeSummaries = pgTable(
  "finance_summaries",
  {
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    cycle: smallint("cycle").notNull(),
    financeCommitteeId: text("finance_committee_id")
      .notNull()
      .references(() => financeCommittees.id),
    receipts: money("receipts").notNull(),
    individual: money("individual").notNull(),
    smallDollarShare: numeric("small_dollar_share", { precision: 6, scale: 5, mode: "number" }),
    pacs: money("pacs").notNull(),
    party: money("party").notNull(),
    selfFunding: money("self_funding").notNull(),
    transfers: money("transfers").notNull().default(0),
    cashOnHand: money("cash_on_hand").notNull(),
    debts: money("debts").notNull(),
    inStateShare: numeric("in_state_share", { precision: 6, scale: 5, mode: "number" }),
    asOf: day("as_of").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (table) => [primaryKey({ columns: [table.personId, table.cycle, table.financeCommitteeId] })],
);

/** Derived from vote_positions after each ingestion run; never edited by hand. */
export const memberStats = pgTable("member_stats", {
  personId: text("person_id")
    .primaryKey()
    .references(() => people.id),
  chamber: chamberEnum("chamber").notNull(),
  congress: smallint("congress").notNull(),
  eligibleVotes: integer("eligible_votes").notNull(),
  missedVotes: integer("missed_votes").notNull(),
  partyUnityEligible: integer("party_unity_eligible").notNull(),
  partyUnityVotes: integer("party_unity_votes").notNull(),
  firstVoteDate: day("first_vote_date"),
  lastVoteDate: day("last_vote_date"),
  computedAt: ts("computed_at").notNull(),
});

export const ingestionRuns = pgTable("ingestion_runs", {
  id: text("id").primaryKey(),
  job: text("job").notNull(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  status: text("status").notNull(),
  stats: jsonb("stats").$type<Record<string, number>>().notNull(),
  notes: jsonb("notes").$type<string[]>().notNull(),
  error: text("error"),
});

export const corrections = pgTable("corrections", {
  id: text("id").primaryKey(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  targetField: text("target_field"),
  report: text("report").notNull(),
  status: text("status").notNull(),
  resolution: text("resolution"),
  submittedAt: ts("submitted_at").notNull(),
});

export const eventLog = pgTable(
  "event_log",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    at: ts("at").notNull(),
    reason: text("reason").notNull(),
    sourceIds: text("source_ids").array().notNull(),
    summary: jsonb("summary").$type<Record<string, string | number | boolean | null>>().notNull(),
  },
  (table) => [
    index("event_log_target_idx").on(table.targetKind, table.targetId),
    index("event_log_at_idx").on(table.at),
  ],
);

/** Runtime tables for abuse limits. Keys are salted hashes; no IP address or question text is stored. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);

export const aiSpend = pgTable("ai_spend", {
  day: day("day").primaryKey(),
  usd: numeric("usd", { precision: 10, scale: 4, mode: "number" }).notNull(),
  requests: integer("requests").notNull(),
});

export const askCache = pgTable("ask_cache", {
  key: text("key").primaryKey(),
  dataVersion: text("data_version").notNull(),
  response: jsonb("response").notNull(),
  createdAt: ts("created_at").notNull(),
});
