import { cacheLife, cacheTag } from "next/cache";
import { positionsFor } from "@/lib/matching";
import { getDeckCards, getKeyVoteRecord, getMemberIndex, TAGS } from "@/server/data";

/** Cached reads for share cards. Everything here is public record; no voter data reaches the server. */

export interface DuelAgreement {
  /** Key votes where both members voted Yea or Nay on the same roll call. */
  shared: number;
  /** Of those, how many they voted the same way. */
  agreed: number;
}

/**
 * How often two members voted the same way on the published key votes. For each card, the decisive
 * roll call both voted Yea or Nay on counts (else any roll call they share); members of different
 * chambers share none.
 */
export async function getDuelAgreement(a: string, b: string): Promise<DuelAgreement> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes, TAGS.members);
  const [cards, record] = await Promise.all([getDeckCards(), getKeyVoteRecord()]);
  const first = positionsFor(record, a);
  const second = positionsFor(record, b);
  let shared = 0;
  let agreed = 0;
  for (const card of cards) {
    const both = card.rollCalls
      .filter((rollCall) => {
        const x = first.get(rollCall.id);
        const y = second.get(rollCall.id);
        return (x === "Yea" || x === "Nay") && (y === "Yea" || y === "Nay");
      })
      .toSorted((x, y) => Number(y.decisive) - Number(x.decisive));
    const rollCall = both[0];
    if (!rollCall) continue;
    shared += 1;
    if (first.get(rollCall.id) === second.get(rollCall.id)) agreed += 1;
  }
  return { shared, agreed };
}

/** A member as share cards show them, or null for an unknown id. */
export async function getShareMember(id: string) {
  const members = await getMemberIndex();
  return members.find((member) => member.id === id) ?? null;
}
