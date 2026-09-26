"use client";

import type { KeyVoteRecord } from "@for-the-people/data/read";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import type { MemberView } from "@/lib/views";
import { useVoter } from "@/lib/voter-store";

/**
 * What the voting journey needs to rank members on the device: the key votes, every serving member,
 * and their positions. /swipe passes it from the server; Home asks /api/match-data for it only when a
 * returning voter has enough answers to show a match, so a first visit never downloads it.
 */
export interface MatchData {
  record: KeyVoteRecord;
  members: MemberView[];
}

const MatchDataContext = createContext<MatchData | null>(null);

export function MatchDataProvider({ value, children }: { value: MatchData; children: ReactNode }) {
  return <MatchDataContext.Provider value={value}>{children}</MatchDataContext.Provider>;
}

/**
 * Home's provider: fetches the match data once the saved answers call for it (`minDecided` Yea or Nay
 * answers). Until then, and if the request fails, children see no data and show no match.
 */
export function FetchedMatchData({
  minDecided,
  children,
}: {
  minDecided: number;
  children: ReactNode;
}) {
  const voter = useVoter();
  const hydrated = useHydrated();
  const decided = voter.stances.filter((stance) => stance.choice !== "Skip").length;
  const wanted = hydrated && decided >= minDecided;
  const [data, setData] = useState<MatchData | null>(null);
  useEffect(() => {
    if (!wanted || data) return;
    const controller = new AbortController();
    fetch("/api/match-data", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<MatchData>) : null))
      .then((value) => {
        if (value) setData(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [wanted, data]);
  return <MatchDataContext.Provider value={data}>{children}</MatchDataContext.Provider>;
}

/** The match data in scope, or null (none on this page, or not fetched yet). */
export const useMatchData = () => useContext(MatchDataContext);
