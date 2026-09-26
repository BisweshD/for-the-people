"use client";

import type { StateCode } from "@for-the-people/core/client";
import { geoPath } from "d3-geo";
import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "us-atlas/states-albers-10m.json";
import { stackLabels, type Shade } from "@/lib/explore-model";
import { STATE_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CALLOUT_WIDTH, MAP_HEIGHT, MAP_WIDTH, VIEW_WIDTH } from "./map-scale";

/** Space between the map's east edge and the callout labels, in map units. */
const CALLOUT_GAP = 20;

/**
 * The US states map for /explore: us-atlas TopoJSON (already projected to Albers USA, 975 x 610) drawn
 * with d3-geo as plain SVG. This module is code-split and loaded only when the map scrolls into view.
 * States are shaded by a median (a match with the voter, or voting with their party). Party never
 * colors the map, and every state big enough to hold a label prints its number.
 */

const FIPS: Record<string, StateCode> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

interface Shape {
  code: StateCode;
  d: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const topology = atlas as unknown as Topology<{ states: GeometryCollection }>;
const path = geoPath();
const SHAPES: Shape[] = feature(topology, topology.objects.states).features.flatMap((state) => {
  const code = FIPS[String(state.id)];
  const d = path(state);
  if (!code || !d) return [];
  const [x, y] = path.centroid(state);
  const [[x0, y0], [x1, y1]] = path.bounds(state);
  return [{ code, d, x, y, width: x1 - x0, height: y1 - y0 }];
});

export interface StateShade {
  shade: Shade;
  /** Printed on the state when it is big enough, e.g. "62%". */
  value: string;
  /** The state's full reading for screen readers and the tooltip. */
  description: string;
}

export interface StateMapProps {
  shades: Partial<Record<StateCode, StateShade>>;
  selected: StateCode | null;
  highlighted: StateCode | null;
  onHighlight: (code: StateCode | null) => void;
  onSelect: (code: StateCode) => void;
}

/**
 * The small northeastern states, labeled in the Atlantic with leader lines instead of on the state,
 * where their labels would pile up or not fit.
 */
const CALLOUTS = new Set<StateCode>(["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"]);

/**
 * States that get a printed label on the state: biggest first, skipping the callout states, any
 * state narrower than 24px or shorter than 22px on screen, and any label that would overlap one
 * already placed. Every state is in the table either way.
 */
function labeled(shades: StateMapProps["shades"], scale: number, font: number): Shape[] {
  const placed: Array<[number, number, number, number]> = [];
  const shapes = SHAPES.filter(
    (shape) =>
      shades[shape.code] &&
      !CALLOUTS.has(shape.code) &&
      shape.width * scale >= 24 &&
      shape.height * scale >= 22,
  ).toSorted((a, b) => b.width * b.height - a.width * a.height);
  return shapes.filter((shape) => {
    const characters = Math.max(shape.code.length, shades[shape.code]!.value.length);
    // Half the label's width and height, with a little air so neighbors never touch.
    const halfWidth = (characters * font * 0.64) / 2 + font * 0.3;
    const box: [number, number, number, number] = [
      shape.x - halfWidth,
      shape.y - font * 1.4,
      shape.x + halfWidth,
      shape.y + font * 1.35,
    ];
    const hits = placed.some(
      ([x0, y0, x1, y1]) => box[0] < x1 && box[2] > x0 && box[1] < y1 && box[3] > y0,
    );
    if (!hits) placed.push(box);
    return !hits;
  });
}

interface Callout {
  shape: Shape;
  /** The label's baseline middle, in the callout column. */
  y: number;
}

/** The callout column: one line per state ("NH 71%"), in north-to-south order, never overlapping. */
function callouts(shades: StateMapProps["shades"], font: number): Callout[] {
  const shapes = SHAPES.filter((shape) => CALLOUTS.has(shape.code) && shades[shape.code]).toSorted(
    (a, b) => a.y - b.y,
  );
  const ys = stackLabels(
    shapes.map((shape) => shape.y),
    font * 1.4,
    font,
    MAP_HEIGHT - font * 0.5,
  );
  return shapes.map((shape, index) => ({ shape, y: ys[index]! }));
}

const TONE_FILL: Record<Shade["tone"], string> = {
  agree: "fill-agree",
  split: "fill-split",
  even: "fill-ink-3-graphic",
  ink: "fill-ink-2",
};

export default function StateMap({
  shades,
  selected,
  highlighted,
  onHighlight,
  onSelect,
}: StateMapProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(0.45);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / VIEW_WIDTH);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const fontSize = 11 / scale;
  const outline = (code: StateCode | null) => SHAPES.find((shape) => shape.code === code);
  const hover = outline(highlighted);
  const chosen = outline(selected);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VIEW_WIDTH} ${MAP_HEIGHT}`}
      className="block h-auto w-full overflow-visible"
      role="group"
      aria-label="Map of states. Select a state to list its members."
    >
      {SHAPES.map((shape) => {
        const entry = shades[shape.code];
        const label = `${STATE_NAMES[shape.code]}: ${entry ? entry.description : "no members in view"}`;
        return (
          <path
            key={shape.code}
            d={shape.d}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected === shape.code}
            className={cn(
              "cursor-pointer stroke-paper outline-none",
              entry ? TONE_FILL[entry.shade.tone] : "fill-canvas",
            )}
            style={{ fillOpacity: entry ? entry.shade.opacity : 1 }}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            onPointerEnter={() => onHighlight(shape.code)}
            onPointerLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(shape.code)}
            onBlur={() => onHighlight(null)}
            onClick={() => onSelect(shape.code)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(shape.code);
              }
            }}
          >
            <title>{label}</title>
          </path>
        );
      })}
      {hover && hover.code !== selected && (
        <path
          d={hover.d}
          className="pointer-events-none fill-none stroke-ink"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {chosen && (
        <path
          d={chosen.d}
          className="pointer-events-none fill-none stroke-ink"
          strokeWidth={3}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <g aria-hidden className="pointer-events-none select-none" textAnchor="middle">
        {labeled(shades, scale, fontSize).map((shape) => (
          <text
            key={shape.code}
            x={shape.x}
            y={shape.y}
            fontSize={fontSize}
            className="fill-ink stroke-paper tabular-nums"
            strokeWidth={3 / scale}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            <tspan x={shape.x} dy="-0.2em" fontWeight={700}>
              {shape.code}
            </tspan>
            <tspan x={shape.x} dy="1.15em" fontWeight={500}>
              {shades[shape.code]!.value}
            </tspan>
          </text>
        ))}
      </g>
      {/* Northeast callouts: the list is hidden from screen readers (each state's button names it)
          but takes a pointer like the state itself. */}
      <g aria-hidden className="select-none">
        {callouts(shades, fontSize).map(({ shape, y }) => {
          const lineEnd = MAP_WIDTH + CALLOUT_GAP / 2;
          return (
            <g
              key={shape.code}
              className="cursor-pointer"
              onPointerEnter={() => onHighlight(shape.code)}
              onPointerLeave={() => onHighlight(null)}
              onClick={() => onSelect(shape.code)}
            >
              <polyline
                points={`${shape.x},${shape.y} ${lineEnd - fontSize * 0.6},${y - fontSize * 0.35} ${lineEnd},${y - fontSize * 0.35}`}
                className={cn(
                  "fill-none",
                  highlighted === shape.code || selected === shape.code
                    ? "stroke-ink"
                    : "stroke-ink-3-graphic",
                )}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={shape.x}
                cy={shape.y}
                r={2 / scale}
                className="fill-ink stroke-paper"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={MAP_WIDTH + CALLOUT_GAP}
                y={y}
                fontSize={fontSize}
                className="fill-ink tabular-nums"
              >
                <tspan fontWeight={selected === shape.code ? 800 : 700}>{shape.code}</tspan>
                <tspan fontWeight={500}> {shades[shape.code]!.value}</tspan>
              </text>
              {/* A generous invisible hit area around the label. */}
              <rect
                x={MAP_WIDTH + CALLOUT_GAP / 2}
                y={y - fontSize * 1.05}
                width={CALLOUT_WIDTH - CALLOUT_GAP / 2}
                height={fontSize * 1.4}
                className="fill-transparent"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
