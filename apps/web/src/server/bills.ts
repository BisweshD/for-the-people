import { getDb } from "@for-the-people/data";
import * as bills from "@for-the-people/data/read/bills";
import { cacheLife, cacheTag } from "next/cache";
import {
  featuredBoard,
  keyRollCallIds,
  toBoardView,
  toMeasureView,
  toRollCallView,
  toSponsorView,
  type BillPageView,
  type BoardView,
  type MeasureView,
} from "@/lib/bill-views";
import { measureLabel } from "@/lib/format";
import { measureShortName } from "@/lib/outcomes";
import { TAGS } from "@/server/data";

/**
 * Cached reads for the bill page and the roll call page. Thin 'use cache' wrappers over
 * `@for-the-people/data/read/bills`, tagged like `server/data.ts` so ingestion can revalidate them.
 */

/** Measures on published key-vote cards: the bill pages prerendered at build. */
export async function getKeyVoteMeasureIds(): Promise<string[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  return bills.keyVoteMeasureIds(await getDb());
}

/** Roll calls on published key-vote cards: the roll call pages prerendered at build. */
export async function getKeyVoteRollCallIds(): Promise<string[]> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.keyVotes);
  return bills.keyVoteRollCallIds(await getDb());
}

/** Everything the bill page shows, as serializable views with the Receipt behind each fact. */
export async function getBillPage(id: string): Promise<BillPageView | null> {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.measure(id), TAGS.keyVotes);
  const db = await getDb();
  const page = await bills.measurePage(db, id);
  if (!page) return null;
  const measure = toMeasureView(page.measure, page.sources, page.rollCalls);
  if (!measure) return null;
  const sources = new Map(page.sources.map((source) => [source.id, source]));
  const refs = new Map(
    page.keyVotes.flatMap((keyVote) => keyVote.rollCallRefs.map((ref) => [ref.rollCallId, ref])),
  );
  const seatData = await Promise.all(
    keyRollCallIds(page).map((rollCallId) => bills.rollCallSeats(db, rollCallId)),
  );
  const chamberBoards = seatData.flatMap((data) =>
    data ? [toBoardView(data, page.keyVotes)] : [],
  );
  const card = page.keyVotes[0];
  return {
    measure,
    sponsor: page.sponsor ? toSponsorView(page.sponsor) : null,
    rollCalls: page.rollCalls.flatMap((rollCall) => {
      const source = sources.get(rollCall.sourceId);
      return source ? [toRollCallView(rollCall, source, refs.get(rollCall.id))] : [];
    }),
    card: card
      ? {
          id: card.id,
          title: card.card.title,
          question: card.card.question,
          yeaMeans: card.card.yeaMeans,
          whatItDoes: card.card.whatItDoes,
          refs: card.rollCallRefs.map((ref) => ({
            rollCallId: ref.rollCallId,
            yeaSupportsMeasure: ref.yeaSupportsMeasure,
          })),
        }
      : null,
    featured: featuredBoard(chamberBoards),
    chamberBoards,
  };
}

export interface RollCallPageView {
  board: BoardView;
  measure: Pick<MeasureView, "id" | "label" | "title" | "shortName"> | null;
}

/** One roll call with every member's VotePosition, for /votes/[id]. */
export async function getRollCallPage(id: string): Promise<RollCallPageView | null> {
  "use cache";
  cacheLife("max");
  cacheTag(TAGS.rollCall(id), TAGS.keyVotes);
  const db = await getDb();
  const [data, keyVotes] = await Promise.all([
    bills.rollCallSeats(db, id),
    bills.keyVotesForRollCall(db, id),
  ]);
  if (!data) return null;
  return {
    board: toBoardView(data, keyVotes),
    measure: data.measure
      ? {
          id: data.measure.id,
          label: measureLabel(data.measure.id),
          title: data.measure.titles.display,
          shortName: measureShortName(data.measure.titles),
        }
      : null,
  };
}
