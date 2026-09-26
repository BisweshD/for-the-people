/**
 * What an Ask For The People request may carry: the size limits and the address
 * check. No Zod here, so the browser can trim its history and spot addresses with the same rules the
 * server enforces in ask.ts.
 */

export const ASK_LIMITS = {
  /** Messages kept from the conversation, oldest dropped first. */
  maxMessages: 24,
  /** Characters in the question being asked now. */
  maxQuestionChars: 500,
  /** Characters in any one earlier message part. */
  maxPartChars: 2000,
  maxPartsPerMessage: 40,
  /**
   * Characters of text across every message in one request. The spend cap prices each request from
   * its real size, and this bound keeps the largest one small.
   */
  maxHistoryChars: 12_000,
  /** Stances a voter can share with one question ("Use my answers"). */
  maxStances: 60,
  /** Sentences the model may write around the tool cards. */
  maxSentences: 3,
  /** Raw request body size in bytes. */
  maxBodyBytes: 256_000,
} as const;

/** The parts of a chat message these rules read; tool parts and anything else are ignored. */
export interface AskMessageLike {
  role: string;
  parts: ReadonlyArray<{ type: string; text?: string | undefined }>;
}

/** The text a message carries, from its text parts only. */
export function messageText(message: AskMessageLike): string {
  return message.parts
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n")
    .trim();
}

/** Characters of text across a whole conversation, the number `maxHistoryChars` bounds. */
export function historyChars(messages: readonly AskMessageLike[]): number {
  return messages.reduce(
    (total, message) =>
      total +
      message.parts.reduce(
        (sum, part) => sum + (part.type === "text" && part.text ? part.text.length : 0),
        0,
      ),
    0,
  );
}

/**
 * The newest messages that fit the request limits, reduced to their text parts (the server never
 * reads tool results from the client). The last message, the question being asked, is always kept.
 */
export function fitHistory<M extends AskMessageLike>(messages: readonly M[]): M[] {
  const kept: M[] = [];
  let chars = 0;
  for (const message of messages.toReversed()) {
    const textOnly = { ...message, parts: message.parts.filter((part) => part.type === "text") };
    const size = historyChars([textOnly]);
    if (
      kept.length > 0 &&
      (kept.length >= ASK_LIMITS.maxMessages || chars + size > ASK_LIMITS.maxHistoryChars)
    )
      break;
    kept.push(textOnly);
    chars += size;
  }
  return kept.toReversed();
}

const STREET_SUFFIX =
  "st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|trl|trail";

const ADDRESS_PATTERNS: readonly RegExp[] = [
  // "123 Main St", "4500 N. Ocean Boulevard"
  new RegExp(
    `\\b\\d{1,6}\\s+(?:[nsew]\\.?\\s+)?(?:[a-z0-9'.-]+\\s+){0,4}(?:${STREET_SUFFIX})\\b\\.?`,
    "i",
  ),
  // ZIP or ZIP+4
  /\b\d{5}(?:-\d{4})?\b/,
  /\b(?:zip(?:\s*code)?|postal code)\s*:?\s*\d{5}\b/i,
  /\bp\.?\s*o\.?\s*box\s+\d+/i,
  /\b(?:apt|apartment|suite|unit)\s*#?\s*\d+/i,
];

/**
 * True when text seems to contain a street address. Ask never sends such a question to a model and
 * never caches it, and the ⌘K palette offers My Ballot instead of Ask for it.
 */
export function looksLikeAddress(text: string): boolean {
  return ADDRESS_PATTERNS.some((pattern) => pattern.test(text));
}
