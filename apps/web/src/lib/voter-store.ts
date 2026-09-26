"use client";

import {
  DEFAULT_WEIGHT,
  VOTER_SCHEMA_VERSION,
  isVoter,
  type Voter,
  type BallotChoice,
  type Choice,
  type JourneyState,
  type Location,
  type Stance,
  type Weight,
} from "@for-the-people/core/client";
import { useSyncExternalStore } from "react";
import { clearRuntimeCaches } from "./offline-cache";

/**
 * The voter's own data lives only on this device. One small store built on
 * useSyncExternalStore: versioned, validated with the core Voter schema on every load, synced across tabs.
 */

const STORAGE_KEY = "for-the-people.voter";

type Listener = () => void;
const listeners = new Set<Listener>();
let current: Voter | null = null;

function freshVoter(): Voter {
  return {
    localId: crypto.randomUUID(),
    schemaVersion: VOTER_SCHEMA_VERSION,
    preferences: { theme: "system" },
    consent: { analytics: false },
    journey: "new",
    stances: [],
    location: null,
    ballotPlan: null,
    following: [],
  };
}

/** Rendered on the server and during hydration; the device's real state replaces it right after. */
export const SERVER_VOTER: Voter = {
  localId: "00000000-0000-4000-8000-000000000000",
  schemaVersion: VOTER_SCHEMA_VERSION,
  preferences: { theme: "system" },
  consent: { analytics: false },
  journey: "new",
  stances: [],
  location: null,
  ballotPlan: null,
  following: [],
};

function readStorage(): Voter {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshVoter();
    const parsed: unknown = JSON.parse(raw);
    return isVoter(parsed) ? parsed : freshVoter();
  } catch {
    return freshVoter();
  }
}

function write(next: Voter): void {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: keep working in memory for this visit.
  }
  for (const listener of listeners) listener();
}

function snapshot(): Voter {
  current ??= readStorage();
  return current;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = readStorage();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVoter(): Voter {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_VOTER);
}

const nowIso = () => new Date().toISOString();

const advanceJourney = (journey: JourneyState, to: JourneyState): JourneyState => {
  const order: JourneyState[] = ["new", "swiping", "matched", "planning", "planned", "following"];
  return order.indexOf(to) > order.indexOf(journey) ? to : journey;
};

/** Voter actions. They change only this device's data. */
export const voterActions = {
  recordStance(keyVoteId: string, choice: Choice, weight: Weight = DEFAULT_WEIGHT): void {
    const voter = snapshot();
    const stances = voter.stances.filter((stance) => stance.keyVoteId !== keyVoteId);
    stances.push({ keyVoteId, choice, weight, answeredAt: nowIso() });
    write({ ...voter, stances, journey: advanceJourney(voter.journey, "swiping") });
  },
  setWeight(keyVoteId: string, weight: Weight): void {
    const voter = snapshot();
    write({
      ...voter,
      stances: voter.stances.map((stance) =>
        stance.keyVoteId === keyVoteId ? { ...stance, weight } : stance,
      ),
    });
  },
  undoStance(keyVoteId: string): void {
    const voter = snapshot();
    write({ ...voter, stances: voter.stances.filter((stance) => stance.keyVoteId !== keyVoteId) });
  },
  /** Puts a removed answer back exactly as it was (the Undo in "Answer removed"). */
  restoreStance(stance: Stance): void {
    const voter = snapshot();
    const stances = voter.stances.filter((entry) => entry.keyVoteId !== stance.keyVoteId);
    stances.push(stance);
    write({ ...voter, stances });
  },
  markMatched(): void {
    const voter = snapshot();
    write({ ...voter, journey: advanceJourney(voter.journey, "matched") });
  },
  setLocation(location: Location | null): void {
    write({ ...snapshot(), location });
  },
  saveBallotChoice(
    electionId: string,
    raceId: string,
    choice: BallotChoice,
    note: string | null = null,
  ): void {
    const voter = snapshot();
    const plan =
      voter.ballotPlan?.electionId === electionId
        ? voter.ballotPlan
        : { electionId, entries: [], updatedAt: nowIso() };
    const entries = plan.entries.filter((entry) => entry.raceId !== raceId);
    entries.push({ raceId, choice, note });
    const decided = entries.filter((entry) => entry.choice.kind === "candidacy").length;
    write({
      ...voter,
      ballotPlan: { electionId, entries, updatedAt: nowIso() },
      journey: advanceJourney(voter.journey, decided > 0 ? "planned" : "planning"),
    });
  },
  setTheme(theme: Voter["preferences"]["theme"]): void {
    const voter = snapshot();
    write({ ...voter, preferences: { ...voter.preferences, theme } });
  },
  /** Removes the voter from this device, and the service worker's cached ballot answers with it. */
  clearAllData(): Promise<void> {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored.
    }
    write(freshVoter());
    return clearRuntimeCaches();
  },
};
