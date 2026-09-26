import { getDb } from "@for-the-people/data";
import { duel } from "@for-the-people/data/read/duel";
import { cacheLife, cacheTag } from "next/cache";
import type { DuelView } from "@/lib/duel";
import { measureLabel } from "@/lib/format";
import { toReceipt } from "@/lib/views";
import { TAGS } from "./data";

/** Cached Vote Duel reads: every roll call two members share in the 119th Congress, with a Receipt on each. */
export async function getDuel(aId: string, bId: string): Promise<DuelView> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.person(aId), TAGS.person(bId), TAGS.members);
  const record = await duel(await getDb(), aId, bId);
  return {
    aId: record.aId,
    bId: record.bId,
    congress: record.congress,
    shared: record.shared,
    agreed: record.agreed,
    split: record.split,
    bothRecorded: record.bothRecorded,
    firstDate: record.firstDate,
    lastDate: record.lastDate,
    months: record.months,
    splits: record.splits.map(({ rollCall, source, a, b }) => ({
      a,
      b,
      rollCall: {
        id: rollCall.id,
        chamber: rollCall.chamber,
        number: rollCall.number,
        date: rollCall.date,
        question: rollCall.question,
        title: rollCall.title,
        result: rollCall.result,
        requires: rollCall.requires,
        totals: rollCall.totals,
        tieBreaker: rollCall.tieBreaker,
        officialUrl: rollCall.officialUrl,
        measureId: rollCall.measureId,
        measureLabel: rollCall.measureId ? measureLabel(rollCall.measureId) : null,
        receipt: toReceipt(source),
      },
    })),
  };
}
