import {
  rollCallId,
  type Measure,
  type MeasureId,
  type RollCall,
  type StateCode,
  type VotePosition,
} from "@for-the-people/core";
import { eq } from "drizzle-orm";
import { recordRollCall, removeRollCall, upsertMeasure } from "../../actions/ingestion";
import { people, terms } from "../../db/schema";
import type { IngestContext } from "../context";
import { parseBillStatus } from "../parsers/billstatus";
import {
  parseHouseRollCall,
  type HousePositionDraft,
  type HouseRollCallSkip,
} from "../parsers/clerk";
import { parseSenateRollCall, type SenatePositionDraft } from "../parsers/senate";
import { parseSenateVoteMenu } from "../parsers/senate-menu";
import { billStatusUrl, houseRollUrl, senateVoteMenuUrl, senateVoteUrl } from "../sources";
import { fetchCongressGovMeasure } from "./congress-gov";

/** Every 119th-Congress roll call in both chambers, with every member's VotePosition and the measures they touch. */

const HOUSE_YEARS = [2025, 2026] as const;
const SENATE_SESSIONS = [1, 2] as const;

interface PendingRollCall {
  rollCall: RollCall;
  house?: HousePositionDraft[];
  senate?: SenatePositionDraft[];
}

/** The roll call the Clerk file for one year's roll number holds: odd years are session 1. */
export function expectedHouseRollCallId(year: number, roll: number): string {
  const congress = Math.floor((year - 1789) / 2) + 1;
  return rollCallId("house", congress, year % 2 === 1 ? 1 : 2, roll);
}

export type HouseSkipDecision = { remove: true } | { remove: false; note: string };

/**
 * Whether a skipped House roll call may be taken out of the database (an earlier parser may have
 * stored it). Only a quorum call or a roll call with no recorded votes is removed, and only when the
 * file names the roll call that was requested. Any other skip may be a passing anomaly in the feed,
 * so the stored row (and its VotePositions) stays and the run notes it.
 */
export function houseSkipDecision(
  skip: HouseRollCallSkip,
  requested: { year: number; roll: number },
): HouseSkipDecision {
  const expected = expectedHouseRollCallId(requested.year, requested.roll);
  if (skip.id !== expected)
    return {
      remove: false,
      note: `Kept ${skip.id}: the file requested for ${expected} names ${skip.id}.`,
    };
  if (skip.cause === "quorum" || skip.cause === "noVotes") return { remove: true };
  return { remove: false, note: `Kept ${skip.id} as stored: ${skip.reason}` };
}

async function collectHouse(context: IngestContext, pending: PendingRollCall[]): Promise<void> {
  for (const year of HOUSE_YEARS) {
    for (let roll = 1; ; roll++) {
      const url = houseRollUrl(year, roll);
      const raw = await context.fetch(url, { acceptStatuses: [404] });
      if (raw.status === 404) break;
      const { source } = await context.fetchWithSource(url);
      const parsed = parseHouseRollCall(raw.body.toString("utf8"), year);
      if (parsed.kind === "skipped") {
        context.count("rollCalls.skipped");
        context.note(`Skipped ${parsed.id}: ${parsed.reason}`);
        const decision = houseSkipDecision(parsed, { year, roll });
        // An earlier parser may have stored a quorum call; take it out so missed votes stay true.
        if (decision.remove)
          await context.act(removeRollCall, {
            rollCallId: parsed.id,
            why: parsed.reason,
            sourceIds: [source.id],
          });
        else context.note(decision.note);
        continue;
      }
      pending.push({
        rollCall: { ...parsed.rollCall, sourceId: source.id },
        house: parsed.positions,
      });
    }
  }
}

async function collectSenate(context: IngestContext, pending: PendingRollCall[]): Promise<void> {
  for (const session of SENATE_SESSIONS) {
    const menu = await context.fetch(senateVoteMenuUrl(119, session), {
      maxAgeMs: 6 * 60 * 60 * 1000,
    });
    for (const { number } of parseSenateVoteMenu(menu.body.toString("utf8"))) {
      const { raw, source } = await context.fetchWithSource(senateVoteUrl(119, session, number));
      const parsed = parseSenateRollCall(raw.body.toString("utf8"));
      pending.push({
        rollCall: { ...parsed.rollCall, sourceId: source.id },
        senate: parsed.positions,
      });
    }
  }
}

/** Measures referenced by roll calls, from GovInfo BILLSTATUS, falling back to the Congress.gov API. */
export async function ingestMeasures(
  context: IngestContext,
  ids: readonly MeasureId[],
  knownPeople: ReadonlySet<string>,
): Promise<Set<MeasureId>> {
  const stored = new Set<MeasureId>();
  for (const id of ids) {
    const [congress, type, number] = id.split("-") as [string, string, string];
    const url = billStatusUrl(Number(congress), type, Number(number));
    const raw = await context.fetch(url, { acceptStatuses: [404], maxAgeMs: 24 * 60 * 60 * 1000 });
    let measure: Measure | null = null;
    if (raw.status === 200) {
      try {
        const parsed = parseBillStatus(raw.body.toString("utf8"));
        const { source } = await context.fetchWithSource(url, { maxAgeMs: 24 * 60 * 60 * 1000 });
        const sponsorId =
          parsed.sponsorBioguide && knownPeople.has(parsed.sponsorBioguide)
            ? parsed.sponsorBioguide
            : null;
        measure = {
          ...parsed.measure,
          sponsorId,
          crsSummary: parsed.crsSummary ? { ...parsed.crsSummary, sourceId: source.id } : null,
          plainSummary: null,
          sourceIds: [source.id],
        };
      } catch (error) {
        context.note(
          `BILLSTATUS for ${id} did not match the expected shape: ${String(error).slice(0, 160)}`,
        );
      }
    }
    if (!measure) {
      measure = await fetchCongressGovMeasure(context, id, knownPeople);
      if (measure) context.count("measures.fromCongressGov");
    }
    if (!measure) {
      context.note(
        `No official record found for ${id}; roll calls on it are stored without a measure link.`,
      );
      continue;
    }
    const result = await context.act(upsertMeasure, measure);
    if (result.ok) stored.add(id);
  }
  return stored;
}

export async function ingestVotes(context: IngestContext): Promise<void> {
  const pending: PendingRollCall[] = [];
  await collectHouse(context, pending);
  await collectSenate(context, pending);
  context.count("rollCalls.parsed", pending.length);

  const personRows = await context.db.select({ id: people.id, lis: people.lis }).from(people);
  const knownPeople = new Set(personRows.map((row) => row.id));
  const byLis = new Map(personRows.filter((row) => row.lis).map((row) => [row.lis!, row.id]));
  const houseTerms = await context.db
    .select({ personId: terms.personId, state: terms.state })
    .from(terms)
    .where(eq(terms.chamber, "house"));
  const homeState = new Map(houseTerms.map((term) => [term.personId, term.state as StateCode]));

  const measureIds = [
    ...new Set(
      pending
        .map(({ rollCall }) => rollCall.measureId)
        .filter((id): id is MeasureId => id !== null),
    ),
  ].sort();
  const measures = await ingestMeasures(context, measureIds, knownPeople);

  for (const { rollCall, house, senate } of pending) {
    const positions: VotePosition[] = [];
    const missing: string[] = [];
    for (const draft of house ?? []) {
      const state = draft.state ?? homeState.get(draft.bioguide);
      if (!knownPeople.has(draft.bioguide) || !state) missing.push(draft.bioguide);
      else
        positions.push({
          rollCallId: rollCall.id,
          personId: draft.bioguide,
          position: draft.position,
          party: draft.party,
          state,
        });
    }
    for (const draft of senate ?? []) {
      const personId = byLis.get(draft.lisId);
      if (!personId) missing.push(`${draft.name} (${draft.lisId})`);
      else
        positions.push({
          rollCallId: rollCall.id,
          personId,
          position: draft.position,
          party: draft.party,
          state: draft.state,
        });
    }
    if (missing.length > 0) {
      context.count("rollCalls.unmatchedMembers");
      context.note(`${rollCall.id}: no Person for ${missing.join(", ")}; roll call not recorded.`);
      continue;
    }
    const measureId =
      rollCall.measureId && measures.has(rollCall.measureId) ? rollCall.measureId : null;
    await context.act(recordRollCall, { rollCall: { ...rollCall, measureId }, positions });
  }
}
