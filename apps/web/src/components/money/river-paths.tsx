"use client";

import { useEffect, useRef } from "react";
import { useInView } from "@/hooks/use-in-view";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * The flows of the money river. The chart's height is fixed in pixels and only its width stretches
 * (preserveAspectRatio="none"), so each path is laid out once on the server in pixel rows and keeps its exact
 * thickness at any width (non-scaling strokes). Once the chart scrolls into view the flows grow out of the
 * source bars with a single transform; with reduced motion they are simply there.
 */
export function RiverPaths({
  links,
  height,
}: {
  links: Array<{ key: string; y0: number; y1: number; width: number }>;
  height: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView || reduce || !ref.current) return;
    ref.current.animate(
      [
        { transform: "scaleX(0)", opacity: 0.4 },
        { transform: "scaleX(1)", opacity: 1 },
      ],
      { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
    );
  }, [inView, reduce]);
  return (
    <svg
      ref={ref}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-y-0 left-2.5 h-full w-[calc(100%-1.25rem)] origin-left overflow-visible"
      aria-hidden
    >
      {links.map((link) => (
        <path
          key={link.key}
          d={`M0,${link.y0}C50,${link.y0} 50,${link.y1} 100,${link.y1}`}
          fill="none"
          strokeWidth={Math.max(1, link.width)}
          vectorEffect="non-scaling-stroke"
          className="stroke-ink-3-graphic"
          strokeOpacity={0.35}
        />
      ))}
    </svg>
  );
}
