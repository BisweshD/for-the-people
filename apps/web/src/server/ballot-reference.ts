import type { StateCode } from "@for-the-people/core";
import { RedistrictingFile } from "@for-the-people/data/geocode/redistricting";
import redistrictingJson from "../../../../data/redistricting-2026.json";
import stateOfficesJson from "../../../../data/state-election-offices.json";
import type { MapStatusView, StateOfficeView } from "@/lib/ballot";

/**
 * Reference files the ballot pages read at build time (no database): which 2026 maps are settled
 * (data/redistricting-2026.json) and each state's official election website (data/state-election-offices.json).
 */

export const redistricting = RedistrictingFile.parse(redistrictingJson);

export const STATE_OFFICES: Partial<Record<StateCode, StateOfficeView>> = Object.fromEntries(
  stateOfficesJson.offices.map((office) => [office.state, { name: office.name, url: office.url }]),
);

/** States whose 2026 House map differs from 2024, or is still in court. */
export function mapStatuses(): Partial<Record<StateCode, MapStatusView>> {
  return Object.fromEntries(
    redistricting.states
      .filter((entry) => entry.redrawnFor2026 || entry.status2026 === "uncertain")
      .map((entry) => [
        entry.state,
        {
          kind: entry.status2026 === "uncertain" ? "uncertain" : "redrawn",
          officialSource: entry.officialSource,
        },
      ]),
  );
}
