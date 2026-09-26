import type { Position } from "@for-the-people/core/client";
import { useSyncExternalStore } from "react";

/**
 * The running count while The Board replays a roll call, shared with that roll call's result bars so
 * their tallies count up with the lights. Null whenever no replay is running.
 */

export type Tally = Record<Position, number>;

let current: { id: string; tally: Tally } | null = null;
const listeners = new Set<() => void>();

export function publishReplay(id: string, tally: Tally | null): void {
  current = tally ? { id, tally } : null;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The replay's count so far for this roll call, or null when it is not replaying. */
export function useReplayTally(id: string): Tally | null {
  return useSyncExternalStore(
    subscribe,
    () => (current?.id === id ? current.tally : null),
    () => null,
  );
}
