"use client";

import type { Location } from "@for-the-people/core/client";
import { useEffect, useState } from "react";
import { ballotUrl, type BallotResponse } from "@/lib/ballot";

export type BallotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; ballot: BallotResponse }
  | { status: "error" };

/** Loads the races for the device's districts from our own API (served from cache by the service worker offline). */
export function useBallot(location: Location | null): BallotState {
  const url = location ? ballotUrl(location) : null;
  const [state, setState] = useState<{ url: string | null; value: BallotState }>({
    url: null,
    value: { status: "idle" },
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<BallotResponse>;
      })
      .then((ballot) => {
        if (!cancelled) setState({ url, value: { status: "ready", ballot } });
      })
      .catch(() => {
        if (!cancelled) setState({ url, value: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return { status: "idle" };
  return state.url === url ? state.value : { status: "loading" };
}
