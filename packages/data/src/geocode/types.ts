import type { StateCode } from "@for-the-people/core";

/**
 * Address to congressional districts. An address goes in, district numbers come out, and the address is
 * never written anywhere: not to disk, logs, the database, or a cache key.
 */

export interface DistrictMatch {
  state: StateCode;
  /** District number on the 2026 ballot (120th Congress map); 0 means at-large or a delegate seat. */
  ballot: number | null;
  /** District number the member serving now was elected in (119th Congress map). */
  serving: number | null;
  /**
   * The 2020 Census block the address falls in, used only on the server to apply official block overrides
   * (data/redistricting-2026.json) and then dropped with the address. Null when the geocoder does not say.
   */
  block: string | null;
}

export type GeocodeResult =
  | { ok: true; match: DistrictMatch; method: "census-geocoder" | "geocodio" }
  | { ok: false; reason: "no-match" | "unavailable" };

export interface Geocoder {
  readonly method: "census-geocoder" | "geocodio";
  lookup(address: string): Promise<GeocodeResult>;
}

/** Longest address we accept. Real one-line US addresses are far shorter. */
export const MAX_ADDRESS_LENGTH = 200;

/** Request timeout for one geocoder call. */
export const GEOCODE_TIMEOUT_MS = 12_000;
