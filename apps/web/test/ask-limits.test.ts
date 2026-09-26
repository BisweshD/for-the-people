import { ASK_LIMITS, type AskTurn } from "@for-the-people/core";
import { openMemoryDb, type OpenDb } from "@for-the-people/data";
import { spendOn } from "@for-the-people/data/runtime/spend";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { ASK_TOOL_BUDGET_BYTES } from "../src/server/ask/budget";
import {
  ASK_BASE_INPUT_TOKENS,
  ASK_MAX_OUTPUT_TOKENS,
  ASK_STEP_LIMIT,
} from "../src/server/ask/engine";
import {
  DAILY_SPEND_CAP_USD,
  reservationUsd,
  reserveSpend,
  settledCostUsd,
  settleSpend,
} from "../src/server/ask/limits";
import { DEFAULT_MODEL, getAskModel, PRICES, usesDemoModel } from "../src/server/ask/model";
import { MOCK_MODEL_ID } from "../src/server/ask/mock-model";

/** The $20/day cap and the paid-model gate. */

const SALT = "a-shared-salt-of-16+";

describe("getAskModel in production (H1)", () => {
  const production = { NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-test" };

  test("never returns the paid model without a shared database, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = getAskModel("default", { ...production, IP_HASH_SALT: SALT });
    const second = getAskModel("complex", { ...production, IP_HASH_SALT: SALT });
    expect([first.demo, first.modelId, second.demo]).toEqual([true, MOCK_MODEL_ID, true]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/DATABASE_URL/);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("sk-test");
    warn.mockRestore();
  });

  test("requires an IP_HASH_SALT of at least 16 characters", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const withDb = { ...production, DATABASE_URL: "postgres://db.example/for-the-people" };
    expect(getAskModel("default", withDb).demo).toBe(true);
    expect(getAskModel("default", { ...withDb, IP_HASH_SALT: "short" }).demo).toBe(true);
    expect(usesDemoModel({ ...withDb, IP_HASH_SALT: "short" })).toBe(true);
    const paid = getAskModel("default", { ...withDb, IP_HASH_SALT: SALT });
    expect([paid.demo, paid.modelId]).toEqual([false, DEFAULT_MODEL]);
    expect(usesDemoModel({ ...withDb, IP_HASH_SALT: SALT })).toBe(false);
    warn.mockRestore();
  });

  test("local development keeps working on the in-memory database", () => {
    const dev = getAskModel("default", { NODE_ENV: "development", ANTHROPIC_API_KEY: "sk-test" });
    expect(dev.demo).toBe(false);
    expect(getAskModel("default", { NODE_ENV: "development" }).demo).toBe(true);
  });

  test("an unpriced model id falls back to the default instead of slipping the cap", () => {
    const model = getAskModel("default", {
      NODE_ENV: "development",
      ANTHROPIC_API_KEY: "sk-test",
      ASK_MODEL: "claude-opus-9-unpriced",
    });
    expect(model.modelId).toBe(DEFAULT_MODEL);
    expect(model.modelId in PRICES).toBe(true);
  });
});

const turn = (text: string, role: AskTurn["role"] = "user"): AskTurn => ({ role, text });

describe("the spend reservation (M3)", () => {
  const sonnet = "claude-sonnet-5";
  const price = PRICES[sonnet]!;
  // Every step also reads up to the whole tool budget (R2-M1).
  const perStep = (inputTokens: number) =>
    ((inputTokens + ASK_TOOL_BUDGET_BYTES) * price.input + ASK_MAX_OUTPUT_TOKENS * price.output) /
    1_000_000;

  test("is priced from the real conversation, byte for byte", () => {
    const small = reservationUsd(sonnet, [turn("How did Cruz vote?")]);
    expect(small).toBeCloseTo(ASK_STEP_LIMIT * perStep(ASK_BASE_INPUT_TOKENS + 18), 12);
    const history = [turn("é".repeat(1000)), turn("a".repeat(500), "assistant"), turn("And Cruz?")];
    expect(reservationUsd(sonnet, history)).toBeCloseTo(
      ASK_STEP_LIMIT * perStep(ASK_BASE_INPUT_TOKENS + 2000 + 500 + 9),
      12,
    );
    expect(reservationUsd(sonnet, history)).toBeGreaterThan(small);
  });

  test("covers the largest conversation the request schema allows", () => {
    // Four UTF-8 bytes per character is the most any character takes.
    const largest = [turn("\u{1F5F3}".repeat(ASK_LIMITS.maxHistoryChars / 2))];
    expect(largest[0]!.text.length).toBe(ASK_LIMITS.maxHistoryChars);
    expect(reservationUsd(sonnet, largest)).toBeCloseTo(
      ASK_STEP_LIMIT * perStep(ASK_BASE_INPUT_TOKENS + (4 * ASK_LIMITS.maxHistoryChars) / 2),
      12,
    );
  });

  test("a failed run keeps its reservation; a finished one settles to what it cost", () => {
    const reservation = { day: "2026-09-24", reservedUsd: 0.23 };
    expect(settledCostUsd({ failed: true, costUsd: null }, reservation)).toBe(0.23);
    expect(settledCostUsd({ failed: true, costUsd: 0.01 }, reservation)).toBe(0.23);
    expect(settledCostUsd({ failed: false, costUsd: null }, reservation)).toBe(0.23);
    expect(settledCostUsd({ failed: false, costUsd: 0.04 }, reservation)).toBe(0.04);
  });
});

describe("reserveSpend and settleSpend against Postgres", () => {
  let open: OpenDb;
  beforeAll(async () => {
    open = await openMemoryDb({ migrate: true });
  });
  afterAll(async () => {
    await open.close();
  });

  test("a failed run is never recorded as $0", async () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const turns = [turn("How did Cruz vote?")];
    const reservation = (await reserveSpend(open.db, "claude-sonnet-5", turns, now))!;
    expect(reservation.reservedUsd).toBeGreaterThan(0);
    await settleSpend(
      open.db,
      reservation,
      settledCostUsd({ failed: true, costUsd: null }, reservation),
    );
    // The table stores dollars to four decimal places.
    expect(await spendOn(open.db, reservation.day)).toBeCloseTo(reservation.reservedUsd, 3);
  });

  test("refuses a request that would pass the cap", async () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const turns = [turn("x".repeat(ASK_LIMITS.maxHistoryChars))];
    let reserved = 0;
    while ((await reserveSpend(open.db, "claude-sonnet-5", turns, now)) !== null) reserved++;
    expect(reserved).toBeGreaterThan(0);
    expect(await spendOn(open.db, "2026-09-25")).toBeLessThanOrEqual(DAILY_SPEND_CAP_USD);
  });
});
