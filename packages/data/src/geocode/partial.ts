import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BALLOT_MAP_VERSION,
  districtId,
  SERVING_MAP_VERSION,
  type Location,
  type StateCode,
} from "@for-the-people/core";
import { workspaceRoot } from "../db/client";
import { ballotMapStatus, locationFromMatch, type RedistrictingFile } from "./redistricting";

/**
 * Partial addresses: a ZIP code, a city and state, or a state alone. They are matched against
 * data/place-lookup.json (Census Bureau files, built by src/cli/place-lookup.ts), never sent anywhere as
 * typed. A ZIP code or city that lies in one district resolves; one that crosses district lines asks the
 * voter to pick from the districts it touches. Only a coordinate from the bundled file ever reaches the
 * Census Bureau, and only in states that drew new lines for 2026.
 */

const STATES: Record<StateCode, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia", AS: "American Samoa", GU: "Guam",
  MP: "Northern Mariana Islands", PR: "Puerto Rico", VI: "U.S. Virgin Islands",
};

const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A place name as the lookup keys it: "Salt Lake City city" and "salt lake city" are both "salt lake city". */
export function placeKey(name: string): string {
  return words(
    name
      .replace(/\s+\(balance\)$/i, "")
      .replace(
        /\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|municipality|borough|village|town|city|CDP|comunidad|zona urbana|plantation|corporation|township)$/i,
        "",
      ),
  ).replace(/^(saint|ste?) /, "st ");
}

const STATE_BY_WORDS = new Map<string, StateCode>(
  (Object.entries(STATES) as Array<[StateCode, string]>).flatMap(([code, name]) => [
    [code.toLowerCase(), code],
    [words(name), code],
  ]),
);
STATE_BY_WORDS.set("washington dc", "DC");
STATE_BY_WORDS.set("virgin islands", "VI");

/** Splits "austin tx" into the city and the state named at its end, when the end names one. */
function trailingState(text: string): { rest: string; state: StateCode } | null {
  const tokens = text.split(" ");
  for (let take = Math.min(3, tokens.length); take >= 1; take--) {
    const state = STATE_BY_WORDS.get(tokens.slice(-take).join(" "));
    if (state) return { rest: tokens.slice(0, -take).join(" "), state };
  }
  return null;
}

export type PartialInput =
  | { kind: "zip"; zip: string }
  | { kind: "city"; city: string; state: StateCode }
  | { kind: "state"; state: StateCode }
  /** A street address (or anything else): the address geocoder handles it, as before. */
  | { kind: "address" };

/**
 * What the voter typed. A ZIP code alone, or a city and state with a ZIP code and no street number, is a
 * ZIP code; a city and state with no numbers is a city; a state name or abbreviation alone is a state.
 * Anything with a street number stays a street address.
 */
export function parseLocationInput(text: string): PartialInput {
  const plain = words(text);
  const state = STATE_BY_WORDS.get(plain);
  if (state) return { kind: "state", state };
  const zip = /^(?:(\D*)\s)?(\d{5})(?:\s?\d{4})?$/.exec(plain);
  if (zip && !/\d/.test(zip[1] ?? "")) return { kind: "zip", zip: zip[2]! };
  if (/\d/.test(plain)) return { kind: "address" };
  const named = trailingState(plain);
  if (named && named.rest) return { kind: "city", city: placeKey(named.rest), state: named.state };
  return { kind: "address" };
}

export interface PlaceLookupFile {
  v: 1;
  sources: Record<string, { url: string; retrievedAt: string }>;
  /** ZCTA to [state, latitude, longitude, 119th districts it overlaps on land]. */
  zips: Record<string, [string, number, number, number[]]>;
  /** State, then place key, to [latitude, longitude, 119th districts]. */
  places: Record<string, Record<string, [number, number, number[]]>>;
}

let cached: Promise<PlaceLookupFile> | null = null;

/** data/place-lookup.json, read once per server process. */
export function loadPlaceLookup(): Promise<PlaceLookupFile> {
  cached ??= readFile(join(workspaceRoot(), "data", "place-lookup.json"), "utf8").then(
    (text) => JSON.parse(text) as PlaceLookupFile,
  );
  return cached;
}

export type PartialResult =
  | { kind: "located"; location: Location }
  /** Pick a district: the state is known; `districts` lists the possible ones (empty means any). */
  | { kind: "choose"; state: StateCode; districts: number[]; message: string }
  | { kind: "not-found"; message: string };

/** The 2026 ballot district at a coordinate (the Census Bureau's 120th Congressional Districts), or null. */
export type PointLookup = (
  latitude: number,
  longitude: number,
) => Promise<{ state: StateCode; ballot: number | null } | null>;

const districtWord = (count: number) => (count === 1 ? "district" : `${count} districts`);

export async function resolvePartial(
  input: Exclude<PartialInput, { kind: "address" }>,
  file: PlaceLookupFile,
  redistricting: RedistrictingFile,
  setAt: string,
  pointLookup: PointLookup,
): Promise<PartialResult> {
  if (input.kind === "state") {
    return {
      kind: "choose",
      state: input.state,
      districts: [],
      message: `Your U.S. Senate races are the same across ${STATES[input.state]}. Pick your House district, or add your street address to find it.`,
    };
  }
  const found =
    input.kind === "zip"
      ? (() => {
          const entry = file.zips[input.zip];
          return entry
            ? { state: entry[0] as StateCode, latitude: entry[1], longitude: entry[2], districts: entry[3] }
            : null;
        })()
      : (() => {
          const entry = file.places[input.state]?.[input.city];
          return entry
            ? { state: input.state, latitude: entry[0], longitude: entry[1], districts: entry[2] }
            : null;
        })();
  const label = input.kind === "zip" ? "ZIP code" : "city";
  if (!found) {
    return {
      kind: "not-found",
      message:
        input.kind === "zip"
          ? "We could not find that ZIP code. Check it, or enter your street address."
          : `We could not find that city in ${STATES[input.state]}. Check the spelling, or enter your street address.`,
    };
  }
  const { state, districts } = found;
  const method = input.kind;
  const status = ballotMapStatus(redistricting, state);

  if (status.kind === "unchanged") {
    if (districts.length === 1) {
      const number = districts[0]!;
      return {
        kind: "located",
        location: {
          state,
          districts: [
            districtId(state, number, SERVING_MAP_VERSION),
            districtId(state, number, BALLOT_MAP_VERSION),
          ],
          ballotDistrictConfirmed: true,
          setAt,
          method,
        },
      };
    }
    return {
      kind: "choose",
      state,
      districts,
      message: `Your ${label} crosses ${districtWord(districts.length)}. Pick yours, or add your street address for an exact match.`,
    };
  }

  // The state drew new lines for 2026: the ballot district comes from the Census Bureau's 2026 map at
  // the place's internal point, and is never marked confirmed, since the new lines may cross it.
  if (districts.length === 1) {
    const point = await pointLookup(found.latitude, found.longitude).catch(() => null);
    if (point && point.state === state && point.ballot !== null) {
      const location = locationFromMatch(
        { state, ballot: point.ballot, serving: districts[0]!, block: null },
        method,
        redistricting,
        setAt,
      );
      if (location) return { kind: "located", location: { ...location, ballotDistrictConfirmed: false } };
    }
  }
  return {
    kind: "choose",
    state,
    districts: [],
    message: `${STATES[state]} drew new district lines for 2026, and your ${label} may cross them. Pick your 2026 district, or add your street address for an exact match.`,
  };
}
