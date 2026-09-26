import * as z from "zod";
import { type ActionSpec } from "../../actions/runner";
import type { Db } from "../../db/client";
import { memberStats, rollCalls, terms, votePositions } from "../../db/schema";
import type { IngestContext } from "../context";
import { eq } from "drizzle-orm";

/**
 * Derived member statistics, rebuilt from VotePositions after each votes run.
 * Missed votes: Not Voting among roll calls held while the member served.
 * Party unity: on roll calls where most Democrats and most Republicans voted opposite ways, how often the
 * member voted with most of their own party. Independents count with the party they caucus with.
 */

interface Tally {
  chambers: Map<string, number>;
  eligible: number;
  missed: number;
  unityEligible: number;
  unityVotes: number;
  first: string | null;
  last: string | null;
}

type Bloc = "D" | "R";

export async function computeStats(db: Db): Promise<Map<string, Tally>> {
  const [allPositions, calls, termRows] = await Promise.all([
    db
      .select({
        rollCallId: votePositions.rollCallId,
        personId: votePositions.personId,
        position: votePositions.position,
        party: votePositions.party,
      })
      .from(votePositions),
    db
      .select({ id: rollCalls.id, date: rollCalls.date, chamber: rollCalls.chamber })
      .from(rollCalls),
    db
      .select({
        personId: terms.personId,
        caucus: terms.caucus,
        start: terms.start,
        end: terms.end,
      })
      .from(terms),
  ]);
  const caucus = new Map(
    termRows.filter((row) => row.caucus).map((row) => [row.personId, row.caucus]),
  );
  const callInfo = new Map(calls.map((call) => [call.id, call]));
  // Roster-lag entries after a seat became vacant are part of the record but are not the member's missed votes.
  const termsByPerson = Map.groupBy(termRows, (row) => row.personId);
  const serving = (personId: string, date: string) =>
    (termsByPerson.get(personId) ?? []).some((term) => term.start <= date && date <= term.end);
  const positions = allPositions.filter((row) => {
    const call = callInfo.get(row.rollCallId);
    return call !== undefined && serving(row.personId, call.date);
  });
  const blocOf = (personId: string, party: string): Bloc | null => {
    const bloc = party === "D" || party === "R" ? party : caucus.get(personId);
    return bloc === "D" || bloc === "R" ? bloc : null;
  };

  const sides = new Map<string, Record<Bloc, { yea: number; nay: number }>>();
  for (const row of positions) {
    const bloc = blocOf(row.personId, row.party);
    if (!bloc || (row.position !== "Yea" && row.position !== "Nay")) continue;
    const entry = sides.get(row.rollCallId) ?? { D: { yea: 0, nay: 0 }, R: { yea: 0, nay: 0 } };
    entry[bloc][row.position === "Yea" ? "yea" : "nay"]++;
    sides.set(row.rollCallId, entry);
  }
  const majority = (side: { yea: number; nay: number }) =>
    side.yea > side.nay ? "Yea" : side.nay > side.yea ? "Nay" : null;
  const unity = new Map<string, Record<Bloc, "Yea" | "Nay">>();
  for (const [rollCallId, entry] of sides) {
    const d = majority(entry.D);
    const r = majority(entry.R);
    if (d && r && d !== r) unity.set(rollCallId, { D: d, R: r });
  }

  const tallies = new Map<string, Tally>();
  for (const row of positions) {
    const call = callInfo.get(row.rollCallId);
    if (!call) continue;
    const tally = tallies.get(row.personId) ?? {
      chambers: new Map(),
      eligible: 0,
      missed: 0,
      unityEligible: 0,
      unityVotes: 0,
      first: null,
      last: null,
    };
    tally.chambers.set(call.chamber, (tally.chambers.get(call.chamber) ?? 0) + 1);
    tally.eligible++;
    if (row.position === "NotVoting") tally.missed++;
    tally.first = !tally.first || call.date < tally.first ? call.date : tally.first;
    tally.last = !tally.last || call.date > tally.last ? call.date : tally.last;
    const split = unity.get(row.rollCallId);
    const bloc = blocOf(row.personId, row.party);
    if (split && bloc && (row.position === "Yea" || row.position === "Nay")) {
      tally.unityEligible++;
      if (split[bloc] === row.position) tally.unityVotes++;
    }
    tallies.set(row.personId, tally);
  }
  return tallies;
}

export const refreshDerivedStats: ActionSpec<z.ZodObject<{ congress: z.ZodNumber }>, number> = {
  name: "RefreshDerivedStats",
  input: z.object({ congress: z.number().int() }),
  async run(tx, { congress }, ctx) {
    const tallies = await computeStats(tx);
    await tx.delete(memberStats).where(eq(memberStats.congress, congress));
    const rows = [...tallies].map(([personId, tally]) => ({
      personId,
      chamber: [...tally.chambers].sort((a, b) => b[1] - a[1])[0]![0] as "house" | "senate",
      congress,
      eligibleVotes: tally.eligible,
      missedVotes: tally.missed,
      partyUnityEligible: tally.unityEligible,
      partyUnityVotes: tally.unityVotes,
      firstVoteDate: tally.first,
      lastVoteDate: tally.last,
      computedAt: ctx.now.toISOString(),
    }));
    for (let index = 0; index < rows.length; index += 500)
      await tx.insert(memberStats).values(rows.slice(index, index + 500));
    return {
      kind: "written",
      result: rows.length,
      target: { kind: "memberStats", id: String(congress) },
      sourceIds: [],
      summary: { members: rows.length },
    };
  },
};

export async function ingestStats(context: IngestContext): Promise<void> {
  const result = await context.act(refreshDerivedStats, { congress: 119 });
  if (result.ok) context.count("memberStats.rows", result.value);
}
