import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { workspaceRoot } from "../src/db/client";
import {
  parseLocationInput,
  resolvePartial,
  type PlaceLookupFile,
  type PointLookup,
} from "../src/geocode/partial";
import { RedistrictingFile } from "../src/geocode/redistricting";

/** A ZIP code, a city and state, or a state alone, matched against bundled Census Bureau files. */

const root = workspaceRoot();
const lookup = JSON.parse(
  readFileSync(join(root, "tests", "fixtures", "census", "place-lookup.sample.json"), "utf8"),
) as PlaceLookupFile;
const redistricting = RedistrictingFile.parse(
  JSON.parse(readFileSync(join(root, "data", "redistricting-2026.json"), "utf8")),
);
const setAt = "2026-09-26T12:00:00.000Z";
const noPoint: PointLookup = async () => {
  throw new Error("an unchanged state never needs the Census Bureau");
};

describe("parseLocationInput", () => {
  test("a street address stays a street address", () => {
    expect(parseLocationInput("1100 Congress Ave, Austin, TX 78701")).toEqual({ kind: "address" });
    expect(parseLocationInput("1600 Pennsylvania Ave NW, Washington, DC")).toEqual({ kind: "address" });
  });
  test("a ZIP code, alone or after a city and state", () => {
    expect(parseLocationInput("78701")).toEqual({ kind: "zip", zip: "78701" });
    expect(parseLocationInput("78701-1234")).toEqual({ kind: "zip", zip: "78701" });
    expect(parseLocationInput("Austin, TX 78701")).toEqual({ kind: "zip", zip: "78701" });
  });
  test("a city and state, with or without a comma or abbreviation", () => {
    expect(parseLocationInput("Austin, TX")).toEqual({ kind: "city", city: "austin", state: "TX" });
    expect(parseLocationInput("Fairfax Virginia")).toEqual({ kind: "city", city: "fairfax", state: "VA" });
    expect(parseLocationInput("Charleston, West Virginia")).toEqual({
      kind: "city",
      city: "charleston",
      state: "WV",
    });
    expect(parseLocationInput("St. Louis, MO")).toEqual({ kind: "city", city: "st louis", state: "MO" });
  });
  test("a state alone, by name or abbreviation", () => {
    expect(parseLocationInput("Ohio")).toEqual({ kind: "state", state: "OH" });
    expect(parseLocationInput("oh")).toEqual({ kind: "state", state: "OH" });
    expect(parseLocationInput("West Virginia")).toEqual({ kind: "state", state: "WV" });
  });
});

describe("resolvePartial", () => {
  test("a ZIP code inside one district, in a state that kept its map, is confirmed", async () => {
    const result = await resolvePartial({ kind: "zip", zip: "10001" }, lookup, redistricting, setAt, noPoint);
    expect(result).toEqual({
      kind: "located",
      location: {
        state: "NY",
        districts: ["NY-12@cd119", "NY-12@cd120"],
        ballotDistrictConfirmed: true,
        setAt,
        method: "zip",
      },
    });
  });

  test("a ZIP code that crosses district lines is never guessed: the voter picks", async () => {
    const result = await resolvePartial({ kind: "zip", zip: "22030" }, lookup, redistricting, setAt, noPoint);
    expect(result).toEqual({
      kind: "choose",
      state: "VA",
      districts: [10, 11],
      message: "Your ZIP code crosses 2 districts. Pick yours, or add your street address for an exact match.",
    });
  });

  test("a city inside one district resolves by city", async () => {
    const result = await resolvePartial(
      { kind: "city", city: "fairfax", state: "VA" },
      lookup,
      redistricting,
      setAt,
      noPoint,
    );
    expect(result).toMatchObject({ kind: "located", location: { districts: ["VA-11@cd119", "VA-11@cd120"], method: "city" } });
  });

  test("in a state that drew new lines, the 2026 district comes from the Census Bureau and is not confirmed", async () => {
    const asked: Array<[number, number]> = [];
    const point: PointLookup = async (latitude, longitude) => {
      asked.push([latitude, longitude]);
      return { state: "TX", ballot: 10 };
    };
    const result = await resolvePartial({ kind: "zip", zip: "78701" }, lookup, redistricting, setAt, point);
    expect(asked).toEqual([[30.2706, -97.7426]]);
    expect(result).toEqual({
      kind: "located",
      location: {
        state: "TX",
        districts: ["TX-37@cd119", "TX-10@cd120"],
        ballotDistrictConfirmed: false,
        setAt,
        method: "zip",
      },
    });
  });

  test("a big city across many districts in a redrawn state asks for a pick without a lookup", async () => {
    const result = await resolvePartial(
      { kind: "city", city: "austin", state: "TX" },
      lookup,
      redistricting,
      setAt,
      noPoint,
    );
    expect(result).toMatchObject({ kind: "choose", state: "TX", districts: [] });
  });

  test("a state alone asks for the district; an unknown ZIP code says what to do next", async () => {
    expect(
      await resolvePartial({ kind: "state", state: "OH" }, lookup, redistricting, setAt, noPoint),
    ).toMatchObject({ kind: "choose", state: "OH", districts: [] });
    expect(
      await resolvePartial({ kind: "zip", zip: "00000" }, lookup, redistricting, setAt, noPoint),
    ).toEqual({
      kind: "not-found",
      message: "We could not find that ZIP code. Check it, or enter your street address.",
    });
  });
});
