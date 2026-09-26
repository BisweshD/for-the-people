"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/** The glide Matches uses when a weight change reorders the list. */
const REORDER = { duration: 420, easing: "cubic-bezier(0.2, 1.1, 0.35, 1)" };

/**
 * FLIP reordering with the Web Animations API: every element under `container` with a
 * `data-flip` key glides from where it was to where it is now after each render. It replaces a
 * layout-animation library for lists that reorder (Matches when weights change, the Swipe rail) or
 * close a gap (You, when an answer is removed). Positions are measured against the container, so
 * scrolling between renders never reads as a move.
 */
export function useFlip(
  container: RefObject<HTMLElement | null>,
  enabled: boolean,
  timing: { duration: number; easing: string } = REORDER,
) {
  const previous = useRef(new Map<string, { left: number; top: number }>());
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const next = new Map<string, { left: number; top: number }>();
    for (const element of root.querySelectorAll<HTMLElement>("[data-flip]")) {
      const key = element.dataset.flip!;
      const rect = element.getBoundingClientRect();
      const place = { left: rect.left - origin.left, top: rect.top - origin.top };
      next.set(key, place);
      const before = previous.current.get(key);
      if (!enabled || !before) continue;
      const dx = before.left - place.left;
      const dy = before.top - place.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        timing,
      );
    }
    previous.current = next;
  });
}
