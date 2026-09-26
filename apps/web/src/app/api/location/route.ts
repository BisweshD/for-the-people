import { StateCode } from "@for-the-people/core";
import { getDb } from "@for-the-people/data";
import {
  locationFromMatch,
  manualLocation,
  MAX_ADDRESS_LENGTH,
} from "@for-the-people/data/geocode";
import { geocoderWithinBudget } from "@for-the-people/data/runtime/geocode-budget";
import { checkRateLimit, rateLimitKey } from "@for-the-people/data/runtime/rate-limit";
import { z } from "zod";
import { getBallotDistrictOptions } from "@/server/ballot";
import { redistricting } from "@/server/ballot-reference";
import { clientIp, readBodyText, rejectCrossSite } from "@/server/request";

/**
 * SetLocationFromAddress. The address goes to the geocoder and is then
 * dropped: it is never logged, stored, cached, or echoed back. Only district ids leave this route.
 */

const MAX_BODY_BYTES = 1024;
const LIMITS = [
  { windowSeconds: 60, max: 10 },
  { windowSeconds: 86_400, max: 100 },
];

const Body = z.union([
  z.object({ address: z.string().trim().min(5).max(MAX_ADDRESS_LENGTH) }).strict(),
  z.object({ state: StateCode, district: z.number().int().min(0).max(60) }).strict(),
]);

const error = (status: number, message: string, headers?: HeadersInit) =>
  Response.json(
    { error: message },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  const text = await readBodyText(request, MAX_BODY_BYTES);
  if (text === null) return error(413, "That request is too large.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return error(400, "Send an address, or a state and district.");
  }
  const body = Body.safeParse(json);
  if (!body.success) return error(400, "Enter a street address with a city, state, or ZIP code.");

  const db = await getDb();
  const limited = await checkRateLimit(db, rateLimitKey("location", clientIp(request)), LIMITS);
  if (!limited.ok) {
    return error(429, "Too many lookups from this connection. Try again in a minute.", {
      "retry-after": String(limited.retryAfterSeconds),
    });
  }

  const setAt = new Date().toISOString();
  let location;
  if ("address" in body.data) {
    const geocoder = await geocoderWithinBudget(db);
    const result = await geocoder.lookup(body.data.address);
    if (!result.ok) {
      return result.reason === "no-match"
        ? error(
            404,
            "We could not find that address. Check the street and ZIP code, or pick your district instead.",
          )
        : error(
            503,
            "The address service did not answer. Try again, or pick your district instead.",
          );
    }
    location = locationFromMatch(result.match, result.method, redistricting, setAt);
    if (!location)
      return error(
        404,
        "That address is not in a congressional district. Pick your district instead.",
      );
  } else {
    const { state, district } = body.data;
    const options = await getBallotDistrictOptions();
    if (!options.some((option) => option.state === state && option.number === district))
      return error(400, "That district is not on a 2026 ballot.");
    location = manualLocation(state, district, redistricting, setAt);
  }

  return Response.json(
    {
      state: location.state,
      districts: location.districts,
      ballotDistrictConfirmed: location.ballotDistrictConfirmed,
      method: location.method,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
