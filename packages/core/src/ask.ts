import * as z from "zod";
import { ASK_LIMITS, historyChars, looksLikeAddress, messageText } from "./ask-input";
import { DistrictId } from "./ids";
import { endorsesOrPredicts, findBannedWords, impersonatesPerson } from "./neutrality";
import { Stance } from "./voter";

export * from "./ask-input";

/**
 * AskQuestion: the request contract and the server-side guardrail that runs
 * on every answer before it reaches the voter. Pure functions, no I/O.
 */

const AskPart = z.looseObject({
  type: z.string().min(1).max(64),
  text: z.string().max(ASK_LIMITS.maxPartChars).optional(),
});

export const AskMessage = z.looseObject({
  id: z.string().max(128),
  role: z.enum(["user", "assistant"]),
  parts: z.array(AskPart).max(ASK_LIMITS.maxPartsPerMessage),
});
export type AskMessage = z.infer<typeof AskMessage>;

/** What useChat's DefaultChatTransport posts to /api/ask, plus the two opt-in fields. */
export const AskRequest = z.object({
  id: z.string().max(128).optional(),
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  messageId: z.string().max(128).optional(),
  messages: z
    .array(AskMessage)
    .min(1)
    .max(200)
    .refine((messages) => historyChars(messages) <= ASK_LIMITS.maxHistoryChars, {
      message: `A conversation holds at most ${ASK_LIMITS.maxHistoryChars} characters of text.`,
    }),
  /** Sent only when the voter taps "Use my answers" for this question. Never stored. */
  stances: z.array(Stance).max(ASK_LIMITS.maxStances).optional(),
  /** The voter's district ids (never an address), when they have set a location. */
  districtIds: z.array(DistrictId).max(4).optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Keeps only the text of recent messages. Tool results in the history come from the client and are
 * never trusted, so the model sees prior turns as plain text and re-runs tools for fresh facts.
 * A voter's message that looks like an address is dropped with the reply to it, so no address ever
 * reaches a model. The turns always open with a voter's message, as the models require: a history cut
 * to its newest messages can start on an answer, and that answer is dropped too.
 */
export function conversationTurns(messages: readonly AskMessage[]): AskTurn[] {
  const turns: AskTurn[] = [];
  let skipping = false;
  for (const message of messages.slice(-ASK_LIMITS.maxMessages)) {
    const text = messageText(message);
    if (message.role === "user") skipping = looksLikeAddress(text);
    if (skipping || text.length === 0) continue;
    if (message.role === "assistant" && turns.length === 0) continue;
    turns.push({ role: message.role, text });
  }
  return turns;
}

/** The question being asked now: the last message's text, if the last message is the voter's. */
export function currentQuestion(messages: readonly AskMessage[]): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return null;
  const text = messageText(last);
  if (text.length === 0 || text.length > ASK_LIMITS.maxQuestionChars) return null;
  return text;
}

/** Lowercase, straight quotes, single spaces, no trailing punctuation: the cache key form of a question. */
export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[\s?.!]+$/g, "")
    .trim();
}

/**
 * Questions that need several tool calls or a comparison go to the larger model. Everything else goes
 * to the small, fast one.
 */
export function isComplexQuestion(question: string): boolean {
  const text = question.toLowerCase();
  if (/\b(compare|comparison|versus|vs\.?|differ|difference|both|each of)\b/.test(text))
    return true;
  if ((text.match(/\?/g) ?? []).length > 1) return true;
  if (/\bwhy\b/.test(text)) return true;
  return text.length > 220;
}

/** Number tokens in prose: "1,234", "52%", "$1.2", "2026-01-08" (as 2026, 1, 8), "3.5". */
const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;

const canonicalNumber = (token: string): string | null => {
  const value = Number(token.replace(/,/g, ""));
  return Number.isFinite(value) ? String(value) : null;
};

const SMALL_NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS_WORDS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUMBER_WORD_VALUES = new Map<string, number>([
  ...SMALL_NUMBER_WORDS.map((word, value) => [word, value] as const),
  ...TENS_WORDS.map((word, index) => [word, (index + 2) * 10] as const),
]);
const SCALE_WORDS = new Map([
  ["dozen", 12],
  ["hundred", 100],
  ["thousand", 1e3],
  ["million", 1e6],
  ["billion", 1e9],
  ["trillion", 1e12],
]);
const NUMBER_WORD = `(?:${[...NUMBER_WORD_VALUES.keys(), ...SCALE_WORDS.keys()].join("|")})`;
/** A run of number words: "forty-two", "one hundred and twelve", "a dozen", or a vague "hundreds". */
const NUMBER_WORDS = new RegExp(
  String.raw`\b${NUMBER_WORD}(?:(?:[\s-]+(?:and[\s-]+)?)${NUMBER_WORD})*\b|\b(?:dozens|hundreds|thousands|millions|billions|trillions)\b`,
  "gi",
);

/**
 * The value of a run of number words, or the lowercased word itself for a vague plural like
 * "hundreds" (it can then only be matched by the same word in a tool result). A lone "one" is left
 * out: it is far more often a pronoun ("no one", "one of them") than a count.
 */
function numberWordsValue(run: string): string | null {
  const words = run
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((word) => word !== "and");
  if (words.length === 1 && /s$/.test(words[0]!)) return words[0]!;
  if (words.length === 1 && words[0] === "one") return null;
  let total = 0;
  let current = 0;
  for (const word of words) {
    const small = NUMBER_WORD_VALUES.get(word);
    const scale = SCALE_WORDS.get(word);
    if (small !== undefined) current += small;
    else if (scale !== undefined && scale < 1000) current = (current || 1) * scale;
    else if (scale !== undefined) {
      total += (current || 1) * scale;
      current = 0;
    }
  }
  return String(total + current);
}

/**
 * Every number written in a piece of text, in canonical form ("08" and "8" are the same number).
 * Spelled-out numbers count too ("forty-two" is 42, "ninety-four percent" is 94), so the guard checks
 * them exactly like digits.
 */
export function numbersInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const canonical = canonicalNumber(match[0]);
    if (canonical !== null) found.add(canonical);
  }
  for (const match of text.matchAll(NUMBER_WORDS)) {
    const value = numberWordsValue(match[0]);
    if (value !== null) found.add(value);
  }
  return found;
}

/**
 * Every number a tool result contains, from numeric values and from digits inside strings
 * ("2025-01-22", "94%", "H.R. 22"). Also admits each whole percent of a 0-1 share so "94%" matches 0.94.
 */
export function numbersInValue(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(String(value));
    if (value > 0 && value < 1) into.add(String(Math.round(value * 100)));
  } else if (typeof value === "string") {
    for (const number of numbersInText(value)) into.add(number);
  } else if (Array.isArray(value)) {
    for (const item of value) numbersInValue(item, into);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) numbersInValue(item, into);
  }
  return into;
}

/** Abbreviations whose period does not end a sentence: titles, "U.S.", and bill labels like "H.J.Res. 88". */
const ABBREVIATION =
  /\b(Sen|Rep|Gov|Mrs|Mr|Ms|Dr|Jr|Sr|St|No|vs|Res|Con|[A-Z])\.(?=\s?[A-Za-z0-9])/g;

/** Stands in for an abbreviation's period while splitting: an invisible separator nobody types. */
const HELD_PERIOD = String.fromCharCode(0x2063);

/** Splits prose into sentences, keeping bill labels like "H.R. 22" and "U.S." inside one sentence. */
export function sentences(text: string): string[] {
  const protectedText = text.replace(ABBREVIATION, `$1${HELD_PERIOD}`);
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((sentence) => sentence.replaceAll(HELD_PERIOD, ".").trim())
    .filter(Boolean);
}

export type AskViolation =
  | { kind: "endorses-or-predicts" }
  | { kind: "speaks-as-person" }
  | { kind: "banned-word"; word: string }
  | { kind: "unsupported-number"; number: string };

export interface AskGuardResult {
  /** The text to show: the model's own (trimmed to three sentences) or a safe fallback. */
  text: string;
  violations: AskViolation[];
  usedFallback: boolean;
}

export const ASK_FALLBACK_WITH_CARDS =
  "Here is what the official record shows. Each result links to its receipt.";
export const ASK_FALLBACK_WITHOUT_CARDS =
  "I can only share what the official record shows about members, bills, and votes. I can't recommend a candidate or predict an election, but you can compare voting records with the match tools.";

/**
 * The post-check every answer passes before it is sent:
 * no endorsements or predictions, no speaking as a real person, no banned words, and every number in
 * the text (digits or words) must appear in this turn's tool results. A violation replaces the text
 * with a safe sentence; the tool cards stay.
 */
export function guardAnswer(input: {
  text: string;
  toolOutputs: readonly unknown[];
}): AskGuardResult {
  const trimmed = sentences(input.text.trim()).slice(0, ASK_LIMITS.maxSentences).join(" ");
  const violations: AskViolation[] = [];
  if (endorsesOrPredicts(trimmed)) violations.push({ kind: "endorses-or-predicts" });
  if (impersonatesPerson(trimmed)) violations.push({ kind: "speaks-as-person" });
  for (const hit of findBannedWords(trimmed))
    violations.push({ kind: "banned-word", word: hit.word });
  const allowed = numbersInValue(input.toolOutputs);
  for (const number of numbersInText(trimmed)) {
    if (!allowed.has(number)) violations.push({ kind: "unsupported-number", number });
  }
  const hasCards = input.toolOutputs.length > 0;
  const fallback = hasCards ? ASK_FALLBACK_WITH_CARDS : ASK_FALLBACK_WITHOUT_CARDS;
  if (violations.length > 0 || trimmed.length === 0) {
    return { text: fallback, violations, usedFallback: true };
  }
  return { text: trimmed, violations, usedFallback: false };
}
