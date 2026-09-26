import type { Location, Stance } from "@for-the-people/core/client";
import type { CardView, MemberView } from "./views";

/**
 * Suggested questions for Ask's empty state, shown as record rows: a portrait or a bill mark, then the
 * question. Each one is answerable from the record today (the demo model answers every one), and the
 * set is balanced: two Republican and two Democratic senators named, and one bill each side's majority
 * backed. Bills are named alike, by the short title Congress.gov records for them ("What is the SAVE
 * Act?"), with the number under the question; a bill whose short title is missing or too long for one
 * line is named by its number. Senators are named by their full names. The first fixed row changes each
 * day, so no side always leads. The first row can be personal, worked out on the device from the
 * voter's saved location or answers; nothing about the voter is sent to build it.
 */

/** Longest suggestion, so every row reads as one line at 390 px. */
export const MAX_SUGGESTION = 34;

type Portrait = MemberView["portrait"];

export interface SuggestionPerson {
  name: string;
  portrait: Portrait;
}

export type SuggestionLead =
  | { kind: "people"; people: SuggestionPerson[] }
  /** A bill, named in the question; the number ("H.R. 22") shows under it. */
  | { kind: "bill"; label: string }
  | { kind: "method" };

export interface Suggestion {
  question: string;
  lead: SuggestionLead;
  /** Why a personal row is first ("Your senator"). */
  note?: string;
}

/** A sitting senator, as the personal suggestion needs one. */
export interface AskSenator {
  name: string;
  lastName: string;
  state: string;
  portrait: Portrait;
}

type Starter =
  | { kind: "people"; question: string; people: Array<{ id: string; name: string }> }
  /** Worded from the key vote's own measure; the fallback is that measure, used if the deck lacks it. */
  | { kind: "keyVote"; id: string; fallback: { label: string; title: string } }
  | { kind: "method"; question: string };

/**
 * In an order that alternates sides (a Republican senator, the bill most Democrats backed, the bill most
 * Republicans backed, a Democratic senator), so rotating it by day never puts one side first twice
 * running. Both senator rows share one form: the full name fits 34 characters only as "Name's votes".
 * The Democratic-majority bill is the Ukraine Support Act (H.R. 2913): the Protect America's Workforce
 * Act (H.R. 2550), used before, cannot be named in one line.
 */
const STARTERS: Starter[] = [
  {
    kind: "people",
    question: "Ted Cruz's votes on tariffs?",
    people: [{ id: "C001098", name: "Ted Cruz" }],
  },
  {
    kind: "keyVote",
    id: "kv-ukraine-aid",
    fallback: { label: "H.R. 2913", title: "Ukraine Support Act" },
  },
  { kind: "keyVote", id: "kv-save-act", fallback: { label: "H.R. 22", title: "SAVE Act" } },
  {
    kind: "people",
    question: "Chuck Schumer's votes on Iran?",
    people: [{ id: "S000148", name: "Chuck Schumer" }],
  },
  {
    kind: "people",
    question: "Compare Fetterman and Murkowski",
    people: [
      { id: "F000479", name: "John Fetterman" },
      { id: "M001153", name: "Lisa Murkowski" },
    ],
  },
  { kind: "method", question: "How does the match score work?" },
];

const DAY_MS = 86_400_000;

const fits = (question: string) => question.length <= MAX_SUGGESTION;

/**
 * A bill's short title when it is a name ("SAVE Act", "Laken Riley Act"), not a line saying what the
 * bill does ("To require the Secretary of Homeland Security to...", "A joint resolution terminating...").
 */
export function billName(title: string): string | null {
  const name = title.trim();
  if (/^(To|A|An|Relating|Providing|Directing)\b/.test(name)) return null;
  return /\b(Act|Bill)( of \d{4})?$/.test(name) ? name : null;
}

/** "What is the SAVE Act?" when the short title fits one line, otherwise "What is H.R. 1?". */
export function billQuestion(measure: { label: string; title: string }): string {
  const name = billName(measure.title);
  const named = name ? `What is the ${name}?` : null;
  return named && fits(named) ? named : `What is ${measure.label}?`;
}

/** The fixed starters from one day's first row: the list turns by one row each day (UTC). */
function startersFor(today: string) {
  const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / DAY_MS);
  const first = ((day % STARTERS.length) + STARTERS.length) % STARTERS.length;
  return [...STARTERS.slice(first), ...STARTERS.slice(0, first)];
}

/** The fixed suggestions for one day (YYYY-MM-DD), with portraits and bills, resolved on the server. */
export function starterSuggestions(
  members: readonly MemberView[],
  cards: readonly CardView[],
  today: string,
): Suggestion[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  return startersFor(today).map((starter): Suggestion => {
    if (starter.kind === "keyVote") {
      const measure = cards.find((card) => card.id === starter.id)?.measures[0] ?? starter.fallback;
      return { question: billQuestion(measure), lead: { kind: "bill", label: measure.label } };
    }
    if (starter.kind === "method") return { question: starter.question, lead: { kind: "method" } };
    return {
      question: starter.question,
      lead: {
        kind: "people",
        people: starter.people.map((person) => ({
          name: person.name,
          portrait: byId.get(person.id)?.portrait ?? null,
        })),
      },
    };
  });
}

/** Every sitting senator, for the personal "How has your senator voted?" row. */
export const askSenators = (members: readonly MemberView[]): AskSenator[] =>
  members
    .filter((member) => member.serving && member.chamber === "senate")
    .map((member) => ({
      name: member.name,
      lastName: member.lastName,
      state: member.state,
      portrait: member.portrait,
    }));

function senatorQuestion(senator: AskSenator): string | null {
  const first = senator.name.split(/\s+/)[0] ?? "";
  return (
    [
      `How has ${first} ${senator.lastName} voted?`,
      `How has Sen. ${senator.lastName} voted?`,
      `How has ${senator.lastName} voted?`,
    ].find(fits) ?? null
  );
}

/**
 * The first row when the device knows something about the voter: their senator when a location is
 * saved, otherwise the bill behind the answer they weighted most (the latest one on a tie).
 */
export function personalSuggestion(
  voter: { stances: readonly Stance[]; location: Location | null },
  senators: readonly AskSenator[],
  cards: readonly CardView[],
): Suggestion | null {
  if (voter.location) {
    const state = voter.location.state;
    const own = senators
      .filter((senator) => senator.state === state)
      .toSorted((a, b) => a.lastName.localeCompare(b.lastName));
    for (const senator of own) {
      const question = senatorQuestion(senator);
      if (question)
        return {
          question,
          lead: { kind: "people", people: [{ name: senator.name, portrait: senator.portrait }] },
          note: "Your senator",
        };
    }
  }
  const decided = voter.stances
    .filter((stance) => stance.choice !== "Skip")
    .toSorted((a, b) => b.weight - a.weight || b.answeredAt.localeCompare(a.answeredAt));
  for (const stance of decided) {
    const measure = cards.find((card) => card.id === stance.keyVoteId)?.measures[0];
    if (!measure) continue;
    // Worded like the fixed rows, so a bill is never named one way here and another way there.
    const question = billQuestion(measure);
    if (!fits(question)) continue;
    return {
      question,
      lead: { kind: "bill", label: measure.label },
      note: `You answered ${stance.choice}`,
    };
  }
  return null;
}

/** The rows to show: the personal one first, then the fixed ones without repeating it. */
export function suggestionsFor(
  personal: Suggestion | null,
  starters: readonly Suggestion[],
): Suggestion[] {
  if (!personal) return [...starters];
  return [personal, ...starters.filter((starter) => starter.question !== personal.question)];
}
