import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, LanguageModelUsage, ProviderMetadata } from "ai";
import { createMockAskModel, MOCK_MODEL_ID } from "./mock-model";

/**
 * The only place Ask For The People touches a model provider. One provider answers, in this order:
 * OpenRouter when OPENROUTER_API_KEY is set, Anthropic directly when ANTHROPIC_API_KEY is set, and
 * otherwise the deterministic mock, which calls the real tools and summarizes their real results with
 * templates. In production a paid model also needs the shared state that makes its limits real (see below).
 */

export type AskProvider = "openrouter" | "anthropic" | "demo";

/** Anthropic's own model ids, for calls straight to Anthropic. */
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_COMPLEX_MODEL = "claude-sonnet-5";

/** OpenRouter's ids, for calls through OpenRouter. */
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-5";
export const OPENROUTER_DEFAULT_COMPLEX_MODEL = "anthropic/claude-opus-5.5";

interface Price {
  input: number;
  output: number;
}

/** USD per million tokens, keyed by each provider's own model ids. */
const ANTHROPIC_PRICES: Record<string, Price> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
};
const OPENROUTER_PRICES: Record<string, Price> = {
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
  "anthropic/claude-sonnet-5": { input: 2, output: 10 },
  "anthropic/claude-opus-5.5": { input: 4, output: 20 },
};

/** USD per million tokens, for every model id Ask may call. */
export const PRICES: Record<string, Price> = {
  ...ANTHROPIC_PRICES,
  ...OPENROUTER_PRICES,
  [MOCK_MODEL_ID]: { input: 0, output: 0 },
};

/** The highest input and output prices in the table. */
const HIGHEST_PRICE: Price = {
  input: Math.max(...Object.values(PRICES).map((price) => price.input)),
  output: Math.max(...Object.values(PRICES).map((price) => price.output)),
};

/** Unknown model ids are priced like the most expensive model we use, so the cap still holds. */
const priceOf = (modelId: string) => PRICES[modelId] ?? HIGHEST_PRICE;

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

/** The site OpenRouter credits with each request (its app attribution), when none is configured. */
const LOCAL_SITE = "http://localhost:3100";

/** The provider whose key is set: OpenRouter first, then Anthropic, else the demo templates. */
export function askProvider(env: Env = process.env): AskProvider {
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return "demo";
}

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
  return askProvider(env) === "demo" || paidModelBlocker(env) !== null;
}

/** A configured model id this provider has a price for, or the default: an unpriced model could slip the cap. */
const pricedModelId = (
  configured: string | undefined,
  fallback: string,
  prices: Record<string, Price>,
): string => (configured && configured in prices ? configured : fallback);

/**
 * A model through OpenRouter. Strict mode asks every stream to report its usage, and usage accounting
 * adds what each call cost (reportedCostUsd). Sonnet 5 and Opus 5.5 think by default, and thinking
 * would spend a step's output limit before any answer is written, so it is off: Ask's answers are
 * short sentences over tool results.
 */
function openRouterModel(apiKey: string, modelId: string, env: Env): LanguageModel {
  const provider = createOpenRouter({
    apiKey,
    compatibility: "strict",
    headers: {
      "HTTP-Referer": env.NEXT_PUBLIC_SITE_URL || LOCAL_SITE,
      "X-Title": "For The People",
    },
  });
  return provider.chat(modelId, {
    usage: { include: true },
    reasoning: { enabled: false, effort: "none", exclude: true },
    // One tool call per step, as Anthropic's disableParallelToolUse gives the direct path (engine.ts).
    parallelToolCalls: false,
  });
}

export function getAskModel(kind: ModelKind, env: Env = process.env): AskModel {
  const provider = askProvider(env);
  const demo = { model: createMockAskModel(), modelId: MOCK_MODEL_ID, demo: true };
  if (provider === "demo") return demo;
  const blocker = paidModelBlocker(env);
  if (blocker) {
    warnOnce(blocker);
    return demo;
  }
  const configured = kind === "complex" ? env.ASK_MODEL_COMPLEX : env.ASK_MODEL;
  if (provider === "openrouter") {
    const modelId = pricedModelId(
      configured,
      kind === "complex" ? OPENROUTER_DEFAULT_COMPLEX_MODEL : OPENROUTER_DEFAULT_MODEL,
      OPENROUTER_PRICES,
    );
    return { model: openRouterModel(env.OPENROUTER_API_KEY!, modelId, env), modelId, demo: false };
  }
  const modelId = pricedModelId(
    configured,
    kind === "complex" ? DEFAULT_COMPLEX_MODEL : DEFAULT_MODEL,
    ANTHROPIC_PRICES,
  );
  return {
    model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelId),
    modelId,
    demo: false,
  };
}

/**
 * Dollar cost of a request's usage. inputTokens is every input token, cache reads and writes included,
 * so the uncached share is what is left after both (OpenRouter's own "no cache" count still holds the
 * cache writes).
 */
export function costUsd(usage: LanguageModelUsage, modelId: string): number {
  const price = priceOf(modelId);
  const details = usage.inputTokenDetails;
  const cacheWrite = details.cacheWriteTokens ?? 0;
  const cacheRead = details.cacheReadTokens ?? 0;
  const uncached =
    usage.inputTokens !== undefined
      ? Math.max(0, usage.inputTokens - cacheRead - cacheWrite)
      : (details.noCacheTokens ?? 0);
  const output = usage.outputTokens ?? 0;
  return (
    (uncached * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.input * 0.1 +
      output * price.output) /
    1_000_000
  );
}

/**
 * What OpenRouter says a run cost: the sum of every step's reported cost, or null when any step
 * reported none (another provider, or a step that failed), so the caller prices the usage instead.
 */
export function reportedCostUsd(
  steps: ReadonlyArray<{ providerMetadata?: ProviderMetadata | undefined }>,
): number | null {
  if (steps.length === 0) return null;
  let total = 0;
  for (const step of steps) {
    const usage = step.providerMetadata?.openrouter?.usage;
    const cost =
      usage && typeof usage === "object" && !Array.isArray(usage) ? usage.cost : undefined;
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return null;
    total += cost;
  }
  return total;
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
