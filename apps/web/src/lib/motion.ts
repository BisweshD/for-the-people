import type { Transition } from "motion/react";

/** Motion tokens, the same values as --dur-fast, --dur-base, --dur-slow and
 * --dur-reveal in globals.css (`slower` is the data-reveal duration). Use these; never inline ad-hoc timings. */

export const duration = { fast: 0.12, base: 0.2, slow: 0.3, slower: 0.48 } as const;

export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 34 },
  soft: { type: "spring", stiffness: 260, damping: 28 },
  oval: { type: "spring", stiffness: 420, damping: 22 },
} as const satisfies Record<string, Transition>;

export const easeOut = [0.22, 1, 0.36, 1] as const;
export const easeIn = [0.64, 0, 0.78, 0] as const;

/** Exits run at 0.8x the enter duration with an ease-in curve. */
export const exit = (seconds: number): Transition => ({ duration: seconds * 0.8, ease: easeIn });

export const stagger = { list: 0.04, receipt: 0.018, reveal: 0.04 } as const;
