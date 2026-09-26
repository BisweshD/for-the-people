"use client";

import type { StateCode } from "@for-the-people/core/client";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useEffect, useMemo, useState } from "react";
import { districtLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Signature moment 8: the old and new district outlines crossfade with a slight scale.
 * Outlines are the Census Bureau's TIGERweb boundaries, simplified at build time
 * (packages/data/src/cli/district-outlines.ts) into apps/web/public/districts/<ST>.json.
 */

interface OutlineFile {
  v: 1;
  scale: number;
  cd120: Record<string, number[][]>;
  cd119: Record<string, number[][]> | null;
}

const WIDTH = 320;
const HEIGHT = 200;
const PAD = 10;

function decode(rings: number[][], scale: number): Array<Array<[number, number]>> {
  return rings.map((ring) => {
    const points: Array<[number, number]> = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i + 1 < ring.length; i += 2) {
      x += ring[i]!;
      y += ring[i + 1]!;
      points.push([x / scale, y / scale]);
    }
    return points;
  });
}

/** Fits both outlines into one frame with an equirectangular projection corrected for latitude. */
function project(shapes: Array<Array<Array<[number, number]>>>): string[] {
  const all = shapes.flat(2);
  if (all.length === 0) return shapes.map(() => "");
  const lons = all.map(([lon]) => lon);
  const lats = all.map(([, lat]) => lat);
  const [minLon, maxLon, minLat, maxLat] = [
    Math.min(...lons),
    Math.max(...lons),
    Math.min(...lats),
    Math.max(...lats),
  ];
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const s = Math.min((WIDTH - PAD * 2) / spanX, (HEIGHT - PAD * 2) / spanY);
  const ox = (WIDTH - spanX * s) / 2;
  const oy = (HEIGHT - spanY * s) / 2;
  return shapes.map((rings) =>
    rings
      .map(
        (ring) =>
          ring
            .map(([lon, lat], i) => {
              const x = ox + (lon - minLon) * kx * s;
              const y = oy + (maxLat - lat) * s;
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join("") + "Z",
      )
      .join(""),
  );
}

/** A state's outline file, or "failed" once it cannot be read; null while it loads. */
function useOutlineFile(state: StateCode): OutlineFile | "failed" | null {
  const [file, setFile] = useState<{ state: StateCode; data: OutlineFile | "failed" } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/districts/${state}.json`)
      .then((response) => (response.ok ? (response.json() as Promise<OutlineFile>) : null))
      .then((json) => !cancelled && setFile({ state, data: json ?? "failed" }))
      .catch(() => !cancelled && setFile({ state, data: "failed" }));
    return () => {
      cancelled = true;
    };
  }, [state]);
  return file?.state === state ? file.data : null;
}

/**
 * The 2026 ballot district beside "You vote in": its outline, small. When the address has just resolved
 * (`fresh`), the outline draws in (pathLength 0 to 1, 300 ms) and the words appear after it; a location
 * already on the device shows both settled, as does reduced motion.
 */
export function DistrictDraw({
  state,
  district,
  fresh,
}: {
  state: StateCode;
  district: number;
  fresh: boolean;
}) {
  const file = useOutlineFile(state);
  const path = useMemo(() => {
    if (!file || file === "failed") return null;
    const rings = file.cd120[String(district)];
    return rings ? project([decode(rings, file.scale)])[0]! : null;
  }, [file, district]);
  const settled = file !== null;
  return (
    <p
      className="flex items-center gap-3 text-lg text-ink tabular-nums"
      data-fact="ballot-district"
      data-receipt-id="method-district-lookup"
    >
      {(path || !settled) && (
        <span
          className="grid h-14 w-[5.5rem] shrink-0 place-items-center rounded-control bg-canvas"
          aria-hidden
        >
          {path && (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="size-full">
              <path d={path} className={cn("fill-you-soft", fresh && "animate-after-draw")} />
              <path
                d={path}
                pathLength={1}
                fill="none"
                strokeWidth={7}
                strokeLinejoin="round"
                className={cn("stroke-ink", fresh && "animate-outline-draw")}
              />
            </svg>
          )}
        </span>
      )}
      <span className={cn(fresh && (settled ? "animate-after-draw" : "opacity-0"))}>
        You vote in <span className="font-bold">{districtLabel(state, district)}</span> for the U.S.
        House
      </span>
    </p>
  );
}

export function DistrictOutlines({
  state,
  from,
  to,
}: {
  state: StateCode;
  /** District on the 119th Congress map (the one served now). */
  from: number;
  /** District on the 2026 ballot (120th Congress map). */
  to: number;
}) {
  const reduce = useReducedMotion();
  const file = useOutlineFile(state);

  const paths = useMemo(() => {
    if (!file || file === "failed") return null;
    const before = (file.cd119 ?? file.cd120)[String(from)];
    const after = file.cd120[String(to)];
    if (!before || !after) return null;
    const [oldPath, newPath] = project([decode(before, file.scale), decode(after, file.scale)]);
    return { oldPath: oldPath!, newPath: newPath! };
  }, [file, from, to]);

  if (file === "failed" || (file && !paths)) return null;
  const summary = `Map: your current district, ${districtLabel(state, from)}, as a dashed outline, and your 2026 ballot district, ${districtLabel(state, to)}, filled.`;
  const origin = { transformBox: "fill-box", transformOrigin: "center" } as const;

  return (
    <figure
      className="flex flex-col gap-2"
      data-fact="district-outline"
      data-receipt-id="method-district-lookup"
    >
      <div className="aspect-[8/5] w-full max-w-sm rounded-card bg-canvas">
        {paths && (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="size-full"
            role="img"
            aria-label={summary}
          >
            {/* Keyed by the paths so the crossfade replays when the district changes. */}
            <path
              key={`old-${paths.oldPath.length}-${from}`}
              d={paths.oldPath}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinejoin="round"
              className={cn("stroke-ink-3-graphic", reduce ? "opacity-80" : "animate-outline-old")}
              style={origin}
            />
            <path
              key={`new-${paths.newPath.length}-${to}`}
              d={paths.newPath}
              strokeWidth={2}
              strokeLinejoin="round"
              className={cn("fill-you-soft stroke-ink", !reduce && "animate-outline-new")}
              style={origin}
            />
          </svg>
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 type-meta text-ink-2">
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="10" aria-hidden className="shrink-0">
            <line
              x1="1"
              y1="5"
              x2="21"
              y2="5"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              className="stroke-ink-3-graphic"
            />
          </svg>
          Now: {districtLabel(state, from)}
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="10" aria-hidden className="shrink-0">
            <rect
              x="1"
              y="1"
              width="20"
              height="8"
              rx="2"
              strokeWidth="1.5"
              className="fill-you-soft stroke-ink"
            />
          </svg>
          2026 ballot: {districtLabel(state, to)}
        </span>
      </figcaption>
    </figure>
  );
}
