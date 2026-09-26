"use client";

import type { CSSProperties } from "react";
import { PositionGlyph, glossedPosition } from "@/components/rollcall/position-cell";
import { useReplayTally } from "@/components/rollcall/replay-store";
import type { RollCallRow } from "@/lib/bill-views";
import { formatInteger } from "@/lib/format";
import { requirementText, resultLabel, voteMargin } from "@/lib/vote-margin";
import { cn } from "@/lib/utils";

/**
 * A roll call's result as one bar: the Yea votes as a filled ink segment from the left, the Nay votes as
 * a hollow segment from the right, and a tick where the Yea side had to reach. Shape and words carry
 * Yea and Nay, never color. The segments grow out from the tick once on first paint (CSS, transform
 * only, 320 ms); reduced motion shows them settled. While The Board replays this roll call, both
 * segments and their counts follow the replay's running tally.
 *
 * "full" leads the roll call page with the result in words; "compact" sits on The Board.
 */
export function ResultBar({
  rollCall,
  variant,
}: {
  rollCall: RollCallRow;
  variant: "full" | "compact";
}) {
  const replay = useReplayTally(rollCall.id);
  const { yea, nay, present, notVoting } = rollCall.totals;
  const margin = voteMargin(rollCall);
  const shown = {
    yea: replay?.Yea ?? yea,
    nay: replay?.Nay ?? nay,
    present: replay?.Present ?? present,
    notVoting: replay?.NotVoting ?? notVoting,
  };
  const requirement = requirementText(rollCall);
  const full = variant === "full";
  const others = [
    { final: present, now: shown.present, words: "Present (neither)" },
    { final: notVoting, now: shown.notVoting, words: "not voting" },
  ].filter((part) => part.final > 0);

  return (
    <div
      className={cn("flex flex-col", full ? "gap-3" : "gap-2")}
      data-fact={full ? "roll-call-result" : "roll-call-totals"}
      data-receipt-id={rollCall.receipt.sourceId}
    >
      {full && (
        <div className="flex flex-col gap-1">
          <p className="type-meta font-bold text-ink-2">Result</p>
          <p className="text-3xl leading-tight font-extrabold tracking-tight text-ink tabular-nums">
            {margin?.label ?? resultLabel(rollCall)}
          </p>
        </div>
      )}
      {margin && (
        <Bar
          yea={yea}
          nay={nay}
          scale={margin.scale}
          needed={margin.needed}
          replay={replay ? { yea: replay.Yea, nay: replay.Nay } : null}
          full={full}
        />
      )}
      <p className="sr-only">
        {formatInteger(yea)} Yea and {formatInteger(nay)} Nay
        {margin?.needed != null ? `. ${formatInteger(margin.needed)} Yea votes were needed.` : "."}
      </p>
      <div
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-base text-ink tabular-nums"
        aria-hidden
      >
        <span className="inline-flex items-center gap-2">
          <PositionGlyph position="Yea" />
          <span>
            <span className="font-bold">{formatInteger(shown.yea)}</span> {glossedPosition("Yea")}
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span>
            <span className="font-bold">{formatInteger(shown.nay)}</span> {glossedPosition("Nay")}
          </span>
          <PositionGlyph position="Nay" />
        </span>
      </div>
      {others.length > 0 && (
        <p className="type-meta text-ink-2 tabular-nums">
          <span aria-hidden>
            {others.map((part) => `${formatInteger(part.now)} ${part.words}`).join(", ")}
          </span>
          <span className="sr-only">
            {others.map((part) => `${formatInteger(part.final)} ${part.words}`).join(", ")}
          </span>
        </p>
      )}
      {full && requirement && (
        <p
          className="type-meta text-ink-2"
          data-fact="roll-call-threshold"
          data-receipt-id={rollCall.receipt.sourceId}
        >
          {requirement}.
        </p>
      )}
      {full && rollCall.tieBreaker && (
        <p className="type-meta text-ink-2">
          Tie broken by the {rollCall.tieBreaker.by}, voting {rollCall.tieBreaker.vote}.
        </p>
      )}
    </div>
  );
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;

function Bar({
  yea,
  nay,
  scale,
  needed,
  replay,
  full,
}: {
  yea: number;
  nay: number;
  scale: number;
  needed: number | null;
  replay: { yea: number; nay: number } | null;
  full: boolean;
}) {
  const yeaShare = yea / scale;
  const nayShare = nay / scale;
  const tick = needed === null ? null : needed / scale;
  // Each segment grows out from the tick: its transform origin is the tick, in the segment's own width.
  const grow = (start: number, share: number, fallback: number): CSSProperties => ({
    transformOrigin: `${percent(share > 0 && tick !== null ? clamp((tick - start) / share) : fallback)} 50%`,
  });
  const fill = (lit: number | undefined, total: number): CSSProperties =>
    lit === undefined ? {} : { transform: `scaleX(${total > 0 ? lit / total : 0})` };

  return (
    <div className={cn("relative", full && tick !== null && "pt-7")} aria-hidden>
      <div className={cn("relative", full ? "h-6" : "h-3")}>
        {yea > 0 && (
          <div
            className="animate-result-grow absolute inset-y-0 left-0"
            style={{ width: `calc(${percent(yeaShare)} - 1px)`, ...grow(0, yeaShare, 0) }}
          >
            <div
              className="result-fill size-full origin-left rounded-l-input bg-ink"
              style={fill(replay?.yea, yea)}
            />
          </div>
        )}
        {nay > 0 && (
          <div
            className="animate-result-grow absolute inset-y-0 right-0"
            style={{
              width: `calc(${percent(nayShare)} - 1px)`,
              ...grow(1 - nayShare, nayShare, 1),
            }}
          >
            <div
              className={cn(
                "result-fill size-full origin-right rounded-r-input border-ink bg-paper",
                full ? "border-2" : "border-[1.5px]",
              )}
              style={fill(replay?.nay, nay)}
            />
          </div>
        )}
        {tick !== null && (
          <div
            className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 bg-ink ring-2 ring-paper"
            style={{ left: percent(tick) }}
          />
        )}
      </div>
      {full && tick !== null && needed !== null && (
        <span
          className="absolute top-0 -translate-x-1/2 text-sm font-bold whitespace-nowrap text-ink-2 tabular-nums"
          style={{ left: percent(tick) }}
        >
          {formatInteger(needed)} needed
        </span>
      )}
    </div>
  );
}
