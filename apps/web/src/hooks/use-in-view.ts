"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True once the element has scrolled into view (with an optional root margin), then stays true.
 * A small IntersectionObserver hook, so pages that only need "has it appeared yet" do not load an
 * animation library for it.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { margin = "0px" }: { margin?: string } = {},
): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin, seen]);
  return seen;
}
