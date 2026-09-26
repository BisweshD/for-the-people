import * as z from "zod";
import { VOTER_SCHEMA_VERSION } from "./base";
import { CandidacyId, DistrictId, ElectionId, KeyVoteId, PersonId, RaceId, StateCode } from "./ids";

/**
 * Voter objects are local-first: they live on the device in v1 and never reach our database.
 * The server may see a Location's district ids (never the address) and, only on an explicit tap,
 * the stances for a single Ask question.
 */

const isoDateTime = z.iso.datetime({ offset: true });

export { DEFAULT_WEIGHT, VOTER_SCHEMA_VERSION, WEIGHT_LABELS } from "./base";

export const Choice = z.enum(["Yea", "Nay", "Skip"]);
export type Choice = z.infer<typeof Choice>;

export const Weight = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Weight = z.infer<typeof Weight>;

export const Stance = z.object({
  keyVoteId: KeyVoteId,
  choice: Choice,
  weight: Weight,
  answeredAt: isoDateTime,
});
export type Stance = z.infer<typeof Stance>;

export const Location = z.object({
  state: StateCode,
  /** District ids with their map version; the 2026 ballot district and the district a member serves now can differ. */
  districts: z.array(DistrictId).max(4),
  /** False when the state redrew its map and no official 2026 district could be confirmed. */
  ballotDistrictConfirmed: z.boolean(),
  setAt: isoDateTime,
  method: z.enum(["census-geocoder", "geocodio", "state-file", "manual", "zip", "city"]),
});
export type Location = z.infer<typeof Location>;

export const JourneyState = z.enum([
  "new",
  "swiping",
  "matched",
  "planning",
  "planned",
  "following",
]);
export type JourneyState = z.infer<typeof JourneyState>;

export const BallotChoice = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("candidacy"), candidacyId: CandidacyId }),
  z.object({ kind: z.literal("undecided") }),
]);
export type BallotChoice = z.infer<typeof BallotChoice>;

export const BallotPlan = z.object({
  electionId: ElectionId,
  entries: z.array(
    z.object({
      raceId: RaceId,
      choice: BallotChoice,
      note: z.string().max(280).nullable(),
    }),
  ),
  updatedAt: isoDateTime,
});
export type BallotPlan = z.infer<typeof BallotPlan>;

export const Preferences = z.object({
  theme: z.enum(["system", "light", "dark"]),
});
export type Preferences = z.infer<typeof Preferences>;

export const Voter = z.object({
  localId: z.uuid(),
  schemaVersion: z.literal(VOTER_SCHEMA_VERSION),
  preferences: Preferences,
  consent: z.object({ analytics: z.literal(false) }),
  journey: JourneyState,
  stances: z.array(Stance),
  location: Location.nullable(),
  ballotPlan: BallotPlan.nullable(),
  following: z.array(PersonId).max(50),
});
export type Voter = z.infer<typeof Voter>;

export const ShareCard = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("match"),
    personId: PersonId,
    score: z.number().min(0).max(1),
    n: z.number().int().min(1),
    agreements: z.number().int().min(0),
  }),
  z.object({ kind: z.literal("duel"), a: PersonId, b: PersonId }),
  z.object({
    kind: z.literal("ballot"),
    electionId: ElectionId,
    races: z.number().int().min(0),
    decided: z.number().int().min(0),
  }),
]);
export type ShareCard = z.infer<typeof ShareCard>;

/** Friend Compare: stances packed into the URL fragment so they never reach the server. */
export const FriendCompare = z.object({
  v: z.literal(1),
  stances: z
    .array(z.object({ keyVoteId: KeyVoteId, choice: z.enum(["Yea", "Nay"]), weight: Weight }))
    .max(64),
});
export type FriendCompare = z.infer<typeof FriendCompare>;
