"use client";

import { useSyncExternalStore } from "react";
import { ELECTION_DAY } from "@/lib/site";

/**
 * Days until Election Day on the visitor's own calendar, the one count every page shows (Home, Ballot,
 * Election). Null during server render and hydration, so a prerendered page never shows a stale number;
 * callers reserve the space so nothing shifts when it arrives. Re-checked each minute.
 */

const MINUTE = 60_000;

/** Whole calendar days from `now` (in its local time zone) to a YYYY-MM-DD date. */
export function daysUntil(date: string, now: Date): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, MINUTE);
  return () => window.clearInterval(timer);
}

export const useDaysUntilElection = (date: string = ELECTION_DAY): number | null =>
  useSyncExternalStore(
    subscribe,
    () => daysUntil(date, new Date()),
    () => null,
  );
