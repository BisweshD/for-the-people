import {
  ASK_LIMITS,
  AskRequest,
  conversationTurns,
  currentQuestion,
  isComplexQuestion,
  looksLikeAddress,
} from "@for-the-people/core";
import { getDb } from "@for-the-people/data";
import { dataVersion } from "@for-the-people/data/read";
import { getAskCache, putAskCache } from "@for-the-people/data/runtime/ask-cache";
import { consumeRateLimit } from "@for-the-people/data/runtime/rate-limit";
import { utcDay } from "@for-the-people/data/runtime/spend";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { after } from "next/server";
import { addressReply, replayChunks, runAsk } from "@/server/ask/engine";
import {
  answerKey,
  reserveSpend,
  settledCostUsd,
  settleSpend,
  visitorKey,
} from "@/server/ask/limits";
import { getAskModel } from "@/server/ask/model";
import { readBodyText, rejectCrossSite } from "@/server/request";

/**
 * POST /api/ask: Ask For The People. Validates the body, answers identical questions
 * from a one-hour cache, rate-limits by a salted IP hash, holds the daily spend cap, and streams the
 * guarded answer. Stances arrive only when the voter taps "Use my answers" and are never stored.
 */

// Runs on the Node.js runtime, the only one Cache Components allows (a `runtime` export is rejected).
export const maxDuration = 30;

const problem = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  const raw = await readBodyText(request, ASK_LIMITS.maxBodyBytes);
  if (raw === null) return problem(413, "That conversation is too long. Start a new one.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, "The question could not be read.");
  }
  const parsed = AskRequest.safeParse(body);
  if (!parsed.success) return problem(400, "The question could not be read.");
  const question = currentQuestion(parsed.data.messages);
  if (!question)
    return problem(400, `Ask a question of up to ${ASK_LIMITS.maxQuestionChars} characters.`);

  // An address goes only to the geocoder: answer with a fixed pointer to
  // My Ballot, with no model call, no cache entry, and nothing logged.
  if (looksLikeAddress(question))
    return createUIMessageStreamResponse({
      stream: replayChunks(addressReply()),
      headers: { "cache-control": "no-store" },
    });

  const db = await getDb();
  const now = new Date();
  const stances = parsed.data.stances ?? null;
  const districtIds = parsed.data.districtIds ?? [];
  const turns = conversationTurns(parsed.data.messages);
  const model = getAskModel(isComplexQuestion(question) ? "complex" : "default");

  // Only a first question with no shared answers is cached (address-like ones never get this far).
  const cacheable = stances === null && turns.length === 1;
  let cache: { key: string; version: string } | null = null;
  if (cacheable) {
    const version = await dataVersion(db);
    const key = answerKey({ question, districtIds, modelId: model.modelId, dataVersion: version });
    const hit = await getAskCache(db, key, version, now);
    if (Array.isArray(hit)) {
      return createUIMessageStreamResponse({
        stream: replayChunks(hit as UIMessageChunk[]),
        headers: { "x-ask-cache": "hit" },
      });
    }
    cache = { key, version };
  }

  const rate = await consumeRateLimit(db, visitorKey(request), now);
  if (!rate.ok) {
    return problem(
      429,
      rate.window === "minute"
        ? "That is a lot of questions in a minute. Wait a moment and try again."
        : "You have reached today's limit for questions. Try again tomorrow.",
      { "retry-after": String(rate.retryAfterSeconds) },
    );
  }
  const reservation = await reserveSpend(db, model.modelId, turns, now);
  if (!reservation)
    return problem(429, "Ask For The People has reached its daily limit. Try again tomorrow.");

  const run = runAsk({
    turns,
    context: { db, today: utcDay(now), districtIds, stances },
    model,
  });
  after(async () => {
    const outcome = await run.outcome;
    await settleSpend(db, reservation, settledCostUsd(outcome, reservation));
    if (cache && !outcome.failed) {
      await putAskCache(db, {
        key: cache.key,
        dataVersion: cache.version,
        response: outcome.chunks,
        createdAt: new Date().toISOString(),
      });
    }
  });
  return createUIMessageStreamResponse({ stream: run.stream });
}
