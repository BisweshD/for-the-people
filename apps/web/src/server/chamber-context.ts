import { getDb } from "@for-the-people/data";
import { memberStatsRows } from "@for-the-people/data/read/member-stats";
import { cacheLife, cacheTag } from "next/cache";
import { chamberContext, type ChamberContext } from "@/lib/chamber-range";
import { missedVotesRule } from "@/lib/voting-record";
import { getMemberIndex, TAGS } from "./data";

/**
 * Where most members of each chamber fall on voting with their party and on missed votes, computed
 * from every member's record in member_stats (the same counts each profile shows).
 */
export async function getChamberContext(): Promise<Record<"house" | "senate", ChamberContext>> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.members);
  const [rows, members] = await Promise.all([memberStatsRows(await getDb()), getMemberIndex()]);
  const notShare = new Set(
    members.filter((member) => missedVotesRule(member).kind !== "share").map((member) => member.id),
  );
  return {
    house: chamberContext(rows, "house", notShare),
    senate: chamberContext(rows, "senate", notShare),
  };
}
