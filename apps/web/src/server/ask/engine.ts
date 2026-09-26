import { guardAnswer, type AskGuardResult, type AskTurn } from "@for-the-people/core";
import {
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessageChunk,
} from "ai";
import { ToolBudget } from "./budget";
import { costUsd, reportedCostUsd, type AskModel } from "./model";
import { ASK_SYSTEM_PROMPT, requestContext } from "./prompt";
import { createAskTools, type AskContext, type AskMetadata } from "./tools";

/**
 * One Ask For The People answer: the model calls read-only tools, their full results stream to the page as
 * cards, and the model's own text is held back until the guardrail has checked it. Nothing here
 * touches Next.js, so the eval runner uses the same code path as the route.
 */

export const ASK_STEP_LIMIT = 5;
export const ASK_MAX_OUTPUT_TOKENS = 600;
/**
 * Upper bound on the prompt per step apart from the conversation and the tool results, for the spend
 * cap: the system prompt and tool definitions (with the cache-write surcharge), earlier steps' text and
 * tool calls read again as input, and one budget note per step (test/ask-budget.test.ts measures it).
 * The conversation's tokens and the tool budget are added per request (limits.ts).
 */
export const ASK_BASE_INPUT_TOKENS = 20_000;
/** A run that has not finished by now is stopped and answered with the error, inside the route's 30 s. */
export const ASK_TIMEOUT_MS = 25_000;

const ERROR_TEXT = "Something went wrong while checking the record. Please try again.";

/** The whole answer to a question that looks like an address. No model ever sees such a question. */
export const ADDRESS_REPLY =
  "Ask For The People does not read addresses, so this question was not sent to any AI model. To see the races on your 2026 ballot, enter your address on the Ballot page.";

/** The fixed answer to an address-like question, as the chunks of one UI message. */
export function addressReply(): UIMessageChunk[] {
  return [
    { type: "start" },
    { type: "text-start", id: "answer" },
    { type: "text-delta", id: "answer", delta: ADDRESS_REPLY },
    { type: "text-end", id: "answer" },
    { type: "finish" },
  ];
}

export interface AskToolTrace {
  toolName: string;
  input: unknown;
  /** The compact summary the model saw. */
  modelOutput: unknown;
}

export interface AskOutcome {
  /** The text the voter sees, after the guardrail. */
  text: string;
  /** The model's own text before the guardrail. */
  rawText: string;
  guard: AskGuardResult;
  tools: AskToolTrace[];
  usage: LanguageModelUsage | null;
  /** What the provider reported the run cost; null when it reported nothing (a failed run). */
  costUsd: number | null;
  /** Every chunk sent to the page, for the answer cache. */
  chunks: UIMessageChunk[];
  latencyMs: number;
  failed: boolean;
}

export interface AskRun {
  stream: ReadableStream<UIMessageChunk>;
  outcome: Promise<AskOutcome>;
}

export function runAsk(input: { turns: AskTurn[]; context: AskContext; model: AskModel }): AskRun {
  const started = performance.now();
  const budget = new ToolBudget();
  const tools = createAskTools(input.context, budget);
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
        content: ASK_SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "system", content: requestContext(input.context) },
    ],
    messages,
    tools,
    stopWhen: stepCountIs(ASK_STEP_LIMIT),
    maxOutputTokens: ASK_MAX_OUTPUT_TOKENS,
    temperature: 0,
    timeout: { totalMs: ASK_TIMEOUT_MS },
    // One tool call per step, so a step adds at most one result (or one budget note) to the prompt.
    providerOptions: { anthropic: { disableParallelToolUse: true } },
  });
  const metadata: AskMetadata = { demo: input.model.demo };
  const source = result.toUIMessageStream({
    sendReasoning: false,
    messageMetadata: ({ part }) => (part.type === "start" ? metadata : undefined),
    onError: () => ERROR_TEXT,
  });

  let settle: (outcome: AskOutcome) => void = () => undefined;
  const outcome = new Promise<AskOutcome>((resolve) => {
    settle = resolve;
  });

  const stream = new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const chunks: UIMessageChunk[] = [];
      let open = true;
      const emit = (chunk: UIMessageChunk) => {
        chunks.push(chunk);
        if (!open) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // The voter closed the page. Keep reading so the answer is still metered and cached.
          open = false;
        }
      };
      const traces = new Map<string, AskToolTrace>();
      // The answer is the text of the step that ended without calling a tool. Text written in a step
      // that goes on to call a tool ("Let me look that up.") is a preamble, and is dropped.
      let rawText = "";
      let stepText = "";
      let stepCalledTool = false;
      let guard = guardAnswer({ text: "", toolOutputs: [] });
      let failed = false;
      try {
        for await (const chunk of source) {
          switch (chunk.type) {
            case "text-start":
            case "text-end":
              continue;
            case "text-delta":
              stepText += chunk.delta;
              continue;
            case "start-step":
              stepText = "";
              stepCalledTool = false;
              break;
            case "finish-step":
              if (!stepCalledTool) rawText = stepText;
              break;
            case "tool-input-start":
            case "tool-input-error":
              stepCalledTool = true;
              break;
            case "tool-input-available":
              stepCalledTool = true;
              traces.set(chunk.toolCallId, {
                toolName: chunk.toolName,
                input: chunk.input,
                modelOutput: null,
              });
              break;
            case "tool-output-available": {
              const trace = traces.get(chunk.toolCallId);
              if (trace) trace.modelOutput = budget.modelOutput(chunk.toolCallId);
              break;
            }
            case "error":
              failed = true;
              break;
            case "finish":
              guard = guardAnswer({
                text: rawText,
                toolOutputs: [...traces.values()].map((trace) => trace.modelOutput),
              });
              if (!failed) {
                emit({ type: "text-start", id: "answer" });
                emit({ type: "text-delta", id: "answer", delta: guard.text });
                emit({ type: "text-end", id: "answer" });
              }
              break;
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
        text: guard.text,
        rawText,
        guard,
        tools: [...traces.values()],
        usage,
        // OpenRouter reports what each step cost; otherwise the usage is priced from the table.
        costUsd: reportedCostUsd(steps) ?? (usage ? costUsd(usage, input.model.modelId) : null),
        chunks,
        latencyMs: Math.round(performance.now() - started),
        failed,
      });
    },
  });
  return { stream, outcome };
}

/** Replays a cached answer's chunks as a fresh stream. */
export function replayChunks(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
