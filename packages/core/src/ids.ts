import * as z from "zod";
import {
  BIOGUIDE_PATTERN,
  CHAMBERS,
  DISTRICT_ID_PATTERN,
  ELECTION_ID_PATTERN,
  FEC_CANDIDATE_PATTERN,
  FEC_COMMITTEE_PATTERN,
  FEC_PERSON_PATTERN,
  KEY_VOTE_ID_PATTERN,
  MAP_VERSION_PATTERN,
  MEASURE_ID_PATTERN,
  ROLL_CALL_ID_PATTERN,
  STATE_CODES,
} from "./base";

export {
  BIOGUIDE_PATTERN,
  FEC_CANDIDATE_PATTERN,
  FEC_COMMITTEE_PATTERN,
  STATE_CODES,
  parseDistrictId,
  parseRollCallId,
  personIdFromSlug,
  personIdToSlug,
} from "./base";

/**
 * Identity rules:
 * Person = bioguide id, else `fec:<candidateId>`. Measure = (congress, type, number).
 * RollCall = (chamber, congress, session, number). District = (state, number, mapVersion).
 */

export const StateCode = z.enum(STATE_CODES);
export type StateCode = z.infer<typeof StateCode>;

export const Chamber = z.enum(CHAMBERS);
export type Chamber = z.infer<typeof Chamber>;

export const BioguideId = z.string().regex(BIOGUIDE_PATTERN, "Expected a bioguide id like A000370");
export const FecCandidateId = z
  .string()
  .regex(FEC_CANDIDATE_PATTERN, "Expected an FEC candidate id");
export const FecCommitteeId = z
  .string()
  .regex(FEC_COMMITTEE_PATTERN, "Expected an FEC committee id");

export const PersonId = z.union([
  BioguideId,
  z.string().regex(FEC_PERSON_PATTERN, "Expected fec:<candidateId>"),
]);
export type PersonId = z.infer<typeof PersonId>;

export const personIdFromFec = (candidateId: string): PersonId => `fec:${candidateId}`;

export const MapVersion = z
  .string()
  .regex(MAP_VERSION_PATTERN, "Expected a map version like cd119");
export type MapVersion = z.infer<typeof MapVersion>;

/** The 2026 ballot uses 120th-Congress maps; members serving now were elected on 119th-Congress maps. */
export const BALLOT_MAP_VERSION = "cd120" satisfies MapVersion;
export const SERVING_MAP_VERSION = "cd119" satisfies MapVersion;

export const DistrictId = z
  .string()
  .regex(DISTRICT_ID_PATTERN, "Expected STATE-NUM@mapVersion, for example CA-12@cd119");
export type DistrictId = z.infer<typeof DistrictId>;

export const districtId = (state: StateCode, number: number, mapVersion: MapVersion): DistrictId =>
  `${state}-${number}@${mapVersion}`;

export const MEASURE_TYPES = [
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
] as const;
export const MeasureType = z.enum(MEASURE_TYPES);
export type MeasureType = z.infer<typeof MeasureType>;

export const MeasureId = z.string().regex(MEASURE_ID_PATTERN);
export type MeasureId = z.infer<typeof MeasureId>;

export const measureId = (congress: number, type: MeasureType, number: number): MeasureId =>
  `${congress}-${type}-${number}`;

export function parseMeasureId(id: MeasureId): {
  congress: number;
  type: MeasureType;
  number: number;
} {
  const [congress, type, number] = id.split("-");
  return { congress: Number(congress), type: MeasureType.parse(type), number: Number(number) };
}

export const RollCallId = z.string().regex(ROLL_CALL_ID_PATTERN);
export type RollCallId = z.infer<typeof RollCallId>;

export const rollCallId = (
  chamber: Chamber,
  congress: number,
  session: number,
  number: number,
): RollCallId => `${chamber}-${congress}-${session}-${number}`;

export const KeyVoteId = z.string().regex(KEY_VOTE_ID_PATTERN);
export type KeyVoteId = z.infer<typeof KeyVoteId>;

export const IssueAreaId = z.string().regex(/^[a-z]+(-[a-z]+)*$/);
export type IssueAreaId = z.infer<typeof IssueAreaId>;

/** A Source id is derived from the URL and the exact bytes fetched, so refetching identical content is idempotent. */
export const SourceId = z.string().regex(/^src_[0-9a-f]{16}$/);
export type SourceId = z.infer<typeof SourceId>;

export const OfficeId = z.string().regex(/^federal:(house:[A-Z]{2}|senate:[A-Z]{2}:[123])$/);
export type OfficeId = z.infer<typeof OfficeId>;

export const houseOfficeId = (state: StateCode): OfficeId => `federal:house:${state}`;
export const senateOfficeId = (state: StateCode, seatClass: 1 | 2 | 3): OfficeId =>
  `federal:senate:${state}:${seatClass}`;

export const ElectionId = z.string().regex(ELECTION_ID_PATTERN);
export type ElectionId = z.infer<typeof ElectionId>;

export const RaceId = z.string().min(1);
export type RaceId = z.infer<typeof RaceId>;

export const CandidacyId = z.string().min(1);
export type CandidacyId = z.infer<typeof CandidacyId>;

export const raceId = (
  electionId: ElectionId,
  officeId: OfficeId,
  district: DistrictId | null,
): RaceId => (district ? `${electionId}|${officeId}|${district}` : `${electionId}|${officeId}`);

export const candidacyId = (race: RaceId, person: PersonId): CandidacyId => `${race}|${person}`;
