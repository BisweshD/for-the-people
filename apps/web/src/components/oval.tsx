import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The ballot oval: For The People's one decorative motif.
 * Filled means chosen; hollow means not chosen. Ink floods in from the pen point (the left edge).
 * Pure SVG and CSS, so the motif costs no JavaScript on any page.
 */

/** "you" is the voter's own mark: marigold with an ink edge (marigold alone is about 1.9:1 on paper). */
export type OvalTone = "ink" | "marigold" | "agree" | "split" | "current" | "you";

const TONE_FILL: Record<OvalTone, string> = {
  ink: "fill-ink",
  marigold: "fill-marigold",
  agree: "fill-agree",
  split: "fill-split",
  current: "fill-marigold",
  you: "fill-you-mark",
};

const TONE_STROKE: Record<OvalTone, string> = {
  ink: "stroke-ink",
  marigold: "stroke-marigold",
  agree: "stroke-agree",
  split: "stroke-split",
  current: "stroke-ink",
  you: "stroke-ink",
};

/** An answer oval beside a member's vote: 22px wide with a 1.5px outline (2.2 of 32 viewBox units). */
export const ANSWER_OVAL = { size: 22, stroke: 2.2 } as const;

/**
 * A person's answer on a key vote (profiles, Compare): a filled oval and the word, "● Yea" or "● Nay".
 * The fill says "marked" and the word says which way; an empty oval only ever means "not marked".
 * The voter's own marks are marigold with an ink edge; a friend's are ink.
 */
export function AnswerMark({
  side,
  mine = true,
  who,
  empty = "Not answered",
  className,
}: {
  side: "Yea" | "Nay" | null;
  /** The word beside an empty oval ("Not answered", "Skipped"). */
  empty?: string;
  /** The voter's own answer (marigold); false for a friend's (ink). */
  mine?: boolean;
  /** Read before the answer, and shown only below 768px, where no column header names it. */
  who?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <Oval filled={side !== null} tone={mine ? "you" : "ink"} {...ANSWER_OVAL} animate={false} />
      <span className={side ? "font-bold text-ink" : "text-ink-2"}>
        {who && <span className="md:sr-only">{who}: </span>}
        {side ?? empty}
      </span>
    </span>
  );
}

export interface OvalProps {
  filled: boolean;
  tone?: OvalTone;
  /** Width in pixels; height follows the 1.6:1 ballot ratio. */
  size?: number;
  /** Draw a slash through a hollow oval (used for "split" markers so meaning never rests on color). */
  slashed?: boolean;
  /** Draw a paper check inside a filled oval (used for "agree" markers). */
  checked?: boolean;
  /** Animate the fill from the pen point. Off for static markers. */
  animate?: boolean;
  className?: string;
  /** Screen-reader text. Leave empty when a visible label sits beside the oval. */
  label?: string;
  /**
   * A CSS custom property (for example "--lean-yea") holding a 0 to 1 partial fill that follows a
   * gesture. Set it on any ancestor; it is ignored once `filled` is true.
   */
  progressVar?: `--${string}`;
  /** Outline width in viewBox units (the oval is 32 wide). */
  stroke?: number;
  /** A fixed partial fill from 0 to 1 (a score, or the current step). Ignored once `filled` is true. */
  fraction?: number;
  /** Play the ink flood once on mount, after this many milliseconds (a filled oval only). */
  inkDelayMs?: number;
  /** A neutral dashed outline for "Not answered": no side taken, so no tone and no fill. */
  dashed?: boolean;
}

export function Oval({
  filled,
  tone = "ink",
  size = 28,
  slashed = false,
  checked = false,
  animate = true,
  className,
  label,
  progressVar,
  stroke,
  fraction,
  inkDelayMs,
  dashed = false,
}: OvalProps) {
  const clipId = useId();
  const height = Math.round(size / 1.6);
  const scale = filled
    ? "1"
    : progressVar
      ? `var(${progressVar}, 0)`
      : String(Math.min(1, Math.max(0, fraction ?? 0)));
  return (
    <svg
      viewBox="0 0 32 20"
      width={size}
      height={height}
      className={cn("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <ellipse cx="16" cy="10" rx="14.25" ry="8.25" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle
          cx="2"
          cy="10"
          r="32"
          className={cn(
            TONE_FILL[tone],
            "oval-fill",
            filled && inkDelayMs !== undefined && "animate-oval-fill-once",
          )}
          style={{
            animationDelay: filled && inkDelayMs !== undefined ? `${inkDelayMs}ms` : undefined,
            transform: `scale(${scale})`,
            // While a gesture drives the fill it must track the finger, not ease behind it.
            transition: animate && !(progressVar && !filled) ? undefined : "none",
          }}
        />
      </g>
      <ellipse
        cx="16"
        cy="10"
        rx="14.25"
        ry="8.25"
        fill="none"
        strokeWidth={stroke ?? (tone === "current" ? 2.5 : 1.75)}
        strokeDasharray={dashed ? "3.4 2.6" : undefined}
        className={dashed ? "stroke-ink-3-graphic" : TONE_STROKE[tone]}
      />
      {checked && filled && (
        <path
          d="M10.5 10.5 L14.5 14.25 L21.5 6.75"
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-paper"
        />
      )}
      {slashed && !filled && (
        <line
          x1="8"
          y1="17"
          x2="24"
          y2="3"
          strokeWidth={stroke ?? 1.75}
          strokeLinecap="round"
          className={TONE_STROKE[tone]}
        />
      )}
    </svg>
  );
}
