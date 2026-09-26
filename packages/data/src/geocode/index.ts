import { CensusGeocoder } from "./census";
import { GeocodioGeocoder } from "./geocodio";
import type { Geocoder } from "./types";

export { CensusGeocoder, censusUrl, parseCensusResponse } from "./census";
export { GeocodioGeocoder, parseGeocodioResponse } from "./geocodio";
export {
  ballotMapStatus,
  locationFromMatch,
  manualLocation,
  RedistrictingFile,
  type BallotMapStatus,
} from "./redistricting";
export * from "./types";

/** Geocodio when GEOCODIO_API_KEY is set (it returns the 120th districts directly); otherwise the Census Bureau. */
export function createGeocoder(env: Record<string, string | undefined> = process.env): Geocoder {
  const key = env.GEOCODIO_API_KEY;
  return key ? new GeocodioGeocoder(key) : new CensusGeocoder();
}
