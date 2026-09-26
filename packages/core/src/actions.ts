import * as z from "zod";
import {
  Candidacy,
  Office,
  Correction,
  CorrectionTargetKind,
  District,
  Election,
  FinanceCommittee,
  FinanceSummary,
  IssueArea,
  KeyVote,
  Measure,
  Person,
  Race,
  Reviewer,
  RollCall,
  Source,
  Term,
  VotePosition,
} from "./civic";
import { KeyVoteId, RollCallId, SourceId } from "./ids";

/**
 * Actions are the only write paths. Each one validates its input with the schema below,
 * writes, and appends one EventLogEntry (who, what, when, why, sourceIds).
 */

export const INGESTION_ACTIONS = [
  "UpsertPerson",
  "MergePersonIdentity",
  "UpsertTerm",
  "UpsertDistrictMap",
  "UpsertElection",
  "UpsertRace",
  "UpsertCandidacy",
  "RemoveRace",
  "UpsertMeasure",
  "RecordRollCall",
  "RemoveRollCall",
  "UpsertFinanceCommittee",
  "UpsertFinanceSummary",
  "AttachSource",
] as const;

export const CURATION_ACTIONS = [
  "UpsertIssueArea",
  "ProposeKeyVote",
  "VerifyKeyVote",
  "ApproveKeyVote",
  "PublishKeyVote",
  "RetireKeyVote",
] as const;
export const PUBLIC_ACTIONS = ["SubmitCorrection"] as const;
export const SYSTEM_ACTIONS = ["RefreshDerivedStats"] as const;

export const ActionName = z.enum([
  ...INGESTION_ACTIONS,
  ...CURATION_ACTIONS,
  ...PUBLIC_ACTIONS,
  ...SYSTEM_ACTIONS,
]);
export type ActionName = z.infer<typeof ActionName>;

export const Actor = z.object({
  kind: z.enum(["ingestion", "maintainer", "public", "system"]),
  /** Job name or maintainer handle; always "anonymous" for the public. Never an IP address or a name. */
  id: z.string().min(1).max(120),
});

/**
 * The only public actor: every visitor is the same "anonymous" in event_log, so a stored report cannot
 * be tied to who sent it. Rate limits key on a salted IP hash in the expiring rate_limits table only.
 */
export const ANONYMOUS_PUBLIC_ACTOR = { kind: "public", id: "anonymous" } as const satisfies Actor;
export type Actor = z.infer<typeof Actor>;

export const EventLogEntry = z.object({
  id: z.string().min(1),
  action: ActionName,
  actor: Actor,
  target: z.object({ kind: z.string().min(1), id: z.string().min(1) }),
  at: z.iso.datetime({ offset: true }),
  reason: z.string().min(1).max(500),
  sourceIds: z.array(SourceId),
  /** A compact summary of what changed (counts, changed fields), never raw PII. */
  summary: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type EventLogEntry = z.infer<typeof EventLogEntry>;

export interface ActionContext {
  actor: Actor;
  reason: string;
  now: Date;
}

export type ActionError =
  | { code: "invalid"; message: string; issues: string[] }
  | { code: "invariant"; message: string }
  | { code: "not_found"; message: string }
  | { code: "forbidden"; message: string }
  | { code: "rate_limited"; message: string; retryAfterSeconds: number };

export type ActionResult<T> =
  | {
      ok: true;
      value: T;
      /** Null when the input matched what was stored, so nothing was written. */ eventId:
        string | null;
    }
  | { ok: false; error: ActionError };

// Ingestion inputs

export const AttachSourceInput = Source;
export const UpsertPersonInput = Person;
export const MergePersonIdentityInput = z.object({
  from: Person.shape.id,
  into: Person.shape.id,
  evidence: z.string().min(1),
  sourceIds: z.array(SourceId).min(1),
});
/** A Term arrives with its Office, which is reference data shared by every term for that seat. */
export const UpsertTermInput = z.object({ term: Term, office: Office });
export const UpsertDistrictMapInput = z.object({
  mapVersion: District.shape.mapVersion,
  districts: z.array(District).min(1),
});
export const UpsertElectionInput = Election;
export const UpsertRaceInput = z.object({ race: Race, office: Office });
export const UpsertCandidacyInput = Candidacy;
/** Removes a race that is not on the ballot (and its candidacies), with the reason on the event log. */
export const RemoveRaceInput = z.object({
  raceId: Race.shape.id,
  why: z.string().min(1).max(300),
  sourceIds: z.array(SourceId).min(1),
});
export const UpsertMeasureInput = Measure;
/** A stored "roll call" the parser now skips (a quorum call records attendance, not a vote). */
export const RemoveRollCallInput = z.object({
  rollCallId: RollCallId,
  why: z.string().min(1).max(300),
  sourceIds: z.array(SourceId).min(1),
});
export const RecordRollCallInput = z.object({
  rollCall: RollCall,
  positions: z.array(VotePosition).min(1),
});
export const UpsertFinanceCommitteeInput = FinanceCommittee;
/** `.strict()` on FinanceSummary rejects any extra field, so donor names and addresses cannot sneak in. */
export const UpsertFinanceSummaryInput = FinanceSummary;

// Curation inputs (run by maintainers through pull requests)

export const UpsertIssueAreaInput = IssueArea;
export const ProposeKeyVoteInput = KeyVote;
/** What the curator believes each roll call shows; verification compares it with the official record. */
export const RollCallExpectation = z.object({
  rollCallId: RollCallId,
  date: z.iso.date().nullable(),
  yea: z.number().int().min(0).nullable(),
  nay: z.number().int().min(0).nullable(),
});
export type RollCallExpectation = z.infer<typeof RollCallExpectation>;

export const VerifyKeyVoteInput = z.object({
  keyVoteId: KeyVoteId,
  expectations: z.array(RollCallExpectation),
});
export const ApproveKeyVoteInput = z.object({
  keyVoteId: KeyVoteId,
  reviewers: z.array(Reviewer).min(2),
});
export const PublishKeyVoteInput = z.object({ keyVoteId: KeyVoteId });
export const RetireKeyVoteInput = z.object({ keyVoteId: KeyVoteId, why: z.string().min(1) });

// Public inputs

export const SubmitCorrectionInput = z.object({
  target: Correction.shape.target.extend({ kind: CorrectionTargetKind }),
  report: Correction.shape.report,
});
export type SubmitCorrectionInput = z.infer<typeof SubmitCorrectionInput>;
