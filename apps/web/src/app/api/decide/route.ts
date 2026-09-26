import {
  ASK_LIMITS,
  AskMessage,
  conversationTurns,
  currentQuestion,
  historyChars,
  KeyVoteId,
  looksLikeAddress,
} from "@for-the-people/core";
import { getDb } from "@for-the-people/data";
import { consumeRateLimit, rateLimitKey } from "@for-the-people/data/runtime/rate-limit";
import { createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import * as z from "zod";
import { replayChunks } from "@/server/ask/engine";
import { reserveUsd, settledCostUsd, settleSpend } from "@/server/ask/limits";
import { getAskModel } from "@/server/ask/model";
import { getDeckCards } from "@/server/data";
import { decideReservationUsd, recordText, runDecide } from "@/server/decide/engine";
import { clientIp, readBodyText, rejectCrossSite } from "@/server/request";

/**
 * POST /api/decide: "Ask about this bill", a short conversation about one key vote. It carries only the
 * key vote's id and the conversation, never the voter's other answers or location, and it reuses Ask's
 * rate limits, spend cap and model. Nothing is cached or stored.
 */

export const maxDuration = 30;

const DecideRequest = z
  .object({
    id: z.string().max(128).optional(),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
    messageId: z.string().max(128).optional(),
    keyVoteId: KeyVoteId,
    messages: z
      .array(AskMessage)
      .min(1)
      .max(200)
      .refine((messages) => historyChars(messages) <= ASK_LIMITS.maxHistoryChars),
  })
  .strict();

const ADDRESS_REPLY =
  "This helper does not read addresses, so your message was not sent to any AI model. To see the races on your 2026 ballot, enter your address on the Ballot page.";

const problem = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store", ...headers } });

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  const raw = await readBodyText(request, ASK_LIMITS.maxBodyBytes);
  if (raw === null) return problem(413, "That conversation is too long. Close it and start again.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, "The message could not be read. Try sending it again.");
  }
  const parsed = DecideRequest.safeParse(body);
  if (!parsed.success) return problem(400, "The message could not be read. Try sending it again.");
  const question = currentQuestion(parsed.data.messages);
  if (!question)
    return problem(400, `Write a message of up to ${ASK_LIMITS.maxQuestionChars} characters.`);

  if (looksLikeAddress(question))
    return createUIMessageStreamResponse({
      stream: replayChunks([
        { type: "start" },
        { type: "text-start", id: "reply" },
        { type: "text-delta", id: "reply", delta: ADDRESS_REPLY },
        { type: "text-end", id: "reply" },
        { type: "finish" },
      ]),
      headers: { "cache-control": "no-store" },
    });

  const model = getAskModel("default");
  if (model.demo) return problem(503, "This helper is not available right now. Try again later.");
  const card = (await getDeckCards()).find((candidate) => candidate.id === parsed.data.keyVoteId);
  if (!card) return problem(404, "That vote is not available. Reload the page and try again.");

  const db = await getDb();
  const now = new Date();
  const rate = await consumeRateLimit(db, rateLimitKey("decide", clientIp(request)), now);
  if (!rate.ok)
    return problem(
      429,
      rate.window === "minute"
        ? "That is a lot of messages in a minute. Wait a moment and try again."
        : "You have reached today's limit for messages. Try again tomorrow.",
      { "retry-after": String(rate.retryAfterSeconds) },
    );
  const turns = conversationTurns(parsed.data.messages);
  const reservation = await reserveUsd(
    db,
    decideReservationUsd(model.modelId, recordText(card), turns),
    now,
  );
  if (!reservation)
    return problem(429, "This helper has reached its daily limit. Try again tomorrow.");

  const run = runDecide({ turns, card, model });
  after(async () => {
    const outcome = await run.outcome;
    await settleSpend(db, reservation, settledCostUsd(outcome, reservation));
  });
  return createUIMessageStreamResponse({ stream: run.stream });
}
