import { getDb } from "@for-the-people/data";
import * as read from "@for-the-people/data/read";
import { cacheLife, cacheTag } from "next/cache";
import { toTallyView, type RollCallTallyView } from "@/lib/roll-call-tally";
import {
  deckSourceIds,
  toCardViews,
  toMemberView,
  type CardView,
  type MemberView,
} from "@/lib/views";

/**
 * Cached reads for pages. Every function is a thin 'use cache' wrapper over the read layer, tagged so
 * ingestion jobs can revalidate exactly what changed through the signed /api/revalidate endpoint.
 */

export const TAGS = {
  keyVotes: "key-votes",
  members: "members",
  person: (id: string) => `person:${id}`,
  rollCall: (id: string) => `roll-call:${id}`,
  measure: (id: string) => `measure:${id}`,
  status: "status",
} as const;

export async function getDeck() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  return read.deck(await getDb());
}

/** The published deck as serializable card views, with the Receipt behind every roll call. */
export async function getDeckCards(): Promise<CardView[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  const db = await getDb();
  const deck = await read.deck(db);
  return toCardViews(deck, await read.sources(db, deckSourceIds(deck)));
}

export async function getKeyVoteRecord() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes, TAGS.members);
  return read.keyVoteRecord(await getDb());
}

export async function getMembers() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.members);
  const today = new Date().toISOString().slice(0, 10);
  return read.members(await getDb(), today);
}

/** Everyone who served in the 119th Congress, without portrait placeholders (small enough for lists and search). */
export async function getMemberIndex(): Promise<MemberView[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.members);
  const today = new Date().toISOString().slice(0, 10);
  return (await read.members(await getDb(), today)).map((member) => toMemberView(member));
}

export async function getPersonProfile(id: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.person(id), TAGS.members);
  return read.personProfile(await getDb(), id);
}

export async function getRollCallDetail(id: string) {
  "use cache";
  cacheLife("max");
  cacheTag(TAGS.rollCall(id));
  return read.rollCallDetail(await getDb(), id);
}

export async function getMeasureDetail(id: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.measure(id));
  return read.measureDetail(await getDb(), id);
}

export async function getSources(ids: string[]) {
  "use cache";
  cacheLife("days");
  return read.sources(await getDb(), ids);
}

export async function getStatus() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.status);
  return read.status(await getDb());
}

/** Home's roll-call figure: every roll call per chamber, with the ones behind a published key vote marked. */
export async function getRollCallTally(): Promise<RollCallTallyView> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.status, TAGS.keyVotes);
  const db = await getDb();
  const [tally, keyVotes] = await Promise.all([read.rollCallTally(db), read.publishedKeyVotes(db)]);
  const keyVoteRollCalls = new Set(
    keyVotes.flatMap((keyVote) => keyVote.rollCallRefs.map((ref) => ref.rollCallId)),
  );
  return toTallyView(tally, keyVoteRollCalls);
}
