import {
  computeMatch,
  DistrictId,
  PersonId,
  RollCallId,
  StateCode,
  type Chamber,
  type Position,
  type RollCall,
  type Source,
  type Stance,
} from "@for-the-people/core";
import type { Db } from "@for-the-people/data";
import * as askRead from "@for-the-people/data/read/ask";
import type { AskMember } from "@for-the-people/data/read/ask";
import {
  tool,
  type InferUITools,
  type JSONValue,
  type ToolSet,
  type UIDataTypes,
  type UIMessage,
} from "ai";
import * as z from "zod";
import type {
  AskPerson,
  AskSide,
  AskVote,
  CompareOutput,
  FindPeopleOutput,
  GetPersonOutput,
  GetVotesOutput,
  KeyVotesOutput,
  MeasureOutput,
  MethodOutput,
  MoneyOutput,
  MyRepresentativesOutput,
  RollCallOutput,
  VoteTally,
} from "@/lib/ask-types";
import { chamberName, formatShare, measureLabel, officeLine } from "@/lib/format";
import { scoreKeyVotes } from "@/lib/matching";
import { METHOD_RECEIPTS } from "@/lib/methods";
import {
  toCardViews,
  toMemberView,
  toReceipt,
  type CardView,
  type RollCallView,
} from "@/lib/views";
import { ToolBudget } from "./budget";
import { resolveIssue } from "./issues";

/**
 * Ask For The People's tools: read-only, Zod-typed, backed by the read layer.
 * The page gets each tool's full output; the model gets the compact summary from `compact`, within the
 * run's tool budget (budget.ts).
 */

export interface AskContext {
  db: Db;
  /** Today's date (UTC), used to tell serving members from former ones. */
  today: string;
  /** The voter's district ids, when they set a location. Never an address. */
  districtIds: string[];
  /** Present only when the voter tapped "Use my answers" for this question. */
  stances: Stance[] | null;
}

const POSITION_WORDS: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "Did not vote",
};

const CRS_CHARS = 700;

function rollCallView(rollCall: RollCall, source: Source): RollCallView {
  return {
    id: rollCall.id,
    chamber: rollCall.chamber,
    number: rollCall.number,
    date: rollCall.date,
    question: rollCall.question,
    result: rollCall.result,
    totals: rollCall.totals,
    tieBreaker: rollCall.tieBreaker,
    officialUrl: rollCall.officialUrl,
    yeaSupportsMeasure: true,
    decisive: false,
    verification: { status: "unverified", checkedAt: null, notes: null },
    measureLabel: rollCall.measureId ? measureLabel(rollCall.measureId) : null,
    receipt: toReceipt(source),
  };
}

/** The decisive roll call a member voted on for one card (their own chamber), with polarity applied. */
function sideOn(card: CardView, positions: Record<string, Position>): AskSide | null {
  const voted = card.rollCalls.filter((rollCall) => positions[rollCall.id]);
  const rollCall = voted.find((candidate) => candidate.decisive) ?? voted[0];
  const position = rollCall ? positions[rollCall.id] : undefined;
  if (!rollCall || !position) return null;
  const supportsMeasure =
    position === "Yea" || position === "Nay"
      ? (position === "Yea") === rollCall.yeaSupportsMeasure
      : null;
  return { position, rollCall, supportsMeasure };
}

/** Lazily loaded per request: the published key votes as card views, and members with their terms. */
class AskData {
  private library: Promise<CardView[]> | null = null;
  private roster: Promise<AskMember[]> | null = null;

  constructor(readonly ctx: AskContext) {}

  cards(): Promise<CardView[]> {
    this.library ??= askRead
      .keyVoteLibrary(this.ctx.db)
      .then(({ cards, sources }) => toCardViews(cards, [...sources.values()]));
    return this.library;
  }

  members(): Promise<AskMember[]> {
    this.roster ??= askRead.askMembers(this.ctx.db, this.ctx.today);
    return this.roster;
  }

  async issues(): Promise<Array<{ id: string; label: string }>> {
    const seen = new Map<string, { id: string; label: string }>();
    for (const card of await this.cards())
      seen.set(card.issue.id, { id: card.issue.id, label: card.issue.label });
    return [...seen.values()];
  }

  async member(personId: string): Promise<AskMember | null> {
    return (await this.members()).find((member) => member.id === personId) ?? null;
  }

  async people(members: readonly AskMember[]): Promise<AskPerson[]> {
    const cards = await this.cards();
    const rollCallIds = [...new Set(cards.flatMap((card) => card.rollCalls.map((rc) => rc.id)))];
    const positions = await askRead.positionsOf(
      this.ctx.db,
      members.map((member) => member.id),
      rollCallIds,
    );
    const keyVotes = scoreKeyVotes(cards);
    return members.map((member) => {
      const own = positions.get(member.id) ?? new Map<string, Position>();
      const match = this.ctx.stances
        ? computeMatch({
            stances: this.ctx.stances,
            keyVotes,
            member: { personId: member.id, positions: own },
          })
        : null;
      return {
        member: toMemberView(member),
        receiptId: member.termSourceId,
        keyVotePositions: Object.fromEntries(own),
        sharedMatch: match
          ? { score: match.score, n: match.n, agreements: match.agreements }
          : null,
      };
    });
  }

  async person(personId: string): Promise<AskPerson | null> {
    const member = await this.member(personId);
    return member ? ((await this.people([member]))[0] ?? null) : null;
  }
}

// Compact summaries: what the model reads. Every number the model may write must be in here.

const compactPerson = (person: AskPerson) => ({
  id: person.member.id,
  name: person.member.name,
  party: person.member.party,
  office: officeLine(person.member),
  serving: person.member.serving,
  ...(person.sharedMatch
    ? {
        matchWithVoter:
          person.sharedMatch.score === null
            ? "No shared votes yet"
            : {
                percent: `${Math.round(person.sharedMatch.score * 100)}%`,
                agreements: person.sharedMatch.agreements,
                sharedVotes: person.sharedMatch.n,
              },
      }
    : {}),
});

const compactRollCall = (rollCall: RollCallView) => ({
  id: rollCall.id,
  chamber: chamberName(rollCall.chamber),
  number: rollCall.number,
  date: rollCall.date,
  question: rollCall.question,
  result: rollCall.result,
  yea: rollCall.totals.yea,
  nay: rollCall.totals.nay,
  ...(rollCall.measureLabel ? { measure: rollCall.measureLabel } : {}),
});

const compactSide = (side: AskSide | null) =>
  side
    ? {
        vote: POSITION_WORDS[side.position],
        rollCall: `${chamberName(side.rollCall.chamber)} roll call ${side.rollCall.number}`,
        date: side.rollCall.date,
        ...(side.supportsMeasure === null ? {} : { supportedMeasure: side.supportsMeasure }),
      }
    : "No recorded vote";

/**
 * Why a member has no vote on a key vote held only in the other chamber: "senators do not vote on
 * House roll calls". Never "did not vote", which is the words for a Not Voting VotePosition.
 */
export function otherChamberNote(heldIn: Chamber): string {
  const members = heldIn === "house" ? "senators" : "House members";
  return `${members} do not vote on ${chamberName(heldIn)} roll calls`;
}

const compactVote = (vote: AskVote) => ({
  keyVote: vote.title,
  issue: vote.issue.label,
  memberVote:
    !vote.side && vote.heldOnlyIn
      ? `${chamberName(vote.heldOnlyIn)} vote only: ${otherChamberNote(vote.heldOnlyIn)}`
      : compactSide(vote.side),
});

/** Counts over a member's key votes: the numbers a summary of them may use. */
export function tallyVotes(votes: readonly AskVote[]): VoteTally {
  const count = (test: (vote: AskVote) => boolean) => votes.filter(test).length;
  const position = (vote: AskVote) => vote.side?.position;
  return {
    keyVotes: votes.length,
    yea: count((vote) => position(vote) === "Yea"),
    nay: count((vote) => position(vote) === "Nay"),
    present: count((vote) => position(vote) === "Present"),
    didNotVote: count((vote) => position(vote) === "NotVoting"),
    otherChamberOnly: count((vote) => !vote.side && vote.heldOnlyIn !== null),
    noRecordedVote: count((vote) => !vote.side && vote.heldOnlyIn === null),
  };
}

/** The chamber that held every roll call on a key vote, when the member sits in the other one. */
function heldOnlyIn(card: CardView, member: AskPerson | null): Chamber | null {
  const chambers = new Set(card.rollCalls.map((rollCall) => rollCall.chamber));
  if (!member || chambers.size !== 1 || chambers.has(member.member.chamber)) return null;
  return [...chambers][0] ?? null;
}

/** One member's vote on one key vote, or where it was held when they could not vote on it. */
function voteOn(card: CardView, person: AskPerson | null): AskVote {
  const side = person ? sideOn(card, person.keyVotePositions) : null;
  const heldIn = side ? null : heldOnlyIn(card, person);
  return {
    keyVoteId: card.id,
    title: card.card.title,
    issue: { id: card.issue.id, label: card.issue.label },
    side,
    heldOnlyIn: heldIn,
    heldOnlyRollCall: heldIn
      ? (card.rollCalls.find((rollCall) => rollCall.decisive) ?? card.rollCalls[0] ?? null)
      : null,
  };
}

/** The key votes getVotes reads: all of them with no issue; a bill named outright beats its issue. */
function chooseCards(
  cards: readonly CardView[],
  issue: string | undefined,
  area: { id: string } | null,
): CardView[] {
  if (!issue) return [...cards];
  // A bill named outright ("Ukraine aid", "the Laken Riley Act") beats its whole issue area.
  const named = issue
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[?.!]+$/, "");
  const byTitle = named
    ? cards.filter((card) => card.card.title.toLowerCase().includes(named))
    : [];
  if (byTitle.length > 0) return byTitle;
  return area ? cards.filter((card) => card.issue.id === area.id) : [];
}

/**
 * getVotes' result: the counts cover every chosen key vote, even when a limit lists only the first
 * few of them (the answer then says how many are listed).
 */
export function memberVotes(
  cards: readonly CardView[],
  person: AskPerson | null,
  choice: { issue?: string | undefined; area: { id: string } | null; limit?: number | undefined },
): { votes: AskVote[]; tally: VoteTally } {
  const all = chooseCards(cards, choice.issue, choice.area).map((card) => voteOn(card, person));
  return {
    votes: choice.limit === undefined ? all : all.slice(0, choice.limit),
    tally: tallyVotes(all),
  };
}

export const compact = {
  findPeople: (output: FindPeopleOutput) =>
    output.people.length === 0
      ? { people: [], note: "No member matched. Say No record yet." }
      : { people: output.people.map(compactPerson) },
  getPerson: (output: GetPersonOutput) =>
    output.person
      ? {
          person: compactPerson(output.person),
          record: output.record
            ? {
                votedWithMostOfTheirParty: output.record.partyUnityShare,
                partyLineVotesCounted: output.record.partyUnityEligible,
                missedVotes: output.record.missedVotes,
                missedShare: output.record.missedShare,
                rollCallsWhileServing: output.record.eligibleVotes,
              }
            : "No record yet",
        }
      : { person: null, note: "No member with that id. Say No record yet." },
  getKeyVotes: (output: KeyVotesOutput) => ({
    issue: output.issue?.label ?? "all issues",
    keyVotes: output.keyVotes.map((keyVote) => ({
      id: keyVote.id,
      title: keyVote.title,
      issue: keyVote.issue.label,
      whatItDoes: keyVote.whatItDoes,
      rollCalls: keyVote.rollCalls.map(compactRollCall),
    })),
  }),
  getVotes: (output: GetVotesOutput) => ({
    person: output.person ? compactPerson(output.person) : null,
    issue: output.issue?.label ?? "all issues",
    counts: {
      keyVotes: output.tally.keyVotes,
      // Present only when a limit cut the list: the counts still cover every key vote.
      ...(output.votes.length < output.tally.keyVotes ? { listedBelow: output.votes.length } : {}),
      heldInTheirChamber: output.tally.keyVotes - output.tally.otherChamberOnly,
      theirChamber: output.person?.member.chamber === "house" ? "House" : "Senate",
      votedYea: output.tally.yea,
      votedNay: output.tally.nay,
      votedPresent: output.tally.present,
      didNotVote: output.tally.didNotVote,
      noRecordedVote: output.tally.noRecordedVote,
      heldOnlyInOtherChamber: output.tally.otherChamberOnly,
      otherChamber: output.person?.member.chamber === "house" ? "Senate" : "House",
    },
    votes: output.votes.map(compactVote),
    ...(output.votes.length === 0
      ? { note: "No key votes on this issue. Say No record yet." }
      : {}),
  }),
  getRollCall: (output: RollCallOutput) =>
    output.rollCall
      ? {
          rollCall: compactRollCall(output.rollCall),
          measure: output.measure ? `${output.measure.label}: ${output.measure.title}` : null,
          byParty: output.byParty.map((tally) => ({
            party: tally.party,
            yea: tally.yea,
            nay: tally.nay,
          })),
        }
      : { rollCall: null, note: "No roll call with that id. Say No record yet." },
  getMeasure: (output: MeasureOutput) =>
    output.measures.length === 0
      ? { measures: [], note: "No measure matched. Say No record yet." }
      : {
          measures: output.measures.map((measure) => ({
            id: measure.id,
            label: measure.label,
            title: measure.title,
            becameLaw: measure.becameLaw,
            latestAction: measure.latestAction,
            latestActionDate: measure.latestActionDate,
            summary: measure.crsSummary?.text ?? "No record yet",
            rollCalls: measure.rollCalls.map(compactRollCall),
          })),
        },
  compare: (output: CompareOutput) => ({
    a: output.a ? compactPerson(output.a) : null,
    b: output.b ? compactPerson(output.b) : null,
    keyVotesBothVotedOn: output.shared,
    sameSide: output.same,
    rows: output.rows.map((row) => ({
      keyVote: row.title,
      a: compactSide(row.a),
      b: compactSide(row.b),
      sameSide: row.sameSide,
    })),
  }),
  getMoney: (output: MoneyOutput) => ({
    person: output.person ? compactPerson(output.person) : null,
    cycle: output.cycle,
    money:
      output.status === "no-record"
        ? "No record yet. Campaign finance totals are not loaded."
        : output.summaries.map((summary) => ({
            receipts: summary.receipts,
            fromIndividuals: summary.individual,
            fromPacs: summary.pacs,
            cashOnHand: summary.cashOnHand,
            asOf: summary.asOf,
          })),
  }),
  myRepresentatives: (output: MyRepresentativesOutput) => ({
    status: output.status,
    people: output.people.map(compactPerson),
    ...(output.status === "no-location"
      ? { note: "The voter has not set a location. Suggest adding an address on the Ballot page." }
      : {}),
  }),
  explainMethod: (output: MethodOutput) => ({ title: output.title, method: output.summary }),
} as const;

export type AskToolName = keyof typeof compact;

const Limit = (max: number, fallback: number) => z.number().int().min(1).max(max).default(fallback);

/** getVotes' input. With no limit it lists every key vote it chose; its counts always cover them all. */
export const GetVotesInput = z.object({
  personId: PersonId,
  issue: z.string().trim().max(60).optional().describe("An issue, or words from a bill title"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("List only this many key votes; leave it out to list them all"),
});

/**
 * The tool set for one request. Tools close over the request's context and read only. Every call goes
 * through the run's budget: identical calls run once, and the model reads the compact summary only
 * while the budget lasts.
 */
export function createAskTools(ctx: AskContext, budget: ToolBudget = new ToolBudget()) {
  const data = new AskData(ctx);
  const cache = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

  const tools = {
    findPeople: tool({
      description:
        "Find members of Congress by name, or list them by state and chamber. Returns people with ids for the other tools.",
      inputSchema: z
        .object({
          name: z.string().trim().min(2).max(80).optional().describe("A full or last name"),
          state: StateCode.optional().describe("Two-letter state code"),
          chamber: z.enum(["house", "senate"]).optional(),
          includeFormer: z.boolean().default(false).describe("Include members who no longer serve"),
          limit: Limit(10, 5),
        })
        .refine((input) => input.name || input.state, "Give a name or a state"),
      execute: async (input): Promise<FindPeopleOutput> => {
        const found = askRead.searchMembers(await data.members(), {
          query: input.name,
          state: input.state,
          chamber: input.chamber,
          servingOnly: !input.includeFormer && !input.name,
          limit: input.limit,
        });
        return { people: await data.people(found) };
      },
    }),

    getPerson: tool({
      description:
        "One member's office, party, and voting record: how often they voted with most of their party and how many roll calls they missed.",
      inputSchema: z.object({ personId: PersonId }),
      execute: async ({ personId }): Promise<GetPersonOutput> => {
        const [person, stats] = await Promise.all([
          data.person(personId),
          askRead.memberStats(ctx.db, personId),
        ]);
        return {
          person,
          record: stats
            ? {
                chamber: stats.chamber,
                partyUnityVotes: stats.partyUnityVotes,
                partyUnityEligible: stats.partyUnityEligible,
                partyUnityShare: formatShare(stats.partyUnityVotes, stats.partyUnityEligible),
                missedVotes: stats.missedVotes,
                eligibleVotes: stats.eligibleVotes,
                missedShare: formatShare(stats.missedVotes, stats.eligibleVotes),
                firstVoteDate: stats.firstVoteDate,
                lastVoteDate: stats.lastVoteDate,
              }
            : null,
        };
      },
    }),

    getKeyVotes: tool({
      description:
        "The published key votes (the bills voters answer on For The People's Swipe page), optionally for one issue, with their official roll calls.",
      inputSchema: z.object({
        issue: z
          .string()
          .trim()
          .max(60)
          .optional()
          .describe("An issue such as immigration or trade"),
      }),
      execute: async ({ issue }): Promise<KeyVotesOutput> => {
        const cards = await data.cards();
        const area = issue ? resolveIssue(issue, await data.issues()) : null;
        return {
          issue: area,
          keyVotes: cards
            .filter((card) => !area || card.issue.id === area.id)
            .map((card) => ({
              id: card.id,
              title: card.card.title,
              issue: { id: card.issue.id, label: card.issue.label },
              whatItDoes: card.card.whatItDoes,
              yeaMeans: card.card.yeaMeans,
              rollCalls: card.rollCalls,
            })),
        };
      },
    }),

    getVotes: tool({
      description:
        "How one member voted on the key votes, optionally for one issue, each with its official roll call. Its counts cover every key vote it chose.",
      inputSchema: GetVotesInput,
      execute: async ({ personId, issue, limit }): Promise<GetVotesOutput> => {
        const [person, cards] = await Promise.all([data.person(personId), data.cards()]);
        const area = issue ? resolveIssue(issue, await data.issues()) : null;
        return { person, issue: area, ...memberVotes(cards, person, { issue, area, limit }) };
      },
    }),

    getRollCall: tool({
      description:
        "One official roll call by id (for example house-119-1-23): the question, result, totals, and totals by party.",
      inputSchema: z.object({ rollCallId: RollCallId }),
      execute: async ({ rollCallId }): Promise<RollCallOutput> => {
        const summary = await askRead.rollCallSummary(ctx.db, rollCallId);
        if (!summary) return { rollCall: null, measure: null, byParty: [] };
        return {
          rollCall: rollCallView(summary.rollCall, summary.source),
          measure: summary.measure
            ? {
                id: summary.measure.id,
                label: measureLabel(summary.measure.id),
                title: summary.measure.titles.display,
              }
            : null,
          byParty: summary.byParty,
        };
      },
    }),

    getMeasure: tool({
      description:
        "A bill or resolution by label (H.R. 22, S. 5), id (119-hr-22), or words from its title: its status, official summary, and roll calls.",
      inputSchema: z.object({ measure: z.string().trim().min(2).max(120) }),
      execute: async ({ measure }): Promise<MeasureOutput> => {
        const found = await askRead.findMeasures(ctx.db, measure, 3);
        return {
          measures: found.flatMap(({ measure: item, rollCalls, sources }) => {
            const receiptId = item.sourceIds[0];
            if (!receiptId) return [];
            return [
              {
                id: item.id,
                label: measureLabel(item.id),
                title: item.titles.display,
                becameLaw: item.status.becameLaw,
                latestAction: item.status.latestAction,
                latestActionDate: item.status.latestActionDate,
                receiptId,
                crsSummary: item.crsSummary
                  ? {
                      text:
                        item.crsSummary.text.length > CRS_CHARS
                          ? `${item.crsSummary.text.slice(0, CRS_CHARS).trimEnd()}…`
                          : item.crsSummary.text,
                      date: item.crsSummary.date,
                      sourceId: item.crsSummary.sourceId,
                    }
                  : null,
                rollCalls: rollCalls.flatMap((rollCall) => {
                  const source = sources.get(rollCall.sourceId);
                  return source ? [rollCallView(rollCall, source)] : [];
                }),
              },
            ];
          }),
        };
      },
    }),

    compare: tool({
      description:
        "Compare two members' votes on the key votes: where both voted Yea or Nay, and how often they took the same side.",
      inputSchema: z.object({ aId: PersonId, bId: PersonId }),
      execute: async ({ aId, bId }): Promise<CompareOutput> => {
        const [a, b, cards] = await Promise.all([data.person(aId), data.person(bId), data.cards()]);
        const rows = cards.map((card) => {
          const sideA = a ? sideOn(card, a.keyVotePositions) : null;
          const sideB = b ? sideOn(card, b.keyVotePositions) : null;
          const sameSide =
            sideA?.supportsMeasure != null && sideB?.supportsMeasure != null
              ? sideA.supportsMeasure === sideB.supportsMeasure
              : null;
          return { keyVoteId: card.id, title: card.card.title, a: sideA, b: sideB, sameSide };
        });
        const shared = rows.filter((row) => row.sameSide !== null);
        return {
          a,
          b,
          rows,
          shared: shared.length,
          same: shared.filter((row) => row.sameSide).length,
        };
      },
    }),

    getMoney: tool({
      description:
        "Campaign finance totals from the FEC for one member and election cycle (aggregates only, never donor names).",
      inputSchema: z.object({
        personId: PersonId,
        cycle: z.number().int().min(2000).max(2030).default(2026),
      }),
      execute: async ({ personId, cycle }): Promise<MoneyOutput> => {
        const [person, summaries] = await Promise.all([
          data.person(personId),
          askRead.financeSummaries(ctx.db, personId, cycle),
        ]);
        return {
          person,
          cycle,
          status: summaries.length === 0 ? "no-record" : "found",
          summaries: summaries.map((summary) => ({
            financeCommitteeId: summary.financeCommitteeId,
            receipts: summary.receipts,
            individual: summary.individual,
            pacs: summary.pacs,
            cashOnHand: summary.cashOnHand,
            asOf: summary.asOf,
            sourceId: summary.sourceId,
          })),
        };
      },
    }),

    myRepresentatives: tool({
      description:
        "The voter's members of Congress (their House member and two senators) from their district ids. Leave districtIds empty to use the voter's saved location.",
      inputSchema: z.object({ districtIds: z.array(DistrictId).max(4).default([]) }),
      execute: async ({ districtIds }): Promise<MyRepresentativesOutput> => {
        const ids = districtIds.length > 0 ? districtIds : ctx.districtIds;
        if (ids.length === 0) return { status: "no-location", districtIds: [], people: [] };
        const members = await askRead.membersForDistricts(ctx.db, ids, ctx.today);
        return {
          status: members.length === 0 ? "none-found" : "found",
          districtIds: ids,
          people: await data.people(members),
        };
      },
    }),

    explainMethod: tool({
      description:
        "How For The People computes a number: the match score, voting with their party, missed votes, or comparing two members.",
      inputSchema: z.object({ topic: z.enum(["match", "party-unity", "missed-votes", "compare"]) }),
      execute: async ({ topic }): Promise<MethodOutput> => {
        const id = `method-${topic}` as const;
        const method = METHOD_RECEIPTS[id];
        return {
          id,
          title: method.title,
          summary: method.summary,
          href: `/methodology#${method.anchor}`,
        };
      },
      // Cache breakpoint on the last tool: Anthropic caches every tool definition before it.
      providerOptions: cache,
    }),
  } satisfies ToolSet;

  return metered(tools, budget);
}

/** Routes each tool's execute through the budget and gives the model what the budget decided. */
function metered<T extends ToolSet>(tools: T, budget: ToolBudget): T {
  const wrapped: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    const execute = definition.execute;
    if (!execute) throw new Error(`Ask tool ${name} has no execute`);
    wrapped[name] = {
      ...definition,
      execute: (input, options) =>
        budget.call(
          name,
          input,
          options.toolCallId,
          (output) => compactOutput(name, output),
          async () => execute(input, options),
        ),
      toModelOutput: ({ toolCallId }: { toolCallId: string }) => ({
        type: "json" as const,
        value: budget.modelOutput(toolCallId),
      }),
    };
  }
  return wrapped as T;
}

export type AskTools = ReturnType<typeof createAskTools>;
export type AskUITools = InferUITools<AskTools>;

/** Attached to each answer: whether it came from the template demo model. */
export interface AskMetadata {
  demo: boolean;
}

export type AskUIMessage = UIMessage<AskMetadata, UIDataTypes, AskUITools>;

/** The compact summary of one tool result: what the model reads while the budget lasts. */
function compactOutput(toolName: string, output: unknown): JSONValue {
  const summarize = compact[toolName as AskToolName] as (value: unknown) => JSONValue;
  return summarize(output);
}
