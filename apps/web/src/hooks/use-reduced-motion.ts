"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

/** True when the visitor asked for reduced motion. False during server render and hydration. */
export const useReducedMotion = (): boolean => useMediaQuery("(prefers-reduced-motion: reduce)");
