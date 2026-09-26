import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CURATION_ACTIONS } from "@for-the-people/core";
import { and, asc, desc, eq, inArray, max, count, min } from "drizzle-orm";
import * as z from "zod";
import { workspaceRoot, type Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";

/**
 * Reads behind the trust pages: where our data comes from (/sources), what changed (/changelog), and how
 * cards are chosen and reviewed (/methodology). No function here writes.
 */

/** Postgres returns "2026-09-23 20:45:55.931-05"; the pages want ISO 8601. */
export function toIso(value: string): string {
  const normalized = value
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

export interface PublisherSummary {
  publisher: string;
  /** How many Receipts (one per fetch) we hold from this publisher. */
  sources: number;
  latestRetrievedAt: string;
  earliestRetrievedAt: string;
  /** One Receipt id from this publisher, the most recent, so the row itself can carry a receipt. */
  latestSourceId: string;
}

/** Every publisher behind a Receipt, with counts and fetch dates, most Receipts first. */
export async function sourcesByPublisher(db: Db): Promise<PublisherSummary[]> {
  const groups = await db
    .select({
      publisher: t.sources.publisher,
      sources: count(),
      latest: max(t.sources.retrievedAt),
      earliest: min(t.sources.retrievedAt),
    })
    .from(t.sources)
    .groupBy(t.sources.publisher)
    .orderBy(desc(count()));
  return Promise.all(
    groups.map(async (group) => {
      const [latest] = await db
        .select({ id: t.sources.id })
        .from(t.sources)
        .where(eq(t.sources.publisher, group.publisher))
        .orderBy(desc(t.sources.retrievedAt), asc(t.sources.id))
        .limit(1);
      return {
        publisher: group.publisher,
        sources: group.sources,
        latestRetrievedAt: toIso(group.latest ?? ""),
        earliestRetrievedAt: toIso(group.earliest ?? ""),
        latestSourceId: latest?.id ?? "",
      };
    }),
  );
}

export type ChangelogKind = "keyVote" | "ingestion";

/** Workflow order of the curation actions, for ordering steps logged in the same instant. */
const STAGE: Record<string, number> = {
  ProposeKeyVote: 1,
  VerifyKeyVote: 2,
  ApproveKeyVote: 3,
  PublishKeyVote: 4,
  RetireKeyVote: 5,
};

export interface ChangelogEntry {
  id: string;
  at: string;
  kind: ChangelogKind;
  /** A plain sentence for people, in the past tense. */
  sentence: string;
  /** Official records behind the change, when it has any. */
  sourceIds: string[];
  /** The key vote this entry is about, for linking. */
  keyVoteId: string | null;
  /** The data update's job ("votes", "keyvotes"), so runs of one update can be told apart. */
  job: string | null;
}

type Summary = Record<string, string | number | boolean | null>;

const quote = (title: string) => `“${title}”`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Turns one curation event into a sentence. Exported for tests. */
export function describeKeyVoteEvent(action: string, title: string, summary: Summary): string {
  const card = quote(title);
  switch (action) {
    case "ProposeKeyVote":
      return summary.created
        ? `Proposed the ${card} key vote, mapped to ${plural(Number(summary.rollCalls ?? 0), "roll call")}.`
        : `Updated the wording or roll calls of the ${card} key vote.`;
    case "VerifyKeyVote": {
      const verified = Number(summary.verified ?? 0);
      const total = Number(summary.total ?? 0);
      return verified === total
        ? `Checked the ${card} key vote against the official record: all ${plural(total, "roll call")} matched.`
        : `Checked the ${card} key vote against the official record: ${verified} of ${plural(total, "roll call")} matched, so it stays unpublished.`;
    }
    case "ApproveKeyVote":
      // Reviewers are AI unless a review is recorded as human (older events did not record the kind).
      return summary.status === "reviewed" || summary.status === "published"
        ? String(summary.reviewers ?? "").includes("(human)")
          ? String(summary.reviewers ?? "").includes("(ai)")
            ? `Two AI reviewers, prompted with different leanings, and a human reviewer approved the wording of the ${card} key vote.`
            : `Two reviewers with different leanings approved the wording of the ${card} key vote.`
          : `Two AI reviewers, prompted with different leanings, approved the wording of the ${card} key vote. Human review is pending.`
        : `Recorded reviews of the ${card} key vote; it needs two approvals from different leanings to publish.`;
    case "PublishKeyVote":
      return `Published the ${card} key vote.`;
    case "RetireKeyVote":
      return `Retired the ${card} key vote${summary.why ? `: ${String(summary.why)}` : ""}.`;
    default:
      return `Changed the ${card} key vote.`;
  }
}

const stat = (stats: Record<string, number>, key: string) => stats[key] ?? 0;

/**
 * A recount of party-line and missed votes: how many members it counted and, from the latest
 * congress-legislators run before it, how many of them have left this Congress (null when unknown).
 */
export interface Recount {
  members: number;
  former: number | null;
  /** Set on a recount of its own that started right after a congress-legislators run finished. */
  afterMemberUpdate?: true;
}

/**
 * "555 members, including 16 who left this Congress," as the subject of "voted with their party": the
 * aside closes with a comma.
 */
function recountWords(recount: Recount): string {
  const members = plural(recount.members, "member");
  return recount.former && recount.former < recount.members
    ? `${members}, including ${recount.former.toLocaleString("en-US")} who left this Congress,`
    : members;
}

/**
 * Turns one ingestion run into a plain sentence: what was updated, from where, and how much changed.
 * The congress-legislators files are a public-domain list kept by volunteers, not an official one, so
 * they are called "the public list of members of Congress". Exported for tests.
 */
export function describeIngestionRun(run: {
  job: string;
  status: string;
  stats: Record<string, number>;
  /** A stats run folded into this votes run (foldRecounts), or a stats run's own counts. */
  recount?: Recount;
  /** For a legislators run: how many members its term changes belong to (termMembersByRun). */
  termMembers?: number;
}): string {
  const partial =
    run.status === "partial" ? " Some records were set aside and noted for review." : "";
  // A count of zero is said in words ("no member changes"), never as "0 members".
  switch (run.job) {
    case "votes": {
      const parsed = stat(run.stats, "rollCalls.parsed");
      const written = stat(run.stats, "RecordRollCall.written");
      const changed =
        written === 0
          ? "None were new or changed"
          : `${written.toLocaleString("en-US")} ${written === 1 ? "was" : "were"} new or changed`;
      const then = run.recount
        ? ` Then recounted how often ${recountWords(run.recount)} voted with their party or missed a vote.`
        : "";
      return `Read ${plural(parsed, "roll call")} (recorded votes) from the House and the Senate. ${changed}.${then}${partial}`;
    }
    case "legislators": {
      // UpsertPerson writes a member's own record (name, ids, links); UpsertTerm writes a term in
      // office (its dates, party, office, district). A member is counted only when the term changes
      // were traced to members (termMembers); otherwise the terms are counted as terms.
      const members = stat(run.stats, "UpsertPerson.written");
      const terms = stat(run.stats, "UpsertTerm.written");
      if (members === 0 && terms === 0)
        return `Checked the public list of members of Congress. Nothing had changed.${partial}`;
      if (members === 0)
        return `${
          run.termMembers
            ? `Updated the terms in office of ${plural(run.termMembers, "member")} of Congress`
            : `Updated ${plural(terms, "term")} in office for members of Congress`
        } from the public member list. No member was added, and no other details changed.${partial}`;
      if (terms === 0)
        return `Updated member details for ${plural(members, "member")} of Congress from the public member list. No terms in office changed.${partial}`;
      const termWords = run.termMembers
        ? `the terms in office of ${run.termMembers.toLocaleString("en-US")}`
        : `${plural(terms, "term")} in office`;
      return `Updated member details for ${plural(members, "member")} of Congress and ${termWords}, from the public member list.${partial}`;
    }
    case "portraits": {
      // Status lists "without an official portrait" and "could not be read" apart; say both numbers so
      // the total never reads as a third, different count.
      const stored = stat(run.stats, "portraits.stored");
      const missing = stat(run.stats, "portraits.missing");
      const unreadable = stat(run.stats, "portraits.undecodable");
      const lead =
        stored === 0 ? "No new official portraits" : `Stored ${plural(stored, "official portrait")}`;
      if (missing + unreadable === 0) return `${lead}. Every member has one.${partial}`;
      const who = plural(missing + unreadable, "member");
      const show = missing + unreadable === 1 ? "shows" : "show";
      if (missing > 0 && unreadable > 0) {
        const none = `${missing.toLocaleString("en-US")} ${missing === 1 ? "has" : "have"} no official portrait`;
        const unread = `${unreadable.toLocaleString("en-US")} ${unreadable === 1 ? "has one" : "have one"} that could not be read`;
        return `${lead}. ${who} ${show} initials: ${none}, and ${unread}.${partial}`;
      }
      return missing > 0
        ? `${lead}. ${who} without an official portrait ${show} initials.${partial}`
        : `${lead}. ${who} whose portrait could not be read ${show} initials.${partial}`;
    }
    case "stats": {
      const recount = run.recount ?? { members: stat(run.stats, "memberStats.rows"), former: null };
      return `${recount.afterMemberUpdate ? "After the member update, recounted" : "Recounted"} how often ${recountWords(recount)} voted with their party or missed a vote.${partial}`;
    }
    case "keyvotes": {
      const checked = stat(run.stats, "VerifyKeyVote.written");
      return checked === 0
        ? `Ran the key-vote checks; no key vote needed re-checking.${partial}`
        : `Re-checked ${plural(checked, "key vote")} against the official record.${partial}`;
    }
    case "fec": {
      const written = stat(run.stats, "UpsertFinanceSummary.written");
      return written === 0
        ? `Checked 2026 races, candidate filings, and campaign money totals from the FEC. Nothing had changed.${partial}`
        : `Updated 2026 races, candidate filings, and campaign money totals from the FEC. ${written.toLocaleString("en-US")} ${written === 1 ? "total was" : "totals were"} new or changed.${partial}`;
    }
    case "fec-aggregates":
      return `Updated campaign money totals from the FEC for ${plural(stat(run.stats, "fecAggregates.members"), "member")}: how much came in donations of $200 or less, and how much from inside their state.${partial}`;
    default:
      return `Ran a data update from official sources.${partial}`;
  }
}

/** A run's stats as a stable string, so two runs with the same counts compare equal. */
const statsKey = (stats: Record<string, number>): string =>
  JSON.stringify(Object.entries(stats).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * Drops a run that repeats another run of the same job with the same status and identical stats,
 * finishing in the same minute (a job started twice by one schedule tick). The first one listed is kept,
 * so pass runs newest first to keep the latest. Exported for tests.
 */
export function dropRepeatedRuns<
  T extends {
    job: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    stats: Record<string, number>;
  },
>(runs: readonly T[]): T[] {
  const seen = new Set<string>();
  return runs.filter((run) => {
    const minute = toIso(run.finishedAt ?? run.startedAt).slice(0, 16);
    const key = `${run.job}|${run.status}|${minute}|${statsKey(run.stats)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The votes job starts the recount the moment it finishes; a minute allows for a slow start. */
const RECOUNT_FOLLOWS_MS = 60_000;

/**
 * Every stats run gets its Recount: its member count, and how many members had left this Congress
 * by the latest congress-legislators run before it ("people.historical"). A stats run that started
 * within a minute of a votes run finishing is that read's own recount: it moves onto the votes run
 * and leaves the list. One that started within a minute of a legislators run finishing stays a row
 * of its own, marked as following that member update. Pass runs newest first. Exported for tests.
 */
export function foldRecounts<
  T extends {
    job: string;
    startedAt: string;
    finishedAt: string | null;
    stats: Record<string, number>;
  },
>(runs: readonly T[]): Array<T & { recount?: Recount }> {
  const time = (value: string) => Date.parse(toIso(value));
  const out: Array<T & { recount?: Recount }> = runs.map((run) => ({ ...run }));
  const folded = new Set<T & { recount?: Recount }>();
  for (const stats of out) {
    if (stats.job !== "stats") continue;
    const start = time(stats.startedAt);
    const legislators = out.find(
      (run) => run.job === "legislators" && time(run.finishedAt ?? run.startedAt) <= start,
    );
    const historical = legislators?.stats["people.historical"];
    stats.recount = {
      members: stat(stats.stats, "memberStats.rows"),
      former: historical === undefined ? null : historical,
    };
    const read = out.find((run) => {
      if (run.job !== "votes" || run.recount) return false;
      const gap = start - time(run.finishedAt ?? run.startedAt);
      return gap >= 0 && gap <= RECOUNT_FOLLOWS_MS;
    });
    if (read) {
      read.recount = stats.recount;
      folded.add(stats);
    } else if (legislators) {
      // Not a roll-call read's recount, so it keeps its own row; right after a member update, it
      // says so, rather than appearing out of nowhere.
      const gap = start - time(legislators.finishedAt ?? legislators.startedAt);
      if (gap <= RECOUNT_FOLLOWS_MS) stats.recount.afterMemberUpdate = true;
    }
  }
  return out.filter((run) => !folded.has(run));
}

/**
 * How many members each legislators run's term changes belong to, keyed by the run's start (ISO). Every
 * action a run takes is logged at the run's start, and each UpsertTerm event names its member.
 */
async function termMembersByRun(db: Db, starts: readonly string[]): Promise<Map<string, number>> {
  if (starts.length === 0) return new Map();
  const events = await db
    .select({ at: t.eventLog.at, summary: t.eventLog.summary })
    .from(t.eventLog)
    .where(and(eq(t.eventLog.action, "UpsertTerm"), inArray(t.eventLog.at, [...starts])));
  const members = new Map<string, Set<string>>();
  for (const event of events) {
    const key = toIso(event.at);
    const people = members.get(key) ?? new Set<string>();
    if (typeof event.summary.personId === "string") people.add(event.summary.personId);
    members.set(key, people);
  }
  return new Map([...members].map(([key, people]) => [key, people.size]));
}

/** The public changelog: card curation and data updates, newest first. */
/**
 * Every curation step and every successful data update, newest first. There is no cap: the page promises
 * every change, and a cap let a burst of key-vote steps push older data updates off the log. (The page
 * shows the newest changes first and folds the rest behind "Show older changes".) `limit` is for callers
 * that want only the newest few.
 */
export async function changelog(db: Db, limit?: number): Promise<ChangelogEntry[]> {
  const [events, runs] = await Promise.all([
    db
      .select({ event: t.eventLog, card: t.keyVotes.card })
      .from(t.eventLog)
      .leftJoin(t.keyVotes, eq(t.keyVotes.id, t.eventLog.targetId))
      .where(
        inArray(t.eventLog.action, [...CURATION_ACTIONS.filter((a) => a !== "UpsertIssueArea")]),
      )
      .orderBy(desc(t.eventLog.at))
      .limit(limit ?? Number.MAX_SAFE_INTEGER),
    db
      .select()
      .from(t.ingestionRuns)
      .where(inArray(t.ingestionRuns.status, ["succeeded", "partial"]))
      .orderBy(desc(t.ingestionRuns.startedAt))
      .limit(limit ?? Number.MAX_SAFE_INTEGER),
  ]);
  const termMembers = await termMembersByRun(
    db,
    runs
      .filter((run) => run.job === "legislators" && stat(run.stats, "UpsertTerm.written") > 0)
      .map((run) => run.startedAt),
  );
  const entries: Array<ChangelogEntry & { stage: number }> = [
    ...events.map(({ event, card }) => ({
      id: event.id,
      at: toIso(event.at),
      kind: "keyVote" as const,
      stage: STAGE[event.action] ?? 0,
      sentence: describeKeyVoteEvent(event.action, card?.title ?? event.targetId, event.summary),
      sourceIds: event.sourceIds,
      keyVoteId: event.targetId,
      job: null,
    })),
    ...foldRecounts(dropRepeatedRuns(runs)).map((run) => ({
      id: run.id,
      at: toIso(run.finishedAt ?? run.startedAt),
      kind: "ingestion" as const,
      stage: 0,
      sentence: describeIngestionRun({
        ...run,
        termMembers: termMembers.get(toIso(run.startedAt)),
      }),
      sourceIds: [],
      keyVoteId: null,
      job: run.job,
    })),
  ];
  // Newest first; steps logged in the same instant list in reverse workflow order, so a key vote's
  // Publish sits above its Approve, Verify, and Propose, never interleaved.
  return entries
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.stage - a.stage))
    .slice(0, limit)
    .map(({ stage: _stage, ...entry }) => entry);
}

const SelectionFile = z.object({
  selectionRule: z.object({
    version: z.string(),
    criteria: z.array(z.string().min(1)).min(1),
    reviewRequired: z.string().min(1),
  }),
  gaps: z.array(z.object({ issueArea: z.string(), finding: z.string(), productRule: z.string() })),
  excluded: z.array(z.object({ measure: z.string(), reason: z.string() })),
});

export interface KeyVoteSelection {
  version: string;
  criteria: string[];
  reviewRequired: string;
  gaps: Array<{ issueArea: string; finding: string; productRule: string }>;
  excluded: Array<{ measure: string; reason: string }>;
}

/** The selection rule, known gaps, and exclusions, read from the curated file in data/key-votes.json. */
export async function keyVoteSelection(): Promise<KeyVoteSelection> {
  const raw = JSON.parse(await readFile(join(workspaceRoot(), "data", "key-votes.json"), "utf8"));
  const file = SelectionFile.parse(raw);
  return { ...file.selectionRule, gaps: file.gaps, excluded: file.excluded };
}

export interface ReviewSummary {
  publishedCards: number;
  /** Reviewer kinds and leanings across published cards, for example "ai:progressive" to 14. */
  reviewers: Array<{ kind: "human" | "ai"; leaning: string; cards: number }>;
  humanReviewedCards: number;
}

/** Who approved the published cards, so /methodology states it from the data rather than from memory. */
export async function reviewSummary(db: Db): Promise<ReviewSummary> {
  const rows = await db.select().from(t.keyVotes).where(eq(t.keyVotes.status, "published"));
  const keyVotes = rows.map(m.keyVoteFromRow);
  const tally = new Map<string, { kind: "human" | "ai"; leaning: string; cards: number }>();
  for (const keyVote of keyVotes) {
    const seen = new Set<string>();
    for (const reviewer of keyVote.reviewers) {
      if (reviewer.verdict !== "approved") continue;
      const key = `${reviewer.kind}:${reviewer.leaning}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = tally.get(key) ?? { kind: reviewer.kind, leaning: reviewer.leaning, cards: 0 };
      entry.cards++;
      tally.set(key, entry);
    }
  }
  return {
    publishedCards: keyVotes.length,
    reviewers: [...tally.values()].sort(
      (a, b) => b.cards - a.cards || (a.leaning < b.leaning ? -1 : 1),
    ),
    humanReviewedCards: keyVotes.filter((keyVote) =>
      keyVote.reviewers.some(
        (reviewer) => reviewer.kind === "human" && reviewer.verdict === "approved",
      ),
    ).length,
  };
}
