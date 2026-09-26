import { StateCode } from "@for-the-people/core";
import { z } from "zod";
import { fetchAllowed, USER_AGENT } from "../ingest/fetch";
import { districtNumberFromCensus, FIPS_TO_STATE } from "./fips";
import { GEOCODE_TIMEOUT_MS, type Geocoder, type GeocodeResult } from "./types";

/**
 * The U.S. Census Bureau geocoder: keyless and official. One request per map:
 * vintage Current_Current returns the 120th Congressional Districts (the 2026 ballot), and
 * vintage ACS2024_Current returns the 119th (the districts members serve now).
 */

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export const CENSUS_LAYERS = {
  cd120: { vintage: "Current_Current", layer: "120th Congressional Districts", field: "CD120" },
  cd119: { vintage: "ACS2024_Current", layer: "119th Congressional Districts", field: "CD119" },
} as const;

export type CensusMap = keyof typeof CENSUS_LAYERS;

export function censusUrl(address: string, map: CensusMap): string {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: CENSUS_LAYERS[map].vintage,
    layers: "all",
    format: "json",
  });
  return `${ENDPOINT}?${params.toString()}`;
}

const geography = z.record(z.string(), z.unknown());
const responseSchema = z.object({
  result: z.object({
    addressMatches: z.array(z.object({ geographies: z.record(z.string(), z.array(geography)) })),
  }),
});

export interface CensusDistrict {
  state: StateCode;
  number: number;
  /** 2020 Census block GEOID (15 digits), when the response includes the blocks layer. */
  block: string | null;
}

/** Reads the state and district number for one map from a geocoder response. Null when nothing matched. */
export function parseCensusResponse(body: unknown, map: CensusMap): CensusDistrict | null {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return null;
  const match = parsed.data.result.addressMatches[0];
  if (!match) return null;
  const { layer, field } = CENSUS_LAYERS[map];
  const district = match.geographies[layer]?.[0];
  if (!district) return null;
  const fips = typeof district.STATE === "string" ? district.STATE : null;
  const postal = match.geographies.States?.[0]?.STUSAB;
  const state = StateCode.safeParse(
    typeof postal === "string" ? postal : fips ? FIPS_TO_STATE[fips] : undefined,
  );
  const code = district[field];
  const number = typeof code === "string" ? districtNumberFromCensus(code) : null;
  if (!state.success || number === null) return null;
  const blockId = match.geographies["2020 Census Blocks"]?.[0]?.GEOID;
  const block = typeof blockId === "string" && /^\d{15}$/.test(blockId) ? blockId : null;
  return { state: state.data, number, block };
}

async function requestJson(url: string): Promise<unknown> {
  const response = await fetchAllowed(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Census geocoder answered ${response.status}`);
  return response.json();
}

export class CensusGeocoder implements Geocoder {
  readonly method = "census-geocoder" as const;

  async lookup(address: string): Promise<GeocodeResult> {
    let bodies: [unknown, unknown];
    try {
      bodies = await Promise.all([
        requestJson(censusUrl(address, "cd120")),
        requestJson(censusUrl(address, "cd119")),
      ]);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    const ballot = parseCensusResponse(bodies[0], "cd120");
    const serving = parseCensusResponse(bodies[1], "cd119");
    const state = ballot?.state ?? serving?.state;
    if (!state) return { ok: false, reason: "no-match" };
    return {
      ok: true,
      method: this.method,
      match: {
        state,
        ballot: ballot?.state === state ? ballot.number : null,
        serving: serving?.state === state ? serving.number : null,
        block: ballot?.state === state ? ballot.block : null,
      },
    };
  }
}
