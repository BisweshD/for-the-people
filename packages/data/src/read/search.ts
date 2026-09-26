import { desc, eq, max } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { members, type MemberSummary } from "./index";

/**
 * What the ⌘K palette searches: every member of the 119th Congress and every measure that reached a
 * recorded roll call. Titles only; summaries and positions stay out so the index stays small.
 */

export interface SearchMeasure {
  id: string;
  /** The display title, then the short and popular titles when they differ (all from the bill record). */
  title: string;
  otherTitles: string[];
  becameLaw: boolean;
  /** Date of the latest roll call on the measure; the index lists recent measures first. */
  lastVoteDate: string;
}

export interface SearchSource {
  members: MemberSummary[];
  measures: SearchMeasure[];
}

export async function searchSource(db: Db, today: string): Promise<SearchSource> {
  const [memberList, measureRows] = await Promise.all([
    members(db, today),
    db
      .select({
        id: t.measures.id,
        display: t.measures.titleDisplay,
        short: t.measures.titleShort,
        popular: t.measures.titlePopular,
        becameLaw: t.measures.becameLaw,
        lastVoteDate: max(t.rollCalls.date),
      })
      .from(t.measures)
      .innerJoin(t.rollCalls, eq(t.rollCalls.measureId, t.measures.id))
      .groupBy(t.measures.id)
      .orderBy(desc(max(t.rollCalls.date)), desc(t.measures.id)),
  ]);
  return {
    members: memberList,
    measures: measureRows.map((row) => ({
      id: row.id,
      title: row.display,
      otherTitles: [
        ...new Set([row.short, row.popular].filter((title): title is string => Boolean(title))),
      ].filter((title) => title !== row.display),
      becameLaw: row.becameLaw,
      lastVoteDate: row.lastVoteDate ?? "",
    })),
  };
}
