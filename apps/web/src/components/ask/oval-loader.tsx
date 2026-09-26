"use client";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useId } from "react";

/**
 * The loading state is an oval that fills and empties. It is visual only:
 * Ask's one persistent live region says "Checking the record" for screen readers.
 */
export function OvalLoader({ label }: { label: string }) {
  const clipId = useId();
  const reduce = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-3 text-sm font-semibold text-ink-2">
      <svg
        viewBox="0 0 32 20"
        width={30}
        height={19}
        aria-hidden
        className="shrink-0 overflow-visible"
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
            className={cn("oval-fill fill-ink", reduce ? "opacity-40" : "animate-oval-breathe")}
            style={reduce ? { transform: "scale(0.5)" } : undefined}
          />
        </g>
        <ellipse
          cx="16"
          cy="10"
          rx="14.25"
          ry="8.25"
          fill="none"
          strokeWidth={1.75}
          className="stroke-ink"
        />
      </svg>
      {label}
    </span>
  );
}
