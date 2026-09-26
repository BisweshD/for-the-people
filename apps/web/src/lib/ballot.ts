import {
  parseDistrictId,
  type Location,
  type Party,
  type StateCode,
} from "@for-the-people/core/client";
import type { KeyVoteRecord } from "@for-the-people/data/read";
import { districtLabel, STATE_NAMES } from "./format";
import type { ReceiptView } from "./views";

/** Ballot view models shared by the ballot page, the cheat sheet, and GET /api/ballot. */

export const GENERAL_ELECTION_ID = "2026-11-03-general";

/** A static calendar file for Election Day (public/election-day-2026.ics). */
export const ICS_PATH = "/election-day-2026.ics";

export interface FinanceView {
  receipts: number;
  individual: number;
  cashOnHand: number;
  asOf: string;
  receipt: ReceiptView;
}

export interface CandidateView {
  /** The FEC candidacy id, or `<race id>|state:<name>` for a name on a state's list with no FEC filing. */
  candidacyId: string;
  /** Null for a name on a state's list that matches no FEC filing: no record or money to show. */
  personId: string | null;
  /** As the state's list prints it when the candidate is on one; otherwise as filed with the FEC. */
  name: string;
  party: Party;
  /** The state's own party label (for example "Forward Party"); null for FEC-only lists. */
  partyLabel: string | null;
  incumbent: boolean;
  fecCandidateId: string | null;
  portrait: { asset: string; sourceId: string; placeholder: null } | null;
  /** Someone who served in Congress before the 119th: no votes on these key votes, a record elsewhere. */
  formerMember: { bioguideUrl: string } | null;
  /** Where this candidacy comes from: the state's list for a name on it, else the FEC filing. */
  receipt: ReceiptView;
  /** The FEC filing, when there is one. */
  filing: ReceiptView | null;
  finance: FinanceView | null;
}

/**
 * Where a race's choices come from. "certified" and "official-primary-results" are state lists
 * (data/candidates-2026-senate.json); "pending" means a state list is expected but could not be read, so
 * the FEC filings stand in; "filed" is an FEC-only race (every House race).
 */
export type CandidateListStatus = "certified" | "official-primary-results" | "pending" | "filed";

export interface CandidateListView {
  status: CandidateListStatus;
  /** The state's list (or, while pending, the state page it will come from); null for FEC-only races. */
  receipt: ReceiptView | null;
  /** The file's note on this list, for example why it is pending. */
  note: string | null;
}

export interface RaceView {
  id: string;
  electionId: string;
  special: boolean;
  chamber: "house" | "senate";
  state: StateCode;
  /** Ballot district number for House races (0 = at-large); null for the Senate. */
  district: number | null;
  receipt: ReceiptView;
  list: CandidateListView;
  /** The choices in the plan, alphabetical by last name. */
  candidates: CandidateView[];
  /** FEC filers for the seat who are not on the state's list. Shown collapsed, never as choices. */
  otherFilings: CandidateView[];
}

/** True when a race's choices come from an official state list rather than FEC filings. */
export const hasStateList = (race: Pick<RaceView, "list">): boolean =>
  race.list.status === "certified" || race.list.status === "official-primary-results";

export interface BallotResponse {
  races: RaceView[];
  /** VotePositions on the key votes for the candidates who served in Congress, so matches run on the device. */
  record: KeyVoteRecord;
}

export interface MapStatusView {
  kind: "redrawn" | "uncertain";
  officialSource: string;
}

export interface StateOfficeView {
  name: string;
  url: string;
}

export interface BallotDistricts {
  state: StateCode;
  serving: number | null;
  /** One district when settled; two when the state's 2026 map is still in court. */
  ballot: number[];
}

/** Reads the district numbers out of a Location's ids. */
export function ballotDistricts(location: Location): BallotDistricts {
  const parsed = location.districts.map(parseDistrictId);
  return {
    state: location.state,
    serving: parsed.find((district) => district.mapVersion === "cd119")?.number ?? null,
    ballot: parsed
      .filter((district) => district.mapVersion === "cd120")
      .map((district) => district.number),
  };
}

/** The one URL a ballot is fetched from, so the service worker can serve the same response offline. */
export function ballotUrl(location: Location): string {
  const ids = location.districts.filter((id) => id.endsWith("@cd120")).toSorted();
  const params = new URLSearchParams({ state: location.state });
  if (ids.length > 0) params.set("districts", ids.join(","));
  return `/api/ballot?${params.toString()}`;
}

export function raceTitle(
  race: Pick<RaceView, "chamber" | "state" | "district" | "special">,
): string {
  if (race.chamber === "senate")
    return `U.S. Senate, ${STATE_NAMES[race.state]}${race.special ? " (special election)" : ""}`;
  return `U.S. House, ${districtLabel(race.state, race.district)}`;
}

/**
 * What a race without a state list says about its names. They are FEC filings, which show neither
 * primary results nor withdrawals, and the FEC job keeps only statutory candidates, so the list can be
 * long and can also miss people; it is shown whole and alphabetical, and says so.
 */
export function fecListNote(count: number): string {
  const shown =
    count === 1
      ? "It has one FEC filing."
      : `All ${count} FEC filings are shown, in alphabetical order.`;
  return `This list comes from FEC filings. It may include people who lost a primary or dropped out, and may leave out candidates who have not filed with the FEC. ${shown}`;
}

/**
 * The one "Raised through" date for a race's header: the report date most of its candidates share
 * (the latest such date on a tie). A row names its own date only when it differs. Null without money.
 */
export function raceMoneyDate(
  candidates: ReadonlyArray<Pick<CandidateView, "finance">>,
): string | null {
  const counts = new Map<string, number>();
  for (const { finance } of candidates)
    if (finance) counts.set(finance.asOf, (counts.get(finance.asOf) ?? 0) + 1);
  const [first] = [...counts].toSorted(
    ([dateA, a], [dateB, b]) => b - a || dateB.localeCompare(dateA),
  );
  return first?.[0] ?? null;
}

export interface RaceNote {
  text: string;
  /** The official state page or statute the note is taken from. */
  source: { label: string; url: string };
}

const GEORGIA_RUNOFF: RaceNote = {
  text: "Georgia requires a majority to win. If no candidate gets more than half of the votes on November 3, the top two meet in a runoff on December 1, 2026.",
  source: {
    label: "Georgia Code 21-2-501, as amended by SB 202 (2021)",
    url: "https://www.legis.ga.gov/api/legislation/document/20212022/201498",
  },
};
const MAINE_RCV: RaceNote = {
  text: "Maine uses ranked-choice voting in general elections for Congress: when three or more candidates are on the ballot, you can rank them in order of choice.",
  source: {
    label: "Maine Secretary of State",
    url: "https://www.maine.gov/sos/elections-voting/ranked-choice-voting-frequently-asked-questions",
  },
};
const ALASKA_RCV: RaceNote = {
  text: "Alaska's general election uses ranked-choice voting: the top four finishers from the August 18 primary are on the ballot, you can rank them, and the winner needs more than half of the votes.",
  source: {
    label: "Alaska Division of Elections",
    url: "https://www.elections.alaska.gov/election-information/",
  },
};

/**
 * How a state runs its 2026 races for Congress, from each state's official election office or statute
 *. Keyed by state, then by chamber.
 */
export const STATE_RACE_NOTES: Partial<
  Record<StateCode, Partial<Record<"house" | "senate", RaceNote>>>
> = {
  AK: { house: ALASKA_RCV, senate: ALASKA_RCV },
  CA: {
    house: {
      text: "California uses a top-two primary: the two candidates with the most votes in the June 2 primary are on the November ballot, whatever their party, so both can be from the same party.",
      source: {
        label: "California Secretary of State",
        url: "https://www.sos.ca.gov/elections/primary-elections-california",
      },
    },
  },
  GA: { house: GEORGIA_RUNOFF, senate: GEORGIA_RUNOFF },
  LA: {
    house: {
      text: "Louisiana's U.S. House election on November 3 is an open primary: every candidate is on one ballot, whatever their party. If no one wins a majority, the top two meet in a runoff on December 12, 2026.",
      source: {
        label: "Louisiana Secretary of State (Act 7 of 2026)",
        url: "https://www.sos.la.gov/elections-voting/election-dates",
      },
    },
    senate: {
      text: "Louisiana held closed party primaries for U.S. Senate on May 16, with a party runoff on June 27, 2026. On November 3 the nominees meet, and the candidate with the most votes wins; no majority is required.",
      source: {
        label: "Louisiana Secretary of State",
        url: "https://www.sos.la.gov/elections-voting/closed-party-primary-elections",
      },
    },
  },
  ME: { house: MAINE_RCV, senate: MAINE_RCV },
  WA: {
    house: {
      text: "Washington uses a top-two primary: the two candidates with the most votes in the August 4 primary are on the November ballot, even if they prefer the same party.",
      source: {
        label: "Washington Secretary of State",
        url: "https://www.sos.wa.gov/elections/voters/helpful-information/top-two-primary-faqs-voters",
      },
    },
  },
};

/**
 * Where a state's 2026 map is in court, one sentence on where the case stands, from
 * data/redistricting-2026.json (its officialSource is linked beside it). Update it when that file changes.
 */
export const MAP_DISPUTE_NOTES: Partial<Record<StateCode, string>> = {
  MO: "On September 3, 2026, the Missouri Supreme Court ordered the map used in 2024 for this election. On September 21, a federal appeals court ordered the new map instead, paused until September 28, and the U.S. Supreme Court has been asked to decide.",
};
