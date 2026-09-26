import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { workspaceRoot } from "../db/client";
import { rawCacheDir } from "../env";
import { districtNumberFromCensus, FIPS_TO_STATE } from "../geocode/fips";
import { placeKey } from "../geocode/partial";
import { fetchRaw } from "../ingest/fetch";

/**
 * Builds data/place-lookup.json, which the address box uses for a ZIP code or a city and state
 * without a street address. Everything comes from Census Bureau files:
 * - 2026 Gazetteer ZCTA and place files: each ZIP Code Tabulation Area's and place's internal point.
 * - 2020 relationship files between 119th Congressional Districts and ZCTAs or places: which districts
 *   each one overlaps on land, so a ZIP code or city that crosses a district line is never guessed.
 * The file is read on the server only. Usage: pnpm --filter @for-the-people/data exec tsx src/cli/place-lookup.ts
 */

const GAZETTEER = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer";
const RELATIONSHIPS = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld";
const URLS = {
  zcta: `${GAZETTEER}/2026_Gaz_zcta_national.zip`,
  place: `${GAZETTEER}/2026_Gaz_place_national.zip`,
  zctaCd119: `${RELATIONSHIPS}/tab20_cd11920_zcta520_natl.txt`,
  placeCd119: `${RELATIONSHIPS}/tab20_cd11920_place20_natl.txt`,
} as const;

const WEEK = 7 * 24 * 60 * 60 * 1000;

async function download(url: string) {
  const raw = await fetchRaw(url, { cacheDir: rawCacheDir(), maxAgeMs: WEEK });
  const text = url.endsWith(".zip")
    ? Buffer.from(Object.values(unzipSync(new Uint8Array(raw.body)))[0]!).toString("utf8")
    : raw.body.toString("utf8");
  // Drop a leading byte-order mark (U+FEFF), which the relationship files start with.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return { text: body, source: { url: raw.url, retrievedAt: raw.retrievedAt } };
}

/** A delimited table (newer Census files use "|", older ones tabs) as rows keyed by column name. */
function table(text: string): Array<Record<string, string>> {
  const [header = "", ...lines] = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const separator = header.includes("|") ? "|" : "\t";
  const columns = header.split(separator).map((column) => column.trim());
  return lines.map((line) => {
    const cells = line.split(separator);
    return Object.fromEntries(columns.map((column, index) => [column, (cells[index] ?? "").trim()]));
  });
}

const round = (value: string) => Math.round(Number(value) * 10_000) / 10_000;

/** District numbers each area overlaps on land, by state, from a 119th Congressional District relationship file. */
function overlaps(text: string, areaColumn: string) {
  const byArea = new Map<string, Map<string, Map<number, number>>>();
  for (const row of table(text)) {
    const area = row[areaColumn];
    const cd = row.GEOID_CD119_20 ?? "";
    const land = Number(row.AREALAND_PART ?? 0);
    const state = FIPS_TO_STATE[cd.slice(0, 2)];
    const number = districtNumberFromCensus(cd.slice(2));
    if (!area || !state || number === null || !(land > 0)) continue;
    const states = byArea.get(area) ?? new Map<string, Map<number, number>>();
    const districts = states.get(state) ?? new Map<number, number>();
    districts.set(number, (districts.get(number) ?? 0) + land);
    states.set(state, districts);
    byArea.set(area, states);
  }
  return byArea;
}

/** The state holding most of an area's land, with the districts it overlaps there. */
function mainState(states: Map<string, Map<number, number>> | undefined) {
  if (!states) return null;
  const [state, districts] = [...states].toSorted(
    ([, a], [, b]) =>
      [...b.values()].reduce((x, y) => x + y, 0) - [...a.values()].reduce((x, y) => x + y, 0),
  )[0]!;
  return { state, districts: [...districts.keys()].toSorted((a, b) => a - b) };
}

const [zcta, place, zctaCd119, placeCd119] = await Promise.all([
  download(URLS.zcta),
  download(URLS.place),
  download(URLS.zctaCd119),
  download(URLS.placeCd119),
]);

const zctaDistricts = overlaps(zctaCd119.text, "GEOID_ZCTA5_20");
const zips: Record<string, [string, number, number, number[]]> = {};
for (const row of table(zcta.text)) {
  const found = mainState(zctaDistricts.get(row.GEOID ?? ""));
  if (!row.GEOID || !found) continue;
  zips[row.GEOID] = [found.state, round(row.INTPTLAT!), round(row.INTPTLONG!), found.districts];
}

const placeDistricts = overlaps(placeCd119.text, "GEOID_PLACE_20");
const places: Record<string, Record<string, [number, number, number[]]>> = {};
const chosen = new Map<string, { active: boolean; land: number }>();
for (const row of table(place.text)) {
  const state = row.USPS ?? "";
  const found = mainState(placeDistricts.get(row.GEOID ?? ""));
  if (!found || found.state !== state) continue;
  const key = placeKey(row.NAME ?? "");
  if (!key) continue;
  // Two places with one name in a state (a city and a census-designated place): the incorporated one wins.
  const active = row.FUNCSTAT === "A";
  const land = Number(row.ALAND ?? 0);
  const previous = chosen.get(`${state}|${key}`);
  if (previous && (previous.active > active || (previous.active === active && previous.land >= land)))
    continue;
  chosen.set(`${state}|${key}`, { active, land });
  (places[state] ??= {})[key] = [round(row.INTPTLAT!), round(row.INTPTLONG!), found.districts];
}

const file = {
  v: 1,
  note: "ZIP Code Tabulation Areas and Census places with their internal points and the 119th Congressional Districts they overlap on land. A ZIP code is matched to its ZCTA, which the Census Bureau builds from blocks and which can differ from a mail route at the edges.",
  sources: {
    zcta: zcta.source,
    place: place.source,
    zctaCd119: zctaCd119.source,
    placeCd119: placeCd119.source,
  },
  zips,
  places,
};
const out = join(workspaceRoot(), "data", "place-lookup.json");
await writeFile(out, `${JSON.stringify(file)}\n`);
console.log(
  `place lookup: ${Object.keys(zips).length} ZIP codes, ${Object.values(places).reduce((sum, list) => sum + Object.keys(list).length, 0)} places`,
);
