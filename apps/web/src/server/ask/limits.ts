import { createHash } from "node:crypto";
import { normalizeQuestion, type AskTurn } from "@for-the-people/core";
import type { Db } from "@for-the-people/data";
import { rateLimitKey } from "@for-the-people/data/runtime/rate-limit";
import { addSpend, utcDay } from "@for-the-people/data/runtime/spend";
import { clientIp } from "@/server/request";
import { ASK_TOOL_BUDGET_BYTES } from "./budget";
import { ASK_BASE_INPUT_TOKENS, ASK_MAX_OUTPUT_TOKENS, ASK_STEP_LIMIT } from "./engine";
import { worstCaseUsd } from "./model";

/**
 * Abuse and spend limits for /api/ask. The visitor is identified only
 * by a salted hash of their IP address (IP_HASH_SALT, shared with every rate limit); the address itself
 * is never stored or logged.
 */

export const DAILY_SPEND_CAP_USD = 20;

/** The rate-limit key for a request: a salted hash of the caller's IP, scoped to Ask. */
export function visitorKey(request: Request): string {
  return rateLimitKey("ask", clientIp(request));
}

/** The answer-cache key: the normalized question, the voter's districts, the model, and the data version. */
export function answerKey(input: {
  question: string;
  districtIds: readonly string[];
  modelId: string;
  dataVersion: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        normalizeQuestion(input.question),
        [...input.districtIds].sort(),
        input.modelId,
        input.dataVersion,
      ]),
    )
    .digest("hex");
}

export interface SpendReservation {
  day: string;
  reservedUsd: number;
}

/**
 * Input tokens the conversation adds to every step. Counted as its UTF-8 bytes: a byte-level tokenizer
 * never makes more tokens than bytes, so this can only overestimate. The request schema caps the
 * conversation (ASK_LIMITS.maxHistoryChars), which bounds the largest reservation.
 */
export function conversationTokens(turns: readonly AskTurn[]): number {
  return turns.reduce((total, turn) => total + Buffer.byteLength(turn.text, "utf8"), 0);
}

/**
 * The most this request can cost: every step at full output, reading the fixed prompt, its
 * conversation, and the whole tool budget (budget.ts caps what tools give the model per run).
 */
export function reservationUsd(modelId: string, turns: readonly AskTurn[]): number {
  return worstCaseUsd(modelId, {
    steps: ASK_STEP_LIMIT,
    maxOutputTokens: ASK_MAX_OUTPUT_TOKENS,
    maxInputTokens: ASK_BASE_INPUT_TOKENS + conversationTokens(turns) + ASK_TOOL_BUDGET_BYTES,
  });
}

/**
 * Reserves the most this request could cost against today's cap before calling the model, so parallel
 * requests cannot overshoot it. Returns null (and releases the hold) when the cap would be passed.
 */
export async function reserveSpend(
  db: Db,
  modelId: string,
  turns: readonly AskTurn[],
  now: Date,
): Promise<SpendReservation | null> {
  return reserveUsd(db, reservationUsd(modelId, turns), now);
}

/** Reserves a given amount against the same daily cap (Ask and "Ask about this bill" share it). */
export async function reserveUsd(
  db: Db,
  reservedUsd: number,
  now: Date,
): Promise<SpendReservation | null> {
  const day = utcDay(now);
  const total = await addSpend(db, day, reservedUsd, 1);
  if (total > DAILY_SPEND_CAP_USD) {
    await addSpend(db, day, -reservedUsd, -1);
    return null;
  }
  return { day, reservedUsd };
}

/**
 * What a finished request is charged. A run that failed, or whose usage the provider never reported,
 * may still have been billed for the steps it made, so it keeps its whole reservation instead of $0.
 */
export function settledCostUsd(
  outcome: { failed: boolean; costUsd: number | null },
  reservation: SpendReservation,
): number {
  if (outcome.failed || outcome.costUsd === null) return reservation.reservedUsd;
  return outcome.costUsd;
}

/** Replaces the reservation with what the request actually cost. */
export async function settleSpend(
  db: Db,
  reservation: SpendReservation,
  actualUsd: number,
): Promise<void> {
  await addSpend(db, reservation.day, actualUsd - reservation.reservedUsd, 0);
}
