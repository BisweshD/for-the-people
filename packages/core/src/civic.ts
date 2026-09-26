import * as z from "zod";
import { PARTY_CODES } from "./base";
import {
  BioguideId,
  CandidacyId,
  Chamber,
  DistrictId,
  ElectionId,
  FecCandidateId,
  FecCommitteeId,
  IssueAreaId,
  KeyVoteId,
  MapVersion,
  MeasureId,
  MeasureType,
  OfficeId,
  PersonId,
  RaceId,
  RollCallId,
  SourceId,
  StateCode,
} from "./ids";

/** Civic objects: public, ingested from official sources, served from our database. */

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const dollars = z.number().finite();
const share = z.number().min(0).max(1);

/** Party codes for tags. Always shown with a letter, never color alone. */
export const Party = z.enum(PARTY_CODES);
export type Party = z.infer<typeof Party>;

export { PARTY_NAMES } from "./base";

export const Source = z.object({
  id: SourceId,
  publisher: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  retrievedAt: isoDateTime,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  notes: z.string().nullable(),
});
export type Source = z.infer<typeof Source>;

export const Portrait = z.object({
  /** Path under the web app's public folder, without extension or size suffix. */
  asset: z.string().regex(/^\/portraits\/[A-Z]\d{6}$/),
  sourceId: SourceId,
  /** Tiny inline image used as the blur-up placeholder. */
  placeholder: z.string().startsWith("data:image/"),
});
export type Portrait = z.infer<typeof Portrait>;

export const Person = z.object({
  id: PersonId,
  names: z.object({
    full: z.string().min(1),
    first: z.string().min(1),
    last: z.string().min(1),
    nickname: z.string().nullable(),
    suffix: z.string().nullable(),
  }),
  ids: z.object({
    bioguide: BioguideId.nullable(),
    fec: z.array(FecCandidateId),
    wikidata: z
      .string()
      .regex(/^Q\d+$/)
      .nullable(),
    ballotpedia: z.string().nullable(),
    govtrack: z.number().int().nullable(),
    lis: z
      .string()
      .regex(/^S\d{3}$/)
      .nullable(),
  }),
  portrait: Portrait.nullable(),
  links: z.array(z.object({ label: z.string(), url: z.url({ protocol: /^https?$/ }) })),
  sourceIds: z.array(SourceId).min(1),
});
export type Person = z.infer<typeof Person>;

export const Office = z.object({
  id: OfficeId,
  level: z.literal("federal"),
  chamber: Chamber,
  title: z.enum(["U.S. Representative", "U.S. Senator", "Delegate", "Resident Commissioner"]),
  state: StateCode,
  seatClass: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
});
export type Office = z.infer<typeof Office>;

export const District = z.object({
  id: DistrictId,
  state: StateCode,
  /** 0 means at-large. */
  number: z.number().int().min(0).max(99),
  mapVersion: MapVersion,
  geometryRef: z.string().nullable(),
  sourceId: SourceId,
});
export type District = z.infer<typeof District>;

export const Term = z.object({
  id: z.string().min(1),
  personId: PersonId,
  officeId: OfficeId,
  chamber: Chamber,
  state: StateCode,
  districtId: DistrictId.nullable(),
  party: Party,
  /** The party an independent caucuses with, used for party-line math. */
  caucus: Party.nullable(),
  start: isoDate,
  end: isoDate,
  sourceIds: z.array(SourceId).min(1),
});
export type Term = z.infer<typeof Term>;

export const ElectionType = z.enum(["general", "primary", "special", "runoff"]);
export const Election = z.object({
  id: ElectionId,
  date: isoDate,
  type: ElectionType,
  state: StateCode.nullable(),
  name: z.string().min(1),
  sourceIds: z.array(SourceId).min(1),
});
export type Election = z.infer<typeof Election>;

export const Race = z.object({
  id: RaceId,
  electionId: ElectionId,
  officeId: OfficeId,
  chamber: Chamber,
  state: StateCode,
  districtId: DistrictId.nullable(),
  sourceIds: z.array(SourceId).min(1),
});
export type Race = z.infer<typeof Race>;

export const CandidacyStatus = z.enum(["filed", "onBallot", "withdrew", "won", "lost"]);
export type CandidacyStatus = z.infer<typeof CandidacyStatus>;

export const Candidacy = z.object({
  id: CandidacyId,
  personId: PersonId,
  raceId: RaceId,
  party: Party,
  status: CandidacyStatus,
  incumbent: z.boolean(),
  fecCandidateId: FecCandidateId.nullable(),
  sourceIds: z.array(SourceId).min(1),
});
export type Candidacy = z.infer<typeof Candidacy>;

export const Measure = z.object({
  id: MeasureId,
  congress: z.number().int().min(1),
  type: MeasureType,
  number: z.number().int().min(1),
  titles: z.object({
    display: z.string().min(1),
    official: z.string().min(1),
    short: z.string().nullable(),
    popular: z.string().nullable(),
  }),
  sponsorId: PersonId.nullable(),
  introducedDate: isoDate.nullable(),
  status: z.object({
    latestAction: z.string().min(1),
    latestActionDate: isoDate,
    becameLaw: z.boolean(),
  }),
  crsSummary: z
    .object({
      text: z.string().min(1),
      versionLabel: z.string(),
      date: isoDate,
      sourceId: SourceId,
    })
    .nullable(),
  plainSummary: z
    .object({
      text: z.string().min(1),
      model: z.string().min(1),
      generatedAt: isoDateTime,
      reviewed: z.boolean(),
    })
    .nullable(),
  sourceIds: z.array(SourceId).min(1),
});
export type Measure = z.infer<typeof Measure>;

export const Position = z.enum(["Yea", "Nay", "Present", "NotVoting"]);
export type Position = z.infer<typeof Position>;

export const RollCallTotals = z.object({
  yea: z.number().int().min(0),
  nay: z.number().int().min(0),
  present: z.number().int().min(0),
  notVoting: z.number().int().min(0),
});
export type RollCallTotals = z.infer<typeof RollCallTotals>;

export const RollCall = z.object({
  id: RollCallId,
  chamber: Chamber,
  congress: z.number().int().min(1),
  session: z.union([z.literal(1), z.literal(2)]),
  number: z.number().int().min(1),
  date: isoDate,
  question: z.string().min(1),
  /** The official result text, for example "Passed" or "Cloture Motion Rejected". */
  result: z.string().min(1),
  /** Required majority as the chamber records it, for example "1/2", "3/5", "2/3". */
  requires: z.string().nullable(),
  title: z.string().nullable(),
  totals: RollCallTotals,
  /** The Vice President's vote in the Senate. It is not a member's VotePosition and is not in totals. */
  tieBreaker: z.object({ by: z.string(), vote: z.enum(["Yea", "Nay"]) }).nullable(),
  measureId: MeasureId.nullable(),
  officialUrl: z.url({ protocol: /^https$/ }),
  sourceId: SourceId,
});
export type RollCall = z.infer<typeof RollCall>;

export const VotePosition = z.object({
  rollCallId: RollCallId,
  personId: PersonId,
  position: Position,
  /** Party as printed on the official roll call. */
  party: Party,
  state: StateCode,
});
export type VotePosition = z.infer<typeof VotePosition>;

export const IssueArea = z.object({
  id: IssueAreaId,
  label: z.string().min(1),
  description: z.string().min(1),
  /** A lucide-react icon name. */
  icon: z.string().min(1),
});
export type IssueArea = z.infer<typeof IssueArea>;

export const KeyVoteStatus = z.enum(["draft", "verified", "reviewed", "published", "retired"]);
export type KeyVoteStatus = z.infer<typeof KeyVoteStatus>;

export const RollCallRef = z.object({
  rollCallId: RollCallId,
  /** False when a Yea vote works against the measure (for example a motion to table it). */
  yeaSupportsMeasure: z.boolean(),
  /** When a card has several roll calls in one chamber, the decisive one is used for matching. */
  decisive: z.boolean(),
  verification: z.object({
    status: z.enum(["verified", "unverified", "mismatch"]),
    checkedAt: isoDateTime.nullable(),
    notes: z.string().nullable(),
  }),
});
export type RollCallRef = z.infer<typeof RollCallRef>;

export const Reviewer = z.object({
  id: z.string().min(1),
  kind: z.enum(["human", "ai"]),
  /**
   * The lens a reviewer read the card through. "unstated" is a reviewer who gave none (the project owner's
   * human review); it never counts toward the rule of two approvals from different leanings.
   */
  leaning: z.enum(["progressive", "conservative", "moderate", "unstated"]),
  reviewedAt: isoDateTime,
  verdict: z.enum(["approved", "changes-requested"]),
  notes: z.string().nullable(),
});
export type Reviewer = z.infer<typeof Reviewer>;

export const KeyVote = z.object({
  id: KeyVoteId,
  order: z.number().int().min(0),
  issueArea: IssueAreaId,
  card: z.object({
    /**
     * The swipe card's headline: a plain yes/no question whose "yes" is a Yea on this card. Written for
     * an average American reader; the title stays the card's name everywhere else.
     */
    question: z.string().min(1).max(150).optional(),
    title: z.string().min(1).max(90),
    whatItDoes: z.string().min(1).max(520),
    context: z.string().min(1).max(380),
    yeaMeans: z.string().min(1).max(60),
    /** What a Nay means on the same question (after polarity). Shown beside yeaMeans. */
    nayMeans: z.string().min(1).max(60).optional(),
  }),
  measures: z.array(MeasureId),
  rollCallRefs: z.array(RollCallRef),
  yeaLean: z.enum(["D", "R", "both"]),
  status: KeyVoteStatus,
  selectionReason: z.string().min(1),
  reviewers: z.array(Reviewer),
});
export type KeyVote = z.infer<typeof KeyVote>;

export const FinanceCommittee = z.object({
  id: FecCommitteeId,
  name: z.string().min(1),
  designation: z.string().nullable(),
  candidateId: FecCandidateId.nullable(),
  sourceId: SourceId,
});
export type FinanceCommittee = z.infer<typeof FinanceCommittee>;

/** Aggregates only. Individual donor names and addresses are never stored (52 U.S.C. 30111(a)(4)). */
export const FinanceSummary = z
  .object({
    personId: PersonId,
    cycle: z.number().int().min(2000),
    financeCommitteeId: FecCommitteeId,
    receipts: dollars,
    individual: dollars,
    smallDollarShare: share.nullable(),
    pacs: dollars,
    party: dollars,
    selfFunding: dollars,
    /** Transfers from the candidate's other authorized committees, mostly joint fundraising committees. */
    transfers: dollars,
    cashOnHand: dollars,
    debts: dollars,
    inStateShare: share.nullable(),
    asOf: isoDate,
    sourceId: SourceId,
  })
  .strict();
export type FinanceSummary = z.infer<typeof FinanceSummary>;

export const IngestionRun = z.object({
  id: z.string().min(1),
  job: z.string().min(1),
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  status: z.enum(["running", "succeeded", "failed", "partial"]),
  stats: z.record(z.string(), z.number()),
  notes: z.array(z.string()),
  error: z.string().nullable(),
});
export type IngestionRun = z.infer<typeof IngestionRun>;

export const CorrectionTargetKind = z.enum([
  "person",
  "rollCall",
  "measure",
  "keyVote",
  "financeSummary",
  "candidacy",
  "other",
]);

export const Correction = z.object({
  id: z.string().min(1),
  target: z.object({
    kind: CorrectionTargetKind,
    id: z.string().max(120),
    field: z.string().max(80).nullable(),
  }),
  report: z.string().min(10).max(2000),
  status: z.enum(["submitted", "triaged", "fixed", "rejected"]),
  resolution: z.string().nullable(),
  submittedAt: isoDateTime,
});
export type Correction = z.infer<typeof Correction>;
