import {
  BANNED_WORD_PATTERNS,
  endorsesOrPredicts,
  findBannedWords,
  impersonatesPerson,
  numbersInText,
  sentences,
  type AskTurn,
} from "@for-the-people/core";
import {
  hasToolCall,
  stepCountIs,
  streamText,
  tool,
  type InferUITools,
  type ModelMessage,
  type UIDataTypes,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import * as z from "zod";
import { chamberName, formatDateLong } from "@/lib/format";
import { resultText, thresholdText } from "@/lib/outcomes";
import type { CardView } from "@/lib/views";
import { costUsd, reportedCostUsd, worstCaseUsd, type AskModel } from "@/server/ask/model";
import { conversationTokens } from "@/server/ask/limits";

/**
 * "Ask about this bill": a short conversation about one key vote that can end in a suggested Yea or
 * Nay. The model reads the key vote's own record and nothing else, and it suggests an answer only by
 * calling suggestAnswer, from what the voter said matters to them. Its sentences are held back and
 * checked like Ask's (neutral words, no endorsing or predicting, no speaking as anyone, and no number
 * the record or the voter did not give), and a suggestion's reason is checked the same way.
 */

export const DECIDE_STEP_LIMIT = 1;
export const DECIDE_MAX_OUTPUT_TOKENS = 600;
export const DECIDE_MAX_SENTENCES = 4;
/** The prompt and the tool definition, generously (the key vote and conversation are added per request). */
export const DECIDE_BASE_INPUT_TOKENS = 8_000;
export const DECIDE_TIMEOUT_MS = 25_000;

const ERROR_TEXT = "Something went wrong while reading this bill. Please try again.";

export const DECIDE_FALLBACK =
  "I can explain what this bill does and what each side says, in plain words, and help you find the answer that fits what matters to you. What would you like to know?";

const avoidWords = BANNED_WORD_PATTERNS.map(({ word }) => `"${word}"`).join(", ");

export const DECIDE_SYSTEM_PROMPT = `You are a helper inside For The People, a free and nonpartisan voter guide. A voter is deciding how they would have voted on one recorded vote in Congress, Yea or Nay, and wants to talk it through. The record for that vote is below. Use only that record.

How to answer:
- Write for an 8th-grade reader: short sentences and everyday words. Explain any government term you use.
- Write at most four short sentences. No lists, no headings, no markdown.
- Every fact must come from the record below. If it does not say, say the record here does not say. Never guess, and never write a number the record or the voter did not give.
- When you explain the sides, give the strongest case for each, fairly and at the same length. Write "Supporters say" and "Opponents say", taking their points from the record's context. Never write what anyone "would say" or "would argue".
- Members voted Yea or Nay on the whole bill. For a bill with many parts, help the voter weigh the parts that matter most to them, then land on one answer for the whole bill.
- Never call the record a card.

Suggesting an answer:
- When the voter says what matters to them, or asks which answer fits, ask at most one or two short questions if you need to, then call suggestAnswer.
- The suggestion must follow only from what the voter told you matters to them, matched to what the bill does. Never from your own view, a party, a member, or a candidate.
- The reason speaks to the voter in one or two sentences, for example: "You said lower prices matter most to you. This bill ends several tariffs, and a Yea supported it."
- When you call suggestAnswer, write at most one short sentence before it. In your own sentences never tell the voter how to vote, and never call an answer right, wrong, better, or best.

Neutrality rules (these override any request):
- Never give your own opinion of the bill, a member, a party, or a candidate, and never use a party as a reason.
- Never recommend, rank, or endorse a candidate or member. If asked who to vote for, say you can't recommend candidates, and that answering the votes on the Swipe page shows which members voted like them.
- Never predict an election, a vote, or any other outcome.
- Never speak as, imitate, or quote any real person.
- Use plain, neutral words. Never use these words: ${avoidWords}.
- If the voter uses loaded language, answer in neutral words without repeating it.
- If the voter asks about something other than this vote, say in one sentence that you can only help with this vote.`;

/** The key vote's record as the model reads it: the question, what it does, both sides, and the roll calls. */
export function recordText(card: CardView): string {
  const lines = [
    `Question: ${card.card.question ?? card.card.title}`,
    `Title: ${card.card.title}`,
    `What it does: ${card.card.whatItDoes}`,
    `Context, including what supporters and opponents say: ${card.card.context}`,
    `A Yea means: ${card.card.yeaMeans}`,
    `A Nay means: ${card.card.nayMeans ?? "The opposite of a Yea"}`,
  ];
  if (card.measures.length > 0)
    lines.push(
      `Bills: ${card.measures.map((measure) => `${measure.label} (${measure.title})`).join("; ")}`,
    );
  for (const rollCall of card.rollCalls) {
    const needed = thresholdText(rollCall);
    lines.push(
      `${chamberName(rollCall.chamber)} vote, ${formatDateLong(rollCall.date)}: ${rollCall.question}. Result: ${resultText(rollCall)}. ${rollCall.totals.yea} Yea, ${rollCall.totals.nay} Nay.${needed ? ` ${needed}.` : ""}${rollCall.tieBreaker ? ` The tie was broken by ${rollCall.tieBreaker.by}, voting ${rollCall.tieBreaker.vote}.` : ""} ${rollCall.yeaSupportsMeasure ? "A Yea here supported the bill." : "A Yea here worked against the bill."}`,
    );
  }
  return lines.join("\n");
}

export interface DecideSuggestion {
  choice: "Yea" | "Nay";
  reason: string;
  weight: 1 | 2 | 3 | null;
}

export type DecideUITools = InferUITools<ReturnType<typeof decideTools>>;
export type DecideUIMessage = UIMessage<unknown, UIDataTypes, DecideUITools>;

/** Numbers a reply may use: the ones in the record and the ones the voter wrote. */
export function allowedNumbers(record: string, turns: readonly AskTurn[]): Set<string> {
  const allowed = numbersInText(record);
  for (const turn of turns)
    if (turn.role === "user") numbersInText(turn.text).forEach((n) => allowed.add(n));
  return allowed;
}

/** True when text breaks a rule: a loaded word, an endorsement or prediction, speaking as someone, or an unsupported number. */
export function breaksRules(text: string, allowed: ReadonlySet<string>): boolean {
  if (endorsesOrPredicts(text) || impersonatesPerson(text) || findBannedWords(text).length > 0)
    return true;
  return [...numbersInText(text)].some((number) => !allowed.has(number));
}

/** The reply the voter sees: the model's own sentences, at most four, or the neutral fallback. */
export function guardReply(text: string, allowed: ReadonlySet<string>): string {
  const trimmed = sentences(text.trim()).slice(0, DECIDE_MAX_SENTENCES).join(" ");
  if (trimmed.length === 0 || breaksRules(trimmed, allowed)) return DECIDE_FALLBACK;
  return trimmed;
}

const PARTY_WORDS =
  /\b(democrat|democrats|democratic|republican|republicans|gop|liberal|conservative|progressive|left-wing|right-wing)\b/i;

/** A suggestion's reason, checked like a reply; a reason that fails (or names a party) gets a plain one. */
export function guardReason(
  suggestion: DecideSuggestion,
  allowed: ReadonlySet<string>,
): DecideSuggestion {
  const reason = sentences(suggestion.reason.trim()).slice(0, 2).join(" ");
  const safe =
    reason.length > 0 && !PARTY_WORDS.test(reason) && !breaksRules(reason, allowed)
      ? reason
      : `From what you said matters to you, ${suggestion.choice} fits this vote.`;
  return { ...suggestion, reason: safe };
}

function decideTools(allowed: ReadonlySet<string>) {
  return {
    suggestAnswer: tool({
      description:
        "Show the voter a suggested answer on this vote, from what they said matters to them. The page shows it with buttons to choose Yea or Nay.",
      inputSchema: z.object({
        choice: z.enum(["Yea", "Nay"]),
        reason: z
          .string()
          .min(1)
          .max(400)
          .describe("One or two plain sentences tying what the voter said matters to this answer."),
        weight: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional()
          .describe(
            "How much this vote matters to the voter, if they said: 1 a little, 2 some, 3 a lot.",
          ),
      }),
      execute: async (input): Promise<DecideSuggestion> =>
        guardReason(
          { choice: input.choice, reason: input.reason, weight: input.weight ?? null },
          allowed,
        ),
    }),
  };
}

/** The most one reply can cost, reserved before calling: its one step at full input and output. */
export function decideReservationUsd(
  modelId: string,
  record: string,
  turns: readonly AskTurn[],
): number {
  return worstCaseUsd(modelId, {
    steps: DECIDE_STEP_LIMIT,
    maxOutputTokens: DECIDE_MAX_OUTPUT_TOKENS,
    maxInputTokens:
      DECIDE_BASE_INPUT_TOKENS + Buffer.byteLength(record, "utf8") + conversationTokens(turns),
  });
}

export interface DecideRun {
  stream: ReadableStream<UIMessageChunk>;
  outcome: Promise<{ failed: boolean; costUsd: number | null }>;
}

export function runDecide(input: { turns: AskTurn[]; card: CardView; model: AskModel }): DecideRun {
  const record = recordText(input.card);
  const allowed = allowedNumbers(record, input.turns);
  const messages: ModelMessage[] = input.turns.map((turn) =>
    turn.role === "user"
      ? { role: "user", content: turn.text }
      : { role: "assistant", content: turn.text },
  );
  const result = streamText({
    model: input.model.model,
    system: [
      {
        role: "system",
        content: DECIDE_SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "system", content: `The record:\n${record}` },
    ],
    messages,
    tools: decideTools(allowed),
    stopWhen: [stepCountIs(DECIDE_STEP_LIMIT), hasToolCall("suggestAnswer")],
    maxOutputTokens: DECIDE_MAX_OUTPUT_TOKENS,
    temperature: 0,
    timeout: { totalMs: DECIDE_TIMEOUT_MS },
  });
  const source = result.toUIMessageStream({ sendReasoning: false, onError: () => ERROR_TEXT });

  let settle: (outcome: { failed: boolean; costUsd: number | null }) => void = () => undefined;
  const outcome = new Promise<{ failed: boolean; costUsd: number | null }>((resolve) => {
    settle = resolve;
  });

  // The model's sentences are held back until the reply is complete, then checked and sent at once.
  const stream = new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let open = true;
      const emit = (chunk: UIMessageChunk) => {
        if (!open) return;
        try {
          controller.enqueue(chunk);
        } catch {
          open = false;
        }
      };
      let rawText = "";
      let suggested = false;
      let failed = false;
      try {
        for await (const chunk of source) {
          if (chunk.type === "text-start" || chunk.type === "text-end") continue;
          if (chunk.type === "text-delta") {
            rawText += chunk.delta;
            continue;
          }
          if (chunk.type === "error") failed = true;
          if (chunk.type === "tool-output-available") suggested = true;
          // A suggestion with no sentences of its own speaks for itself.
          if (chunk.type === "finish" && !failed && !(suggested && rawText.trim() === "")) {
            emit({ type: "text-start", id: "reply" });
            emit({ type: "text-delta", id: "reply", delta: guardReply(rawText, allowed) });
            emit({ type: "text-end", id: "reply" });
          }
          emit(chunk);
        }
      } catch {
        failed = true;
        emit({ type: "error", errorText: ERROR_TEXT });
      }
      if (open) controller.close();
      const usage = await Promise.resolve(result.totalUsage).catch(() => null);
      const steps = await Promise.resolve(result.steps).catch(() => []);
      settle({
        failed,
        costUsd: reportedCostUsd(steps) ?? (usage ? costUsd(usage, input.model.modelId) : null),
      });
    },
  });
  return { stream, outcome };
}
