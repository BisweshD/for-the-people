import type { IssueArea, KeyVote, RollCallTotals, Source } from "@for-the-people/core/client";
import type { DeckCard, MemberSummary } from "@for-the-people/data/read";
import { measureLabel } from "./format";

/**
 * Serializable view models passed from server components to client components. They carry only what
 * the screen shows, plus the Receipt (Source) behind every fact.
 */

export interface ReceiptView {
  sourceId: string;
  publisher: string;
  url: string;
  retrievedAt: string;
}

export interface RollCallView {
  id: string;
  chamber: "house" | "senate";
  number: number;
  date: string;
  question: string;
  result: string;
  /** Required majority as the chamber records it ("1/2", "3/5", "2/3"). */
  requires?: string | null;
  totals: RollCallTotals;
  tieBreaker: { by: string; vote: "Yea" | "Nay" } | null;
  officialUrl: string;
  yeaSupportsMeasure: boolean;
  decisive: boolean;
  verification: KeyVote["rollCallRefs"][number]["verification"];
  measureLabel: string | null;
  receipt: ReceiptView;
}

export interface CardView {
  id: string;
  order: number;
  issue: Pick<IssueArea, "id" | "label" | "icon">;
  card: KeyVote["card"];
  measures: Array<{ id: string; label: string; title: string }>;
  rollCalls: RollCallView[];
  reviewers: Array<{ kind: "human" | "ai"; leaning: string }>;
}

/** A member as lists and search need it. The portrait placeholder is dropped to keep lists small. */
export interface MemberView {
  id: string;
  name: string;
  lastName: string;
  party: MemberSummary["party"];
  state: MemberSummary["state"];
  chamber: "house" | "senate";
  district: number | null;
  title: string;
  serving: boolean;
  portrait: { asset: string; sourceId: string; placeholder: string | null } | null;
}

export function toMemberView(member: MemberSummary, withPlaceholder = false): MemberView {
  return {
    id: member.id,
    name: member.name,
    lastName: member.lastName,
    party: member.party,
    state: member.state,
    chamber: member.chamber,
    district: member.district,
    title: member.title,
    serving: member.serving,
    portrait: member.portrait
      ? {
          asset: member.portrait.asset,
          sourceId: member.portrait.sourceId,
          placeholder: withPlaceholder ? member.portrait.placeholder : null,
        }
      : null,
  };
}

export function toReceipt(source: Source): ReceiptView {
  return {
    sourceId: source.id,
    publisher: source.publisher,
    url: source.url,
    retrievedAt: source.retrievedAt,
  };
}

export function toCardViews(deck: readonly DeckCard[], sources: readonly Source[]): CardView[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return deck.map(({ keyVote, issueArea, measures, rollCalls }) => ({
    id: keyVote.id,
    order: keyVote.order,
    issue: { id: issueArea.id, label: issueArea.label, icon: issueArea.icon },
    card: keyVote.card,
    measures: measures.map((measure) => ({
      id: measure.id,
      label: measureLabel(measure.id),
      title: measure.titles.display,
    })),
    rollCalls: keyVote.rollCallRefs.flatMap((ref) => {
      const rollCall = rollCalls.find((candidate) => candidate.id === ref.rollCallId);
      const source = rollCall ? byId.get(rollCall.sourceId) : undefined;
      if (!rollCall || !source) return [];
      return [
        {
          id: rollCall.id,
          chamber: rollCall.chamber,
          number: rollCall.number,
          date: rollCall.date,
          question: rollCall.question,
          result: rollCall.result,
          requires: rollCall.requires,
          totals: rollCall.totals,
          tieBreaker: rollCall.tieBreaker,
          officialUrl: rollCall.officialUrl,
          yeaSupportsMeasure: ref.yeaSupportsMeasure,
          decisive: ref.decisive,
          verification: ref.verification,
          measureLabel: rollCall.measureId ? measureLabel(rollCall.measureId) : null,
          receipt: toReceipt(source),
        },
      ];
    }),
    reviewers: keyVote.reviewers.map((reviewer) => ({
      kind: reviewer.kind,
      leaning: reviewer.leaning,
    })),
  }));
}

/** Every Source id a set of cards cites, for one batched lookup. */
export const deckSourceIds = (deck: readonly DeckCard[]): string[] => [
  ...new Set(deck.flatMap(({ rollCalls }) => rollCalls.map((rollCall) => rollCall.sourceId))),
];
