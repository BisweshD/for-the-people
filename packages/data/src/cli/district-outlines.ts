import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { workspaceRoot } from "../db/client";
import { rawCacheDir } from "../env";
import { districtNumberFromCensus, FIPS_TO_STATE } from "../geocode/fips";
import { fetchRaw } from "../ingest/fetch";

/**
 * Builds small per-state district outlines for the "your district changed" notice from the Census
 * Bureau's TIGERweb service: layer 0 is the 120th Congressional Districts (the 2026 ballot) and layer 4
 * the 119th. TIGERweb simplifies on the server (maxAllowableOffset), so no geometry library is needed.
 * Output: apps/web/public/districts/<ST>.json. The 119th map is included only where its lines differ.
 *
 * Format (v1): rings are flat integer arrays in thousandths of a degree, delta-encoded after the first
 * point: [x0, y0, dx1, dy1, ...]. Usage: pnpm --filter @for-the-people/data exec tsx src/cli/district-outlines.ts
 */

const SERVICE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer";
const LAYERS = { cd120: { id: 0, field: "CD120" }, cd119: { id: 4, field: "CD119" } } as const;
const OFFSET_DEGREES = 0.004;
const SCALE = 1000;

const featureCollection = z.object({
  features: z.array(
    z.object({
      properties: z.record(z.string(), z.unknown()),
      geometry: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("Polygon"),
          coordinates: z.array(z.array(z.array(z.number()))),
        }),
        z.object({
          type: z.literal("MultiPolygon"),
          coordinates: z.array(z.array(z.array(z.array(z.number())))),
        }),
      ]),
    }),
  ),
});

function queryUrl(layer: number, field: string, fips: string): string {
  const params = new URLSearchParams({
    where: `STATE='${fips}'`,
    outFields: `STATE,${field},AREALAND`,
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: String(OFFSET_DEGREES),
    geometryPrecision: "3",
    f: "geojson",
  });
  return `${SERVICE}/${layer}/query?${params.toString()}`;
}

function encodeRing(ring: number[][]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  ring.forEach(([lon, lat], index) => {
    const x = Math.round((lon ?? 0) * SCALE);
    const y = Math.round((lat ?? 0) * SCALE);
    if (index === 0) out.push(x, y);
    else if (x !== px || y !== py) out.push(x - px, y - py);
    px = x;
    py = y;
  });
  return out;
}

interface MapOutlines {
  districts: Record<string, number[][]>;
  area: Record<string, number>;
}

async function fetchMap(map: keyof typeof LAYERS, fips: string) {
  const { id, field } = LAYERS[map];
  const raw = await fetchRaw(queryUrl(id, field, fips), {
    cacheDir: rawCacheDir(),
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  });
  const parsed = featureCollection.parse(JSON.parse(raw.body.toString("utf8")));
  const outlines: MapOutlines = { districts: {}, area: {} };
  for (const feature of parsed.features) {
    const code = feature.properties[field];
    const number = typeof code === "string" ? districtNumberFromCensus(code) : null;
    if (number === null) continue;
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    const rings = polygons.flatMap((polygon) => polygon.map(encodeRing));
    outlines.districts[number] = [...(outlines.districts[number] ?? []), ...rings];
    outlines.area[number] = Number(feature.properties.AREALAND ?? 0);
  }
  return { outlines, url: raw.url, retrievedAt: raw.retrievedAt };
}

/** Same lines when every district's land area matches within 0.5% (annual boundary updates move a few acres). */
const sameLines = (a: MapOutlines, b: MapOutlines): boolean => {
  const keys = Object.keys(a.area);
  return (
    keys.length === Object.keys(b.area).length &&
    keys.every((key) => {
      const before = b.area[key];
      return before !== undefined && Math.abs((a.area[key] ?? 0) - before) <= before * 0.005;
    })
  );
};

const outDir = join(workspaceRoot(), "apps", "web", "public", "districts");
await mkdir(outDir, { recursive: true });
let total = 0;
const redrawn: string[] = [];
for (const [fips, state] of Object.entries(FIPS_TO_STATE)) {
  const ballot = await fetchMap("cd120", fips);
  const serving = await fetchMap("cd119", fips);
  if (Object.keys(ballot.outlines.districts).length === 0) continue;
  const changed = !sameLines(ballot.outlines, serving.outlines);
  if (changed) redrawn.push(state);
  const file = {
    v: 1,
    state,
    scale: SCALE,
    source: {
      publisher: "U.S. Census Bureau (TIGERweb)",
      cd120: { url: ballot.url, retrievedAt: ballot.retrievedAt },
      cd119: { url: serving.url, retrievedAt: serving.retrievedAt },
    },
    cd120: ballot.outlines.districts,
    cd119: changed ? serving.outlines.districts : null,
  };
  const text = JSON.stringify(file);
  total += text.length;
  await writeFile(join(outDir, `${state}.json`), text);
}
console.log(
  `district outlines: ${(total / 1024).toFixed(0)} KB; lines changed in ${redrawn.join(", ") || "no state"}`,
);
