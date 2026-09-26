import type { Db } from "../db/client";
import * as t from "../db/schema";

/**
 * Every member's voting-record counts for this Congress (method-party-unity and method-missed-votes),
 * so a profile can say where one member's share sits among their chamber.
 */
export interface MemberStatsRow {
  personId: string;
  chamber: "house" | "senate";
  eligibleVotes: number;
  missedVotes: number;
  partyUnityEligible: number;
  partyUnityVotes: number;
}

export async function memberStatsRows(db: Db): Promise<MemberStatsRow[]> {
  return db
    .select({
      personId: t.memberStats.personId,
      chamber: t.memberStats.chamber,
      eligibleVotes: t.memberStats.eligibleVotes,
      missedVotes: t.memberStats.missedVotes,
      partyUnityEligible: t.memberStats.partyUnityEligible,
      partyUnityVotes: t.memberStats.partyUnityVotes,
    })
    .from(t.memberStats);
}
