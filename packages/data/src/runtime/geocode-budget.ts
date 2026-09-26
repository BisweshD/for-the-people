import type { Db } from "../db/client";
import { CensusGeocoder, createGeocoder, type Geocoder } from "../geocode";
import { checkRateLimit } from "./rate-limit";

/**
 * A global daily budget for the paid geocoder. Geocodio gives 2,500
 * free credits a day and each lookup spends three (the lookup plus the cd119 and cd120 appends), so
 * 800 lookups stay inside the free tier. Past that, every caller gets the keyless Census geocoder for
 * the rest of the UTC day, so no traffic can run up an overage bill. The count lives in `rate_limits`
 * under one key shared by all callers; no address or caller is part of it.
 */

export const GEOCODIO_DAILY_LOOKUPS = 800;

const GEOCODIO_BUDGET_KEY = "geocodio:all-callers";

/** The geocoder for one lookup: Geocodio while today's budget lasts (and its key is set), else Census. */
export async function geocoderWithinBudget(
  db: Db,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<Geocoder> {
  const geocoder = createGeocoder(env);
  if (geocoder.method !== "geocodio") return geocoder;
  const budget = await checkRateLimit(
    db,
    GEOCODIO_BUDGET_KEY,
    [{ windowSeconds: 86_400, max: GEOCODIO_DAILY_LOOKUPS }],
    now,
  );
  return budget.ok ? geocoder : new CensusGeocoder();
}
