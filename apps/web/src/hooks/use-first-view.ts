"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * Calls `onFirstView` once, the first time the element is at least `amount` visible. Used to start a
 * chart's signature animation when the reader reaches it, not while it is off screen.
 */
export function useFirstView(
  ref: RefObject<Element | null>,
  amount: number,
  onFirstView: () => void,
  enabled = true,
): void {
  const fire = useEffectEvent(onFirstView);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          fire();
        }
      },
      { threshold: amount },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, amount, enabled]);
}
