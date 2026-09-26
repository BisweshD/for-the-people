/**
 * Constants and id helpers with no Zod dependency, so browser code can use them without shipping a
 * schema library. The Zod schemas in ids.ts,
 * civic.ts and voter.ts are built from these same values, so the two can never disagree.
 */

export const STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
  "AS",
  "GU",
  "MP",
  "PR",
  "VI",
] as const;
type StateCodeValue = (typeof STATE_CODES)[number];

export const CHAMBERS = ["house", "senate"] as const;
type ChamberValue = (typeof CHAMBERS)[number];

/** Party codes for tags. Always shown with a letter, never color alone. */
export const PARTY_CODES = ["D", "R", "I", "L", "G", "O"] as const;
type PartyValue = (typeof PARTY_CODES)[number];

export const PARTY_NAMES: Record<PartyValue, string> = {
  D: "Democrat",
  R: "Republican",
  I: "Independent",
  L: "Libertarian",
  G: "Green",
  O: "Other",
};

export const BIOGUIDE_PATTERN = /^[A-Z]\d{6}$/;
export const FEC_CANDIDATE_PATTERN = /^[HSP][0-9][A-Z0-9]{2}[0-9]{5}$/;
export const FEC_COMMITTEE_PATTERN = /^C\d{8}$/;
export const FEC_PERSON_PATTERN = /^fec:[HSP][0-9][A-Z0-9]{2}[0-9]{5}$/;
export const MAP_VERSION_PATTERN = /^cd1\d{2}$/;
export const DISTRICT_ID_PATTERN = /^([A-Z]{2})-(\d{1,2})@(cd1\d{2})$/;
export const ROLL_CALL_ID_PATTERN = /^(house|senate)-(\d{2,3})-([12])-(\d+)$/;
export const MEASURE_ID_PATTERN = /^\d{2,3}-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-\d+$/;
export const KEY_VOTE_ID_PATTERN = /^kv-[a-z0-9-]+$/;
export const ELECTION_ID_PATTERN =
  /^\d{4}-\d{2}-\d{2}-(general|primary|special|runoff)(-[A-Z]{2})?$/;

export const isStateCode = (value: unknown): value is StateCodeValue =>
  typeof value === "string" && (STATE_CODES as readonly string[]).includes(value);

export const isMeasureId = (value: unknown): value is string =>
  typeof value === "string" && MEASURE_ID_PATTERN.test(value);

export const isRollCallId = (value: unknown): value is string =>
  typeof value === "string" && ROLL_CALL_ID_PATTERN.test(value);

export const isPersonId = (value: unknown): value is string =>
  typeof value === "string" && (BIOGUIDE_PATTERN.test(value) || FEC_PERSON_PATTERN.test(value));

/** URL-safe form of a PersonId (`fec:H6CA12345` becomes `fec-H6CA12345`). Bioguide ids never contain a dash. */
export const personIdToSlug = (id: string): string => id.replace(":", "-");
export const personIdFromSlug = (slug: string): string | null => {
  const candidate = slug.startsWith("fec-") ? `fec:${slug.slice(4)}` : slug;
  return isPersonId(candidate) ? candidate : null;
};

export function parseDistrictId(id: string): {
  state: StateCodeValue;
  number: number;
  mapVersion: string;
} {
  const match = DISTRICT_ID_PATTERN.exec(id);
  if (!match || !isStateCode(match[1])) throw new Error(`Invalid district id: ${id}`);
  return { state: match[1], number: Number(match[2]), mapVersion: match[3]! };
}

export function parseRollCallId(id: string): {
  chamber: ChamberValue;
  congress: number;
  session: 1 | 2;
  number: number;
} {
  const match = ROLL_CALL_ID_PATTERN.exec(id);
  if (!match) throw new Error(`Invalid roll call id: ${id}`);
  return {
    chamber: match[1] as ChamberValue,
    congress: Number(match[2]),
    session: match[3] === "2" ? 2 : 1,
    number: Number(match[4]),
  };
}

// Voter constants (the Voter schema lives in voter.ts).

export const VOTER_SCHEMA_VERSION = 1;
export const WEIGHT_LABELS: Record<1 | 2 | 3, string> = { 1: "A little", 2: "Some", 3: "A lot" };
export const DEFAULT_WEIGHT: 1 | 2 | 3 = 2;
