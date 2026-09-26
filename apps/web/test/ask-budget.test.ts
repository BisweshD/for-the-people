import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { AskTurn, Source } from "@for-the-people/core";
import type { Db } from "@for-the-people/data";
import type { KeyVoteLibrary } from "@for-the-people/data/read/ask";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import {
  ASK_TOOL_BUDGET_BYTES,
  REPEAT_NOTE,
  TOOL_BUDGET_NOTE,
  ToolBudget,
} from "../src/server/ask/budget";
import {
  ASK_BASE_INPUT_TOKENS,
  ASK_MAX_OUTPUT_TOKENS,
  ASK_STEP_LIMIT,
  runAsk,
} from "../src/server/ask/engine";
import { reservationUsd } from "../src/server/ask/limits";
import { planStep } from "../src/server/ask/mock-model";
import { PRICES } from "../src/server/ask/model";
import { ASK_SYSTEM_PROMPT, requestContext } from "../src/server/ask/prompt";

/**
 * R2-M1: a run's cost is bounded by its spend reservation, however
 * many tool calls the model makes. The key-vote library is replaced with large synthetic cards so every
 * getKeyVotes result is big; nothing here calls a real model or reads the database.
 */

const CARD_COUNT = 24;

const source: Source = {
  id: "src_0000000000000001",
  publisher: "Office of the Clerk, U.S. House of Representatives",
  url: "https://clerk.house.gov/Votes/2025023",
  retrievedAt: "2026-09-01T00:00:00.000Z",
  contentHash: "0".repeat(64),
  notes: null,
};

function library(): KeyVoteLibrary {
  const cards = Array.from({ length: CARD_COUNT }, (_, index) => {
    const rollCallIds = [`house-119-1-${100 + index}`, `house-119-1-${200 + index}`];
    return {
      keyVote: {
        id: `kv-synthetic-${index}`,
        order: index,
        card: {
          title: `Synthetic key vote ${index}`,
          whatItDoes: `What this synthetic bill does, written out at length. `.repeat(12),
          context: "Context.",
          yeaMeans: "A Yea vote supports the bill.",
        },
        rollCallRefs: rollCallIds.map((rollCallId, refIndex) => ({
          rollCallId,
          yeaSupportsMeasure: true,
          decisive: refIndex === 0,
          verification: { status: "verified", checkedAt: "2026-09-01", notes: null },
        })),
        reviewers: [],
      },
      issueArea: { id: `issue-${index % 4}`, label: `Issue ${index % 4}`, icon: "scale" },
      measures: [],
      rollCalls: rollCallIds.map((id, refIndex) => ({
        id,
        chamber: "house",
        congress: 119,
        session: 1,
        number: refIndex === 0 ? 100 + index : 200 + index,
        date: "2025-03-01",
        question: "On Passage of the Bill",
        result: "Passed",
        requires: "1/2",
        title: null,
        totals: { yea: 218, nay: 214, present: 0, notVoting: 3 },
        tieBreaker: null,
        measureId: null,
        officialUrl: "https://clerk.house.gov/Votes/2025023",
        sourceId: source.id,
      })),
    };
  });
  return { cards, sources: new Map([[source.id, source]]) } as unknown as KeyVoteLibrary;
}

vi.mock("@for-the-people/data/read/ask", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@for-the-people/data/read/ask")>()),
  keyVoteLibrary: vi.fn(async () => library()),
}));

type Call = { toolName: string; input: Record<string, unknown> };

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");

/** Tool-result bytes in a prompt: what the model read from tools, as the provider would send it. */
const toolResultBytes = (prompt: LanguageModelV3Prompt) =>
  prompt
    .flatMap((message) => (message.role === "tool" ? message.content : []))
    .reduce((total, part) => total + (part.type === "tool-result" ? bytes(part.output) : 0), 0);

/**
 * A model that makes the calls it is scripted to make, then answers. It reports usage as bytes, which
 * bound tokens: every byte of the prompt and tool definitions as input, every byte it writes as output.
 */
function scriptedModel(steps: Call[][]) {
  const seen: LanguageModelV3CallOptions[] = [];
  const model = new MockLanguageModelV3({
    provider: "test",
    modelId: "scripted",
    doStream: async (options) => {
      seen.push(options);
      const step = options.prompt.filter((message) => message.role === "assistant").length;
      const calls = steps[step] ?? [];
      const input = bytes({ prompt: options.prompt, tools: options.tools });
      const parts: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
      let output = 0;
      calls.forEach((call, index) => {
        const json = JSON.stringify(call.input);
        output += bytes({ name: call.toolName, input: call.input });
        parts.push({
          type: "tool-call",
          toolCallId: `call_${step}_${index}`,
          toolName: call.toolName,
          input: json,
        });
      });
      const text = "The results below list the key votes.";
      if (calls.length === 0) {
        output += bytes(text);
        parts.push(
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
        );
      }
      parts.push({
        type: "finish",
        finishReason:
          calls.length > 0
            ? { unified: "tool-calls", raw: "tool_use" }
            : { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: output, text: output, reasoning: undefined },
        },
      });
      return { stream: simulateReadableStream({ chunks: parts }) };
    },
  });
  return { model, seen };
}

const SONNET = "claude-sonnet-5";
const turns: AskTurn[] = [{ role: "user", text: "List every key vote, thirty times over." }];

async function run(steps: Call[][]) {
  const { model, seen } = scriptedModel(steps);
  const ask = runAsk({
    turns,
    context: { db: {} as Db, today: "2026-09-24", districtIds: [], stances: null },
    model: { model, modelId: SONNET, demo: false },
  });
  const reader = ask.stream.getReader();
  const fullOutputs: unknown[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "tool-output-available") fullOutputs.push(value.output);
  }
  return { outcome: await ask.outcome, seen, fullOutputs };
}

// Thirty getKeyVotes calls over two steps: ten identical, twenty with different inputs (each of
// which, for an issue the library does not have, lists every key vote).
const thirtyCalls: Call[][] = [
  [
    ...Array.from({ length: 10 }, () => ({ toolName: "getKeyVotes", input: {} })),
    ...Array.from({ length: 5 }, (_, i) => ({
      toolName: "getKeyVotes",
      input: { issue: `topic ${i}` },
    })),
  ],
  Array.from({ length: 15 }, (_, i) => ({
    toolName: "getKeyVotes",
    input: { issue: `topic ${i + 5}` },
  })),
];

describe("a run that issues 30 getKeyVotes calls (R2-M1)", () => {
  test("stays within the tool budget and within its spend reservation", async () => {
    const { outcome, seen, fullOutputs } = await run(thirtyCalls);
    expect(outcome.failed).toBe(false);
    expect(outcome.tools).toHaveLength(30);
    expect(fullOutputs).toHaveLength(30);

    const summaries = outcome.tools.filter((tool) => !("note" in (tool.modelOutput as object)));
    expect(summaries.length).toBeGreaterThan(0);
    const summaryBytes = summaries.reduce((total, tool) => total + bytes(tool.modelOutput), 0);
    expect(summaryBytes).toBeLessThanOrEqual(ASK_TOOL_BUDGET_BYTES);
    // Without the budget, the 21 distinct calls alone would pass what five steps of budget cover.
    expect(bytes(summaries[0]!.modelOutput) * 21).toBeGreaterThan(
      ASK_STEP_LIMIT * ASK_TOOL_BUDGET_BYTES,
    );

    // Every later call got a note; the nine repeats of the first call point back to it.
    const notes = outcome.tools.map((tool) => (tool.modelOutput as { note?: string }).note);
    expect(notes.filter((note) => note === REPEAT_NOTE)).toHaveLength(9);
    expect(notes.filter((note) => note === TOOL_BUDGET_NOTE).length).toBeGreaterThan(0);

    // What the model actually read from tools in its last step is the budget plus short notes.
    const last = seen.at(-1)!;
    expect(toolResultBytes(last.prompt)).toBeLessThanOrEqual(
      ASK_TOOL_BUDGET_BYTES + 30 * bytes({ type: "json", value: { note: REPEAT_NOTE } }),
    );

    // The provider was told not to make parallel tool calls.
    for (const options of seen)
      expect(options.providerOptions?.anthropic?.disableParallelToolUse).toBe(true);

    // The whole run, priced as the most expensive model, costs less than it reserved.
    expect(outcome.costUsd).not.toBeNull();
    expect(outcome.costUsd!).toBeLessThanOrEqual(reservationUsd(SONNET, turns));
  });

  test("the numbers check reads what the model saw, not the page's full output", async () => {
    const { outcome } = await run(thirtyCalls);
    const noted = outcome.tools.find(
      (tool) => (tool.modelOutput as { note?: string }).note === TOOL_BUDGET_NOTE,
    );
    expect(noted).toBeDefined();
    expect(noted!.modelOutput).toEqual({ note: TOOL_BUDGET_NOTE });
  });

  test("the fixed part of every step fits in the base the reservation assumes", async () => {
    const { seen } = await run([[{ toolName: "getKeyVotes", input: {} }]]);
    const first = seen[0]!;
    const system = first.prompt.filter((message) => message.role === "system");
    const fixed = bytes(system) + bytes(first.tools);
    expect(bytes(system)).toBeGreaterThanOrEqual(Buffer.byteLength(ASK_SYSTEM_PROMPT, "utf8"));
    // Cache writes cost 1.25 times input; each earlier step's output is read again as input; with
    // parallel calls off, each step adds at most one note.
    const perStepOverhead =
      1.25 * fixed +
      ASK_STEP_LIMIT * ASK_MAX_OUTPUT_TOKENS +
      ASK_STEP_LIMIT * bytes({ note: TOOL_BUDGET_NOTE });
    expect(perStepOverhead).toBeLessThanOrEqual(ASK_BASE_INPUT_TOKENS);
  });
});

describe("ToolBudget", () => {
  test("runs identical calls once and refuses data past its limit", async () => {
    const budget = new ToolBudget(100);
    let runs = 0;
    const big = { text: "x".repeat(60) };
    const call = (id: string, input: unknown) =>
      budget.call(
        "getKeyVotes",
        input,
        id,
        (output: typeof big) => output,
        async () => {
          runs++;
          return big;
        },
      );
    await Promise.all([call("a", {}), call("b", {})]);
    await call("c", { issue: "trade" });
    expect(runs).toBe(2);
    expect(budget.modelOutput("a")).toEqual(big);
    expect(budget.modelOutput("b")).toEqual({ note: REPEAT_NOTE });
    expect(budget.modelOutput("c")).toEqual({ note: TOOL_BUDGET_NOTE });
    expect(budget.usedBytes).toBeLessThanOrEqual(100);
    // A repeat of a call the budget refused is refused too, never pointed at data the model lacks.
    await call("d", { issue: "trade" });
    expect(budget.modelOutput("d")).toEqual({ note: TOOL_BUDGET_NOTE });
    expect(budget.modelOutput("unknown")).toEqual({ note: TOOL_BUDGET_NOTE });
  });
});

describe("the reservation (R2-M1)", () => {
  test("is steps times (base + conversation + tool budget) in, and full output per step", () => {
    const price = PRICES[SONNET]!;
    const conversation = Buffer.byteLength(turns[0]!.text, "utf8");
    expect(reservationUsd(SONNET, turns)).toBeCloseTo(
      (ASK_STEP_LIMIT *
        ((ASK_BASE_INPUT_TOKENS + conversation + ASK_TOOL_BUDGET_BYTES) * price.input +
          ASK_MAX_OUTPUT_TOKENS * price.output)) /
        1_000_000,
      12,
    );
  });
});

describe("the voter's location in the prompt (R2-I1)", () => {
  test("the model is told a location is set, never the district ids", () => {
    const context = requestContext({ districtIds: ["ME-2@cd119", "ME-0@cd119"], stances: null });
    expect(context).not.toContain("ME-2");
    expect(context).not.toContain("cd119");
    expect(context).toMatch(/has set a location/);
    expect(context).toMatch(/myRepresentatives/);
    expect(requestContext({ districtIds: [], stances: null })).toMatch(/not set a location/);
  });

  test("the demo model asks myRepresentatives for the saved location without naming it", () => {
    expect(planStep({ kind: "my-representatives" }, [])).toEqual({
      calls: [{ toolName: "myRepresentatives", input: {} }],
    });
  });
});
