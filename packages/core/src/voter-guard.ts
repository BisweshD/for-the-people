import {
  DISTRICT_ID_PATTERN,
  ELECTION_ID_PATTERN,
  KEY_VOTE_ID_PATTERN,
  VOTER_SCHEMA_VERSION,
  isPersonId,
  isStateCode,
} from "./base";
import type { Location, Voter } from "./voter";

/**
 * Zod-free checks for data the browser reads back from its own storage or from our API. They accept
 * exactly what the Voter and Location schemas in voter.ts accept; test/client-entry.test.ts holds the
 * two to the same answers on generated inputs. Browser code uses these so it does not ship Zod.
 */

type Guard = (value: unknown) => boolean;

const UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
/** ISO 8601 date-time with seconds, optional fractional seconds, and a Z or ±hh:mm offset. */
const DATE_TIME =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const oneOf =
  (...options: readonly unknown[]): Guard =>
  (value) =>
    options.includes(value);
const matches =
  (pattern: RegExp): Guard =>
  (value) =>
    isString(value) && pattern.test(value);
const isDateTime = (value: unknown): boolean => isString(value) && isValidDateTime(value);
const arrayOf =
  (item: Guard, max = Infinity): Guard =>
  (value) =>
    Array.isArray(value) && value.length <= max && value.every(item);
const nullable =
  (guard: Guard): Guard =>
  (value) =>
    value === null || guard(value);
const shape =
  (fields: Record<string, Guard>): Guard =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([key, guard]) => guard(value[key]));

function isValidDateTime(value: string): boolean {
  if (!DATE_TIME.test(value)) return false;
  // Reject impossible calendar dates such as Feb 30.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const isWeight = oneOf(1, 2, 3);

const isStance = shape({
  keyVoteId: matches(KEY_VOTE_ID_PATTERN),
  choice: oneOf("Yea", "Nay", "Skip"),
  weight: isWeight,
  answeredAt: isDateTime,
});

const isLocationValue = shape({
  state: isStateCode,
  districts: arrayOf(matches(DISTRICT_ID_PATTERN), 4),
  ballotDistrictConfirmed: (value) => typeof value === "boolean",
  setAt: isDateTime,
  method: oneOf("census-geocoder", "geocodio", "state-file", "manual"),
});

const nonEmpty = (value: unknown) => isString(value) && value.length >= 1;

const isBallotChoice: Guard = (value) =>
  isObject(value) &&
  ((value.kind === "candidacy" && nonEmpty(value.candidacyId)) || value.kind === "undecided");

const isBallotPlan = shape({
  electionId: matches(ELECTION_ID_PATTERN),
  entries: arrayOf(
    shape({
      raceId: nonEmpty,
      choice: isBallotChoice,
      note: nullable((value) => isString(value) && value.length <= 280),
    }),
  ),
  updatedAt: isDateTime,
});

const isVoterValue = shape({
  localId: matches(UUID),
  schemaVersion: oneOf(VOTER_SCHEMA_VERSION),
  preferences: shape({ theme: oneOf("system", "light", "dark") }),
  consent: shape({ analytics: oneOf(false) }),
  journey: oneOf("new", "swiping", "matched", "planning", "planned", "following"),
  stances: arrayOf(isStance),
  location: nullable(isLocationValue),
  ballotPlan: nullable(isBallotPlan),
  following: arrayOf(isPersonId, 50),
});

export const isVoter = (value: unknown): value is Voter => isVoterValue(value);
export const isLocation = (value: unknown): value is Location => isLocationValue(value);
