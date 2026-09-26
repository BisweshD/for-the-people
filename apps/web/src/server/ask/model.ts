import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel, LanguageModelUsage } from "ai";
import { createMockAskModel, MOCK_MODEL_ID } from "./mock-model";

/**
 * The only place Ask For The People touches a model provider. Without ANTHROPIC_API_KEY every request gets
 * the deterministic mock, which calls the real tools and summarizes their real results with templates.
 * In production the paid model also needs the shared state that makes its limits real (see below).
 */

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_COMPLEX_MODEL = "claude-sonnet-5";

/** USD per million tokens. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  [MOCK_MODEL_ID]: { input: 0, output: 0 },
};

/** Unknown model ids are priced like the most expensive model we use, so the cap still holds. */
const priceOf = (modelId: string) => PRICES[modelId] ?? { input: 2, output: 10 };

export interface AskModel {
  model: LanguageModel;
  modelId: string;
  /** True when answers come from the template mock, not Claude. */
  demo: boolean;
}

export type ModelKind = "default" | "complex";

type Env = Record<string, string | undefined>;

/** Shortest IP_HASH_SALT accepted, the same rule as the rate-limit keys (runtime/rate-limit.ts). */
const MIN_SALT_LENGTH = 16;

/**
 * Why the paid model may not run in this environment, or null when it may. The $20/day cap, the rate
 * limits and the answer cache live in Postgres; without DATABASE_URL each server process keeps its own
 * copy in memory, so each would enforce its own cap. A production server therefore needs DATABASE_URL,
 * and an IP_HASH_SALT every instance shares so one visitor has one rate-limit key. Local development
 * (NODE_ENV other than production) may use the paid model with the in-memory database.
 */
export function paidModelBlocker(env: Env = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  if (!env.DATABASE_URL)
    return "DATABASE_URL is not set, so the spend cap and rate limits would be per process";
  if ((env.IP_HASH_SALT ?? "").length < MIN_SALT_LENGTH)
    return `IP_HASH_SALT is missing or shorter than ${MIN_SALT_LENGTH} characters`;
  return null;
}

let warned = false;

/** One warning per process, naming the missing setting (never a value). */
function warnOnce(reason: string): void {
  if (warned) return;
  warned = true;
  console.warn(`Ask For The People is using the demo model: ${reason}.`);
}

/** True when Ask answers with the labeled demo model, so the page can say so. */
export function usesDemoModel(env: Env = process.env): boolean {
  return !env.ANTHROPIC_API_KEY || paidModelBlocker(env) !== null;
}

/** A configured model id we have a price for, or the default: an unpriced model could slip the cap. */
const pricedModelId = (configured: string | undefined, fallback: string): string =>
  configured && configured in PRICES ? configured : fallback;

export function getAskModel(kind: ModelKind, env: Env = process.env): AskModel {
  const apiKey = env.ANTHROPIC_API_KEY;
  const demo = { model: createMockAskModel(), modelId: MOCK_MODEL_ID, demo: true };
  if (!apiKey) return demo;
  const blocker = paidModelBlocker(env);
  if (blocker) {
    warnOnce(blocker);
    return demo;
  }
  const modelId =
    kind === "complex"
      ? pricedModelId(env.ASK_MODEL_COMPLEX, DEFAULT_COMPLEX_MODEL)
      : pricedModelId(env.ASK_MODEL, DEFAULT_MODEL);
  return { model: createAnthropic({ apiKey })(modelId), modelId, demo: false };
}

/** Dollar cost of a request's usage. inputTokens already includes cache reads and writes. */
export function costUsd(usage: LanguageModelUsage, modelId: string): number {
  const price = priceOf(modelId);
  const details = usage.inputTokenDetails;
  const noCache = details.noCacheTokens ?? usage.inputTokens ?? 0;
  const cacheWrite = details.cacheWriteTokens ?? 0;
  const cacheRead = details.cacheReadTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return (
    (noCache * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.input * 0.1 +
      output * price.output) /
    1_000_000
  );
}

/** The most a request can cost: every step at full input and full output. Reserved before calling. */
export function worstCaseUsd(
  modelId: string,
  limits: { steps: number; maxOutputTokens: number; maxInputTokens: number },
): number {
  const price = priceOf(modelId);
  return (
    (limits.steps * (limits.maxInputTokens * price.input + limits.maxOutputTokens * price.output)) /
    1_000_000
  );
}
