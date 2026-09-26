import { StateCode } from "@for-the-people/core";
import { z } from "zod";
import { fetchAllowed, USER_AGENT } from "../ingest/fetch";
import { GEOCODE_TIMEOUT_MS, type Geocoder, type GeocodeResult } from "./types";

/**
 * Geocodio (https://www.geocod.io/docs/), used only when GEOCODIO_API_KEY is set. We ask for the 119th and
 * 120th Congress fields; each field costs one lookup credit, so nothing else is requested.
 */

const ENDPOINT = "https://api.geocod.io/v2/geocode";

const district = z.object({
  district_number: z.number().int(),
  congress_number: z.string(),
  proportion: z.number().optional(),
});

const responseSchema = z.object({
  results: z.array(
    z.object({
      address_components: z.object({
        state: z.string().optional(),
        state_province: z.string().optional(),
      }),
      fields: z.object({ congressional_districts: z.array(district).optional() }).optional(),
    }),
  ),
});

/** Geocodio numbers at-large seats 0 and nonvoting delegates 98; both are district 0 in our ids. */
const normalize = (number: number): number => (number === 98 ? 0 : number);

function pick(districts: z.infer<typeof district>[], congress: string): number | null {
  const best = districts
    .filter((entry) => entry.congress_number === congress)
    .toSorted((a, b) => (b.proportion ?? 1) - (a.proportion ?? 1))[0];
  return best ? normalize(best.district_number) : null;
}

export function parseGeocodioResponse(body: unknown): GeocodeResult {
  const parsed = responseSchema.safeParse(body);
  const first = parsed.success ? parsed.data.results[0] : undefined;
  if (!first) return { ok: false, reason: "no-match" };
  const state = StateCode.safeParse(
    first.address_components.state_province ?? first.address_components.state,
  );
  if (!state.success) return { ok: false, reason: "no-match" };
  const districts = first.fields?.congressional_districts ?? [];
  return {
    ok: true,
    method: "geocodio",
    match: {
      state: state.data,
      ballot: pick(districts, "120th"),
      serving: pick(districts, "119th"),
      block: null,
    },
  };
}

export class GeocodioGeocoder implements Geocoder {
  readonly method = "geocodio" as const;

  constructor(private readonly apiKey: string) {}

  async lookup(address: string): Promise<GeocodeResult> {
    const params = new URLSearchParams({ q: address, fields: "cd119,cd120", api_key: this.apiKey });
    const url = `${ENDPOINT}?${params.toString()}`;
    try {
      const response = await fetchAllowed(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
        cache: "no-store",
      });
      if (response.status === 422) return { ok: false, reason: "no-match" };
      if (!response.ok) return { ok: false, reason: "unavailable" };
      return parseGeocodioResponse(await response.json());
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
}
