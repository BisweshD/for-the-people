import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ballotMapStatus,
  CensusGeocoder,
  censusUrl,
  createGeocoder,
  locationFromMatch,
  manualLocation,
  parseCensusResponse,
  parseGeocodioResponse,
  RedistrictingFile,
} from "../src/geocode";
import { districtNumberFromCensus } from "../src/geocode/fips";

/** Contract tests for the address lookups, against recorded real Census geocoder responses (public buildings only). */

const root = join(__dirname, "..", "..", "..");
const census = (name: string): unknown =>
  JSON.parse(readFileSync(join(root, "tests", "fixtures", "census", name), "utf8"));
const redistricting = RedistrictingFile.parse(
  JSON.parse(readFileSync(join(root, "data", "redistricting-2026.json"), "utf8")),
);
const SET_AT = "2026-09-23T16:00:00.000Z";

describe("Census geocoder responses", () => {
  test("the Texas Capitol is TX-10 on the 2026 ballot and TX-37 today", () => {
    expect(parseCensusResponse(census("texas-capitol-current.json"), "cd120")).toEqual({
      state: "TX",
      number: 10,
      block: "484530007001068",
    });
    expect(parseCensusResponse(census("texas-capitol-acs2024.json"), "cd119")).toEqual({
      state: "TX",
      number: 37,
      block: null,
    });
  });

  test("an at-large seat (code 00) and a delegate seat (code 98) are district 0", () => {
    expect(parseCensusResponse(census("alaska-capitol-current.json"), "cd120")).toMatchObject({
      state: "AK",
      number: 0,
    });
    expect(parseCensusResponse(census("white-house-current.json"), "cd120")).toMatchObject({
      state: "DC",
      number: 0,
    });
  });

  test("no address match and the wrong layer both give null", () => {
    expect(parseCensusResponse(census("no-match-current.json"), "cd120")).toBeNull();
    expect(parseCensusResponse(census("texas-capitol-current.json"), "cd119")).toBeNull();
    expect(parseCensusResponse({ unexpected: true }, "cd120")).toBeNull();
  });

  test("district codes map to numbers", () => {
    expect(districtNumberFromCensus("07")).toBe(7);
    expect(districtNumberFromCensus("00")).toBe(0);
    expect(districtNumberFromCensus("98")).toBe(0);
    expect(districtNumberFromCensus("ZZ")).toBeNull();
  });

  test("the request asks for the right vintage per map and nothing else identifying", () => {
    const current = new URL(censusUrl("1100 Congress Ave, Austin, TX 78701", "cd120"));
    expect(current.host).toBe("geocoding.geo.census.gov");
    expect(current.searchParams.get("vintage")).toBe("Current_Current");
    expect(new URL(censusUrl("x", "cd119")).searchParams.get("vintage")).toBe("ACS2024_Current");
  });
});

describe("CensusGeocoder", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("combines both maps from one lookup, without caching or keeping the address", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const vintage = new URL(url).searchParams.get("vintage");
      const body =
        vintage === "Current_Current"
          ? census("texas-capitol-current.json")
          : census("texas-capitol-acs2024.json");
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new CensusGeocoder().lookup("1100 Congress Ave, Austin, TX 78701");
    expect(result).toEqual({
      ok: true,
      method: "census-geocoder",
      match: { state: "TX", ballot: 10, serving: 37, block: "484530007001068" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  test("a network failure reads as unavailable, and no match as no-match", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await new CensusGeocoder().lookup("somewhere")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify(census("no-match-current.json")), { status: 200 }),
    );
    expect(await new CensusGeocoder().lookup("zzzz nowhere")).toEqual({
      ok: false,
      reason: "no-match",
    });
  });

  test("Geocodio is used only when its key is set", () => {
    expect(createGeocoder({}).method).toBe("census-geocoder");
    expect(createGeocoder({ GEOCODIO_API_KEY: "k" }).method).toBe("geocodio");
  });
});

describe("Geocodio responses", () => {
  test("reads the 119th and 120th districts and the state", () => {
    const body = {
      results: [
        {
          address_components: { state: "TX" },
          fields: {
            congressional_districts: [
              { district_number: 37, congress_number: "119th", proportion: 1 },
              { district_number: 10, congress_number: "120th", proportion: 1 },
            ],
          },
        },
      ],
    };
    expect(parseGeocodioResponse(body)).toEqual({
      ok: true,
      method: "geocodio",
      match: { state: "TX", ballot: 10, serving: 37, block: null },
    });
    expect(parseGeocodioResponse({ results: [] })).toEqual({ ok: false, reason: "no-match" });
  });
});

describe("2026 map status and the device Location", () => {
  test("a redrawn state with its map in effect gives a confirmed ballot district", () => {
    expect(ballotMapStatus(redistricting, "TX").kind).toBe("redrawn");
    expect(
      locationFromMatch(
        { state: "TX", ballot: 10, serving: 37, block: null },
        "census-geocoder",
        redistricting,
        SET_AT,
      ),
    ).toEqual({
      state: "TX",
      districts: ["TX-37@cd119", "TX-10@cd120"],
      ballotDistrictConfirmed: true,
      setAt: SET_AT,
      method: "census-geocoder",
    });
  });

  test("Missouri's map is in court: both possible ballot districts, nothing confirmed", () => {
    expect(ballotMapStatus(redistricting, "MO").kind).toBe("uncertain");
    const ballot = parseCensusResponse(census("missouri-capitol-current.json"), "cd120");
    const serving = parseCensusResponse(census("missouri-capitol-acs2024.json"), "cd119");
    expect([ballot?.number, serving?.number]).toEqual([5, 3]);
    expect(
      locationFromMatch(
        { state: "MO", ballot: ballot!.number, serving: serving!.number, block: ballot!.block },
        "census-geocoder",
        redistricting,
        SET_AT,
      ),
    ).toMatchObject({
      districts: ["MO-3@cd119", "MO-5@cd120", "MO-3@cd120"],
      ballotDistrictConfirmed: false,
    });
    expect(manualLocation("MO", 5, redistricting, SET_AT).ballotDistrictConfirmed).toBe(false);
  });

  test("a state that did not redraw keeps its 2024 district when the 2026 layer is missing", () => {
    expect(ballotMapStatus(redistricting, "AK").kind).toBe("unchanged");
    expect(
      locationFromMatch(
        { state: "WA", ballot: null, serving: 7, block: null },
        "census-geocoder",
        redistricting,
        SET_AT,
      ),
    ).toMatchObject({ districts: ["WA-7@cd119", "WA-7@cd120"], ballotDistrictConfirmed: true });
  });

  test("a redrawn state without a 2026 district is not confirmed, and no district at all is null", () => {
    expect(
      locationFromMatch(
        { state: "TX", ballot: null, serving: 37, block: null },
        "census-geocoder",
        redistricting,
        SET_AT,
      ),
    ).toMatchObject({ districts: ["TX-37@cd119"], ballotDistrictConfirmed: false });
    expect(
      locationFromMatch(
        { state: "TX", ballot: null, serving: null, block: null },
        "census-geocoder",
        redistricting,
        SET_AT,
      ),
    ).toBeNull();
  });

  test("an official block assignment overrides the Census layer (NC block 370350107003014)", () => {
    expect(redistricting.blockOverrides["370350107003014"]).toMatchObject({
      state: "NC",
      cd120: 10,
    });
    expect(
      locationFromMatch(
        { state: "NC", ballot: 14, serving: 10, block: "370350107003014" },
        "census-geocoder",
        redistricting,
        SET_AT,
      ),
    ).toMatchObject({ districts: ["NC-10@cd119", "NC-10@cd120"], ballotDistrictConfirmed: true });
    expect(
      locationFromMatch(
        { state: "NC", ballot: 14, serving: 10, block: "370350107003015" },
        "census-geocoder",
        redistricting,
        SET_AT,
      )?.districts,
    ).toEqual(["NC-10@cd119", "NC-14@cd120"]);
    expect(
      locationFromMatch(
        { state: "SC", ballot: 5, serving: 5, block: "370350107003014" },
        "census-geocoder",
        redistricting,
        SET_AT,
      )?.districts,
    ).toEqual(["SC-5@cd119", "SC-5@cd120"]);
  });

  test("a district picked by hand is the ballot district only", () => {
    expect(manualLocation("TX", 10, redistricting, SET_AT)).toEqual({
      state: "TX",
      districts: ["TX-10@cd120"],
      ballotDistrictConfirmed: true,
      setAt: SET_AT,
      method: "manual",
    });
  });
});
