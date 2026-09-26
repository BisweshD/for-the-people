"use client";

import { lazy, Suspense } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

const NumberFlow = lazy(() => import("@number-flow/react"));

/**
 * A number whose digits roll when it changes (NumberFlow). The page renders and hydrates with the
 * plain number; the rolling component loads afterward, so it never counts against first-load
 * JavaScript.
 */
export function RollingNumber({
  value,
  suffix = "",
  animated = true,
  duration,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  suffix?: string;
  animated?: boolean;
  /** The roll's length in ms; NumberFlow's own 900 ms when left out. */
  duration?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const timing =
    duration === undefined
      ? {}
      : {
          transformTiming: { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          spinTiming: { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        };
  const hydrated = useHydrated();
  const plain = (
    <span className={className} aria-label={ariaLabel}>
      {value}
      {suffix}
    </span>
  );
  if (!hydrated) return plain;
  return (
    <Suspense fallback={plain}>
      <NumberFlow
        value={value}
        suffix={suffix}
        animated={animated}
        {...timing}
        className={className}
        aria-label={ariaLabel}
      />
    </Suspense>
  );
}
