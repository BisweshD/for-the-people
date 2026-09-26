import type { JSONValue } from "ai";

/**
 * The per-run tool budget for Ask For The People. The model reads each
 * tool's compact summary; the budget counts those summaries' bytes across one run, and past the limit
 * every tool gives the model a short note instead of data. Identical calls (same tool, same input) run
 * once per run, and a repeat gives the model a note pointing to the earlier result. The page still gets
 * every tool's full output, so its cards and receipts are unchanged.
 *
 * Bytes bound tokens (a byte-level tokenizer never makes more tokens than bytes), so the spend
 * reservation can price the budget as this many input tokens per step (limits.ts).
 */

export const ASK_TOOL_BUDGET_BYTES = 40_000;

export const TOOL_BUDGET_NOTE = "Tool budget reached; answer from the results you have.";
export const REPEAT_NOTE = "Same as an earlier result in this answer; use that one.";

const byteLength = (value: JSONValue): number =>
  Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");

export class ToolBudget {
  private dataBytes = 0;
  private noteBytes = 0;
  private readonly runs = new Map<string, { output: Promise<unknown>; toolCallId: string }>();
  private readonly seen = new Map<string, JSONValue>();

  constructor(readonly limitBytes: number = ASK_TOOL_BUDGET_BYTES) {}

  /** Bytes of tool data the model has read this run: never more than the limit. */
  get usedBytes(): number {
    return this.dataBytes;
  }

  /** Everything the model has read from tools this run, notes included. */
  get modelBytes(): number {
    return this.dataBytes + this.noteBytes;
  }

  /**
   * Runs one tool call (once per distinct input) and decides what the model will read for it: the
   * compact summary while it fits the budget, otherwise a note. Returns the full output for the page.
   */
  async call<T>(
    toolName: string,
    input: unknown,
    toolCallId: string,
    summarize: (output: T) => JSONValue,
    run: () => Promise<T>,
  ): Promise<T> {
    const key = `${toolName}\u0000${JSON.stringify(input) ?? ""}`;
    const earlier = this.runs.get(key);
    const pending = earlier?.output ?? run();
    if (!earlier) this.runs.set(key, { output: pending, toolCallId });
    const output = (await pending) as T;
    if (earlier) {
      // The model already has this result, unless the budget turned the earlier call away too.
      const first = this.seen.get(earlier.toolCallId);
      this.note(toolCallId, first !== undefined && !isNote(first) ? REPEAT_NOTE : TOOL_BUDGET_NOTE);
      return output;
    }
    const summary = summarize(output);
    const bytes = byteLength(summary);
    if (this.dataBytes + bytes <= this.limitBytes) {
      this.dataBytes += bytes;
      this.seen.set(toolCallId, summary);
    } else {
      this.note(toolCallId, TOOL_BUDGET_NOTE);
    }
    return output;
  }

  /** What the model reads for a tool call. A call the budget never saw gets the budget note. */
  modelOutput(toolCallId: string): JSONValue {
    return this.seen.get(toolCallId) ?? { note: TOOL_BUDGET_NOTE };
  }

  private note(toolCallId: string, note: string): void {
    const value = { note };
    this.noteBytes += byteLength(value);
    this.seen.set(toolCallId, value);
  }
}

const isNote = (value: JSONValue): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  (value.note === TOOL_BUDGET_NOTE || value.note === REPEAT_NOTE);
