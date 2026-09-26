"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";

export interface ScrollEdges {
  /** More content waits before the visible part (left or top). */
  start: boolean;
  /** More content waits after it (right or bottom). */
  end: boolean;
}

/** Whether a scroller hides more content past either edge, updated as it scrolls or resizes. */
export function useScrollEdges(
  scroller: RefObject<HTMLElement | null>,
  axis: "x" | "y",
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      const offset = axis === "x" ? element.scrollLeft : element.scrollTop;
      const visible = axis === "x" ? element.clientWidth : element.clientHeight;
      const total = axis === "x" ? element.scrollWidth : element.scrollHeight;
      const start = offset > 4;
      const end = offset + visible < total - 4;
      setEdges((current) =>
        current.start === start && current.end === end ? current : { start, end },
      );
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [scroller, axis]);
  return edges;
}

/** A 24px fade on each edge where more content waits (a mask, so it works on any background). */
export function fadeMask(edges: ScrollEdges, axis: "x" | "y", size = "24px"): CSSProperties {
  const direction = axis === "x" ? "to right" : "to bottom";
  const mask = `linear-gradient(${direction}, ${edges.start ? "transparent" : "#000"}, #000 ${size}, #000 calc(100% - ${size}), ${edges.end ? "transparent" : "#000"})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
