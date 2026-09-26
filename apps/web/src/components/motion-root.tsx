"use client";

import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("@/lib/dom-animation").then((module) => module.default);

/**
 * Motion for the pages that animate with `m.*` components. The animation features load after the
 * page is interactive, so they never count against first-load JavaScript, and
 * reduced-motion preferences apply everywhere inside.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
