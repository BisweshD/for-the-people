"use client";

import { useEffect, useRef } from "react";
import { IssueIcon } from "@/components/issue-icon";

/**
 * Issue icons that react when their chip is tapped. Transform and opacity only,
 * played with the Web Animations API. `tick` counts taps: 0 is the icon at rest, and each new tick
 * plays the reaction once.
 * Vote and Coins are drawn from their Lucide paths so a part can move: the ballot drops into the box,
 * and a coin drops onto the stack.
 */

interface Reaction {
  x?: number[];
  y?: number[];
  rotate?: number[];
  scale?: number[];
  scaleY?: number[];
  opacity?: number[];
  delay?: number;
}

const DURATION = 500;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const REACTIONS: Record<string, Reaction> = {
  HeartPulse: { scale: [1, 1.22, 0.96, 1] },
  Leaf: { rotate: [0, -16, 8, 0] },
  Scale: { rotate: [0, -10, 10, 0] },
  GraduationCap: { y: [0, -5, 0], rotate: [0, -10, 0] },
  Landmark: { scale: [1, 0.88, 1.06, 1] },
  Target: { scale: [1, 0.8, 1.1, 1] },
  Stethoscope: { rotate: [0, 12, -6, 0] },
  Signpost: { rotate: [0, -12, 8, 0] },
  HardHat: { y: [0, -4, 0] },
  Cpu: { rotate: [0, 90] },
  Container: { x: [0, 4, -2, 0] },
  Globe: { rotate: [0, 30, 0] },
};

/** Turns per-property value lists into evenly spaced keyframes (the last value is held). */
function keyframes(reaction: Reaction): Keyframe[] {
  const tracks = [
    reaction.x,
    reaction.y,
    reaction.rotate,
    reaction.scale,
    reaction.scaleY,
    reaction.opacity,
  ];
  const length = Math.max(...tracks.map((track) => track?.length ?? 0));
  const at = (track: number[] | undefined, index: number, rest: number) =>
    track ? (track[Math.min(index, track.length - 1)] ?? rest) : rest;
  return Array.from({ length }, (_, index) => {
    const transform = `translate(${at(reaction.x, index, 0)}px, ${at(reaction.y, index, 0)}px) rotate(${at(reaction.rotate, index, 0)}deg) scale(${at(reaction.scale, index, 1)}) scaleY(${at(reaction.scaleY, index, 1)})`;
    return reaction.opacity
      ? { transform, opacity: at(reaction.opacity, index, 1) }
      : { transform };
  });
}

/** Plays `reaction` on the element each time `tick` goes up. */
function useReaction<T extends Element>(tick: number, reaction: Reaction | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (tick === 0 || !reaction || !ref.current) return;
    ref.current.animate(keyframes(reaction), {
      duration: DURATION,
      delay: reaction.delay ?? 0,
      easing: EASE_OUT,
    });
  }, [tick, reaction]);
  return ref;
}

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const BALLOT_DROP: Reaction = { y: [-9, 0], opacity: [0, 1, 1] };
const BOX_SQUASH: Reaction = { scaleY: [1, 0.9, 1], delay: 200 };
const COIN_DROP: Reaction = { y: [-8, 0.8, 0], opacity: [0, 1, 1] };
const ORIGIN_BOTTOM = { transformBox: "fill-box", transformOrigin: "bottom" } as const;

function VoteIcon({ tick, className }: { tick: number; className?: string }) {
  const ballot = useReaction<SVGPathElement>(tick, BALLOT_DROP);
  const box = useReaction<SVGPathElement>(tick, BOX_SQUASH);
  return (
    <svg {...SVG_PROPS} className={className}>
      <path ref={ballot} d="m9 12 2 2 4-4" />
      <path ref={box} d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z" style={ORIGIN_BOTTOM} />
      <path d="M22 19H2" />
    </svg>
  );
}

function CoinsIcon({ tick, className }: { tick: number; className?: string }) {
  const coin = useReaction<SVGGElement>(tick, COIN_DROP);
  return (
    <svg {...SVG_PROPS} className={className}>
      <path d="M13.744 17.736a6 6 0 1 1-7.48-7.48" />
      <path d="m6.134 14.768.866-.5 2 3.464" />
      <g ref={coin}>
        <path d="M15 6h1v4" />
        <circle cx="16" cy="8" r="6" />
      </g>
    </svg>
  );
}

export function IssueChipIcon({
  name,
  tick,
  reduce,
  className,
}: {
  name: string;
  tick: number;
  reduce: boolean;
  className?: string;
}) {
  const active = reduce ? 0 : tick;
  const icon = useReaction<HTMLSpanElement>(active, REACTIONS[name]);
  if (name === "Vote") return <VoteIcon tick={active} className={className} />;
  if (name === "Coins") return <CoinsIcon tick={active} className={className} />;
  return (
    <span ref={icon} className="inline-flex">
      <IssueIcon name={name} className={className} />
    </span>
  );
}
