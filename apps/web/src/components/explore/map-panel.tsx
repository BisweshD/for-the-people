"use client";

import type { StateCode } from "@for-the-people/core/client";
import { Table2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "@/hooks/use-in-view";
import {
  highAndLow,
  MATCH_STEPS,
  matchShade,
  RANK_OPACITY,
  rankShade,
  summarizeStates,
  type Shade,
} from "@/lib/explore-model";
import { formatInteger, formatShare, STATE_NAMES } from "@/lib/format";
import { mapScaleCaption } from "@/lib/map-caption";
import { cn } from "@/lib/utils";
import { MAP_HEIGHT, VIEW_WIDTH } from "./map-scale";
import type { StateShade } from "./state-map";

const StateMap = dynamic(() => import("./state-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-card" />,
});

/** Codes the atlas does not draw (territories); they are named in a sentence under the map instead. */
const OFF_MAP: StateCode[] = ["PR", "GU", "VI", "AS", "MP"];

export interface MapPanelProps {
  /**
   * "match": each state's median match with the voter (after they answer).
   * "party": each state's median share of votes with their party (before they answer).
   */
  mode: "match" | "party";
  /** The selected issue, lowercased, when the match is on one issue. */
  topic: string | null;
  /** Who is in view, as a plural noun: "members", "senators", "Republican House members". */
  scope: string;
  /** One entry per member in view (chamber, party, and issue filters applied; not the state). */
  entries: ReadonlyArray<{ state: StateCode; value: number | null }>;
  selected: StateCode | null;
  highlighted: StateCode | null;
  onHighlight: (code: StateCode | null) => void;
  onSelect: (code: StateCode) => void;
}

const percent = (value: number) => formatShare(value, 1);
const members = (count: number) => `${formatInteger(count)} ${count === 1 ? "member" : "members"}`;
const TONE_BG: Record<Shade["tone"], string> = {
  agree: "bg-agree",
  split: "bg-split",
  even: "bg-ink-3-graphic",
  ink: "bg-ink-2",
};

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/**
 * The states map with its question as the title, a one-sentence finding, a direct-labeled scale,
 * and a "View as table" toggle. It follows every filter except the state, which
 * it outlines instead.
 */
export function MapPanel({
  mode,
  topic,
  scope,
  entries,
  selected,
  highlighted,
  onHighlight,
  onSelect,
}: MapPanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const visible = useInView(box, { margin: "200px 0px" });
  const [table, setTable] = useState(false);

  const summaries = useMemo(() => summarizeStates(entries), [entries]);
  // The scale and the finding use only states drawn on the map: a territory's single delegate would
  // otherwise stretch the scale and name a place the reader cannot see.
  const drawn = new Map([...summaries].filter(([code]) => !OFF_MAP.includes(code)));
  const medians = [...drawn.values()]
    .map((summary) => summary.median)
    .filter((value): value is number => value !== null);
  const scored = [...summaries.values()].reduce((sum, summary) => sum + summary.scored, 0);
  const total = [...summaries.values()].reduce((sum, summary) => sum + summary.count, 0);
  const { high, low } = highAndLow(drawn);

  const shades: Partial<Record<StateCode, StateShade>> = {};
  for (const [code, summary] of summaries) {
    if (summary.median === null) continue;
    const value = percent(summary.median);
    shades[code] = {
      shade: mode === "match" ? matchShade(summary.median) : rankShade(summary.median, medians),
      value,
      description:
        mode === "match"
          ? `${members(summary.count)}, median match ${value}`
          : `${members(summary.count)}, median ${value} of votes with their party`,
    };
  }

  const title =
    mode === "match"
      ? `How ${scope} from each state match you${topic ? ` on ${topic}` : ""}`
      : `How often each state's ${scope} vote with their party`;

  let finding: string;
  if (!high || !low) {
    finding =
      mode === "match"
        ? "None of these members shares a vote with you yet."
        : "None of these members has votes to count yet.";
  } else if (high.state === low.state) {
    finding =
      mode === "match"
        ? `Members from ${STATE_NAMES[high.state]} match you at a median of ${percent(high.median)}.`
        : `Members from ${STATE_NAMES[high.state]} vote with their party at a median of ${percent(high.median)}.`;
  } else {
    finding =
      mode === "match"
        ? `Members from ${STATE_NAMES[high.state]} match you most, at a median of ${percent(high.median)}. Members from ${STATE_NAMES[low.state]} match you least, at ${percent(low.median)}.`
        : `Members from ${STATE_NAMES[low.state]} vote with their party least often, at a median of ${percent(low.median)}. Members from ${STATE_NAMES[high.state]} do most often, at ${percent(high.median)}.`;
  }

  const offMap = OFF_MAP.filter((code) => summaries.has(code));
  const offMapNote =
    offMap.length === 0
      ? null
      : offMap.every((code) => summaries.get(code)!.count === 1)
        ? `Not on the map: ${listNames(offMap.map((code) => STATE_NAMES[code]))}, with ${offMap.length === 1 ? "one member" : "one member each"}.`
        : `Not on the map: ${listNames(offMap.map((code) => `${STATE_NAMES[code]} (${summaries.get(code)!.count})`))}.`;

  const rows = [...summaries]
    .map(([code, summary]) => ({ code, ...summary }))
    .sort(
      (a, b) =>
        (b.median ?? -1) - (a.median ?? -1) ||
        STATE_NAMES[a.code].localeCompare(STATE_NAMES[b.code]),
    );
  const receipt = mode === "match" ? "method-match" : "method-party-unity";

  return (
    <section
      aria-labelledby="map-title"
      className="flex flex-col gap-4 rounded-card bg-paper p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="map-title" className="text-lg leading-snug font-bold text-ink">
          {title}
        </h2>
        <p
          className="text-sm text-ink-2 tabular-nums"
          data-fact={mode === "match" ? "match" : "party-unity"}
          data-receipt-id={receipt}
        >
          {finding}
        </p>
      </div>

      <div
        ref={box}
        className="relative w-full"
        style={{ aspectRatio: `${VIEW_WIDTH} / ${MAP_HEIGHT}` }}
      >
        {visible && (
          // A new question (mode, filters, or issue) redraws the shading with a short fade.
          <div key={title} className="size-full motion-safe:animate-map-in">
            <StateMap
              shades={shades}
              selected={selected}
              highlighted={highlighted}
              onHighlight={onHighlight}
              onSelect={onSelect}
            />
          </div>
        )}
      </div>

      <figure className="flex flex-col gap-2" aria-hidden>
        <figcaption className="text-sm text-ink-2 tabular-nums">
          {mapScaleCaption({ mode, scope, scored, total })}
        </figcaption>
        {mode === "match" ? (
          <div className="grid grid-cols-5 gap-1">
            {MATCH_STEPS.map((step) => (
              <div key={step.label} className="flex flex-col gap-1">
                <span
                  className={cn("h-2.5 rounded-full", TONE_BG[step.shade.tone])}
                  style={{ opacity: step.shade.opacity }}
                />
                <span className="type-meta leading-tight text-ink-2">{step.label}</span>
              </div>
            ))}
          </div>
        ) : (
          medians.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-5 gap-1">
                {RANK_OPACITY.map((opacity) => (
                  <span key={opacity} className="h-2.5 rounded-full bg-ink-2" style={{ opacity }} />
                ))}
              </div>
              <div className="flex justify-between gap-4 type-meta text-ink-2">
                <span>Least often, {percent(Math.min(...medians))}</span>
                <span className="text-right">Most often, {percent(Math.max(...medians))}</span>
              </div>
              <span className="type-meta text-ink-2">
                Each shade holds about a fifth of the states.
              </span>
            </div>
          )
        )}
      </figure>

      {offMapNote && <p className="text-sm text-ink-2">{offMapNote}</p>}

      {mode === "party" && (
        <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-control bg-canvas p-3 pl-4 text-sm text-ink-2">
          <span className="min-w-0 flex-1 basis-56">
            Answer key votes and this map shows how each state&apos;s members match you.
          </span>
          <Button asChild>
            <Link href="/swipe">Answer key votes</Link>
          </Button>
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2">
        <span className="text-sm text-ink-2">
          {selected
            ? `${STATE_NAMES[selected]} is outlined.`
            : "Select a state to list its members."}
        </span>
        <Button
          variant="ghost"
          aria-expanded={table}
          aria-controls="map-table"
          onClick={() => setTable((open) => !open)}
          className="-mr-2 px-3"
        >
          <Table2 className="size-4" aria-hidden />
          {table ? "Hide table" : "View as table"}
        </Button>
      </div>

      {table && (
        <div
          id="map-table"
          className="max-h-96 overflow-y-auto rounded-control border border-hairline"
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-paper">
              <tr className="border-b border-hairline">
                <th scope="col" className="px-3 py-2 font-semibold text-ink-2">
                  State
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-ink-2">
                  Members
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-ink-2">
                  {mode === "match" ? "Median match" : "Median with party"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-b border-hairline last:border-0">
                  <th scope="row" className="px-1 py-0 font-normal">
                    <button
                      type="button"
                      aria-pressed={selected === row.code}
                      onClick={() => onSelect(row.code)}
                      className={cn(
                        "min-h-11 w-full rounded-control px-2 text-left can-hover:bg-badge",
                        selected === row.code ? "font-bold text-ink" : "text-ink",
                      )}
                    >
                      {STATE_NAMES[row.code]}
                    </button>
                  </th>
                  <td className="px-3 py-2 text-right text-ink tabular-nums">{row.count}</td>
                  <td className="px-3 py-2 text-right text-ink tabular-nums">
                    {row.median === null ? "No record yet" : percent(row.median)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
