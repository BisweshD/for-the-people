import { getDb } from "@for-the-people/data";
import * as read from "@for-the-people/data/read";
import { cacheLife, cacheTag } from "next/cache";
import { TAGS } from "./data";

/** Cached reads for /explore that data.ts does not already provide. */
export async function getIssueAreas() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  return (await read.issueAreas(await getDb())).map(({ id, label, icon }) => ({ id, label, icon }));
}

/** Every member's party-line record, for the Explore map before the voter has answered. */
export async function getPartyUnity() {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.members);
  return read.partyUnityRecord(await getDb());
}
