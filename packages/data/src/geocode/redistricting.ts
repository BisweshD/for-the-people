import {
  BALLOT_MAP_VERSION,
  districtId,
  SERVING_MAP_VERSION,
  StateCode,
  type DistrictId,
  type Location,
} from "@for-the-people/core";
import { z } from "zod";
import type { DistrictMatch } from "./types";

/**
 * Which 2026 House maps are settled, from data/redistricting-2026.json (each entry checked against an
 * official state source). A district is only "confirmed" when its state's 2026 map is in effect.
 */

export const RedistrictingFile = z.object({
  asOf: z.iso.date(),
  /**
   * 2020 Census blocks where the state's official block assignment file and the Census 120th layer
   * disagree. The official file wins.
   */
  blockOverrides: z
    .record(
      z.string().regex(/^\d{15}$/),
      z.object({
        state: StateCode,
        cd120: z.number().int().min(0).max(60),
        source: z.url({ protocol: /^https$/ }),
        notes: z.string(),
      }),
    )
    .default({}),
  states: z.array(
    z.object({
      state: StateCode,
      redrawnFor2026: z.boolean(),
      plan: z.string(),
      status2026: z.enum(["in effect", "uncertain"]),
      officialSource: z.url(),
      lookupUrl: z.url().nullable(),
      notes: z.string(),
    }),
  ),
});
export type RedistrictingFile = z.infer<typeof RedistrictingFile>;

export type BallotMapStatus =
  | { kind: "unchanged" }
  | { kind: "redrawn"; plan: string; officialSource: string }
  | { kind: "uncertain"; plan: string; officialSource: string };

export function ballotMapStatus(file: RedistrictingFile, state: StateCode): BallotMapStatus {
  const entry = file.states.find((candidate) => candidate.state === state);
  if (!entry) return { kind: "unchanged" };
  if (entry.status2026 === "uncertain")
    return { kind: "uncertain", plan: entry.plan, officialSource: entry.officialSource };
  return entry.redrawnFor2026
    ? { kind: "redrawn", plan: entry.plan, officialSource: entry.officialSource }
    : { kind: "unchanged" };
}

/**
 * Turns a geocoder match into the device's Location (district ids only; never the address).
 * - Settled states: the 120th-Congress district is the ballot district, confirmed.
 * - A state whose map is still in court: both possible ballot districts are kept (the new map's, and the
 *   2024 map's, which is the district the member serves now), and nothing is confirmed.
 * - A state that did not redraw uses the same lines as 2024, so the serving district fills a missing ballot one.
 * - Where the state's official block assignment disagrees with the Census layer, the official block wins.
 */
export function locationFromMatch(
  match: DistrictMatch,
  method: Location["method"],
  file: RedistrictingFile,
  setAt: string,
): Location | null {
  const status = ballotMapStatus(file, match.state);
  const override = match.block ? file.blockOverrides[match.block] : undefined;
  const ballot =
    (override?.state === match.state ? override.cd120 : null) ??
    match.ballot ??
    (status.kind === "unchanged" && match.serving !== null ? match.serving : null);
  if (ballot === null && match.serving === null) return null;

  const districts: DistrictId[] = [];
  if (match.serving !== null)
    districts.push(districtId(match.state, match.serving, SERVING_MAP_VERSION));
  if (ballot !== null) districts.push(districtId(match.state, ballot, BALLOT_MAP_VERSION));
  if (status.kind === "uncertain" && match.serving !== null && match.serving !== ballot)
    districts.push(districtId(match.state, match.serving, BALLOT_MAP_VERSION));

  return {
    state: match.state,
    districts,
    ballotDistrictConfirmed: ballot !== null && status.kind !== "uncertain",
    setAt,
    method,
  };
}

/** A district the voter picked by hand: the 2026 ballot district only, confirmed unless the state's map is in court. */
export function manualLocation(
  state: StateCode,
  ballot: number,
  file: RedistrictingFile,
  setAt: string,
): Location {
  return {
    state,
    districts: [districtId(state, ballot, BALLOT_MAP_VERSION)],
    ballotDistrictConfirmed: ballotMapStatus(file, state).kind !== "uncertain",
    setAt,
    method: "manual",
  };
}
