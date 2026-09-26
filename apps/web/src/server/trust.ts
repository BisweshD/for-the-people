import { getDb } from "@for-the-people/data";
import * as election from "@for-the-people/data/read/election";
import * as trust from "@for-the-people/data/read/trust";
import { cacheLife, cacheTag } from "next/cache";
import type { MethodReceiptId } from "@/lib/methods";
import { getRollCallTally, TAGS } from "@/server/data";

/**
 * Cached reads for the trust pages (/methodology, /sources, /changelog) and the election hub. Tagged so
 * ingestion jobs and curation runs revalidate them through the signed /api/revalidate endpoint.
 */

export const TRUST_TAGS = {
  sources: "sources",
  changelog: "changelog",
  electionDates: "election-dates",
} as const;

export async function getSourcesByPublisher() {
  "use cache";
  cacheLife("hours");
  cacheTag(TRUST_TAGS.sources, TAGS.status);
  return trust.sourcesByPublisher(await getDb());
}

const PUBLISHERS = {
  people: "unitedstates/congress-legislators (public domain)",
  measures: "U.S. Government Publishing Office (GovInfo)",
} as const;

export interface CountReceipts {
  people: string | null;
  /** Roll calls and the member votes on them come from the same files. */
  rollCalls: string | null;
  measures: string | null;
  keyVotes: MethodReceiptId;
  sources: string | null;
}

/**
 * The Receipt behind each count on Home and Status: the newest official file of the kind counted (as
 * each publisher row on /sources carries its newest Receipt), and the published method for key votes.
 */
export async function getCountReceipts(): Promise<CountReceipts> {
  const [publishers, tally] = await Promise.all([getSourcesByPublisher(), getRollCallTally()]);
  const latestOf = (publisher: string) =>
    publishers.find((row) => row.publisher === publisher)?.latestSourceId || null;
  const newest = publishers.reduce<(typeof publishers)[number] | null>(
    (latest, row) => (!latest || row.latestRetrievedAt > latest.latestRetrievedAt ? row : latest),
    null,
  );
  return {
    people: latestOf(PUBLISHERS.people),
    rollCalls: tally.latestSourceId,
    measures: latestOf(PUBLISHERS.measures),
    keyVotes: "method-key-votes",
    sources: newest?.latestSourceId || null,
  };
}

export async function getChangelog() {
  "use cache";
  cacheLife("hours");
  cacheTag(TRUST_TAGS.changelog, TAGS.keyVotes, TAGS.status);
  return trust.changelog(await getDb());
}

export async function getKeyVoteSelection() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  return trust.keyVoteSelection();
}

export async function getReviewSummary() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  return trust.reviewSummary(await getDb());
}

export async function getElectionDates() {
  "use cache";
  cacheLife("days");
  cacheTag(TRUST_TAGS.electionDates);
  return election.electionDates();
}

export async function getElectionSource(id: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TRUST_TAGS.electionDates);
  return election.electionSource(id);
}
