import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openMemoryDb, type OpenDb } from "../src/db/client";
import { rateLimits } from "../src/db/schema";
import { getAskCache, putAskCache } from "../src/runtime/ask-cache";
import { consumeRateLimit, windowStart } from "../src/runtime/rate-limit";
import { addSpend, spendOn } from "../src/runtime/spend";

/** Ask For The People's runtime bookkeeping against a real (in-memory) Postgres with the real migrations. */

let open: OpenDb;

beforeAll(async () => {
  open = await openMemoryDb();
});

afterAll(async () => {
  await open.close();
});

const at = (iso: string) => new Date(iso);

describe("consumeRateLimit", () => {
  test("allows 10 a minute, then refuses until the next minute", async () => {
    const key = "visitor-a";
    const now = at("2026-09-23T12:00:05Z");
    for (let i = 0; i < 10; i++) {
      expect(await consumeRateLimit(open.db, key, now)).toEqual({ ok: true });
    }
    const refused = await consumeRateLimit(open.db, key, at("2026-09-23T12:00:50Z"));
    expect(refused).toEqual({ ok: false, window: "minute", retryAfterSeconds: 10 });
    expect(await consumeRateLimit(open.db, key, at("2026-09-23T12:01:00Z"))).toEqual({ ok: true });
  });

  test("allows 50 a day across minutes, then refuses until midnight UTC", async () => {
    const key = "visitor-b";
    for (let i = 0; i < 50; i++) {
      const minute = String(Math.floor(i / 5)).padStart(2, "0");
      expect(await consumeRateLimit(open.db, key, at(`2026-09-23T13:${minute}:00Z`))).toEqual({
        ok: true,
      });
    }
    const refused = await consumeRateLimit(open.db, key, at("2026-09-23T23:59:00Z"));
    expect(refused).toEqual({ ok: false, window: "day", retryAfterSeconds: 60 });
    expect(await consumeRateLimit(open.db, key, at("2026-09-24T00:00:01Z"))).toEqual({ ok: true });
  });

  test("keys are independent", async () => {
    const now = at("2026-09-23T14:00:00Z");
    for (let i = 0; i < 11; i++) await consumeRateLimit(open.db, "visitor-c", now);
    expect(await consumeRateLimit(open.db, "visitor-d", now)).toEqual({ ok: true });
  });

  test("the first request of a day prunes windows older than two days", async () => {
    await consumeRateLimit(open.db, "visitor-old", at("2026-09-01T09:00:00Z"));
    await consumeRateLimit(open.db, "visitor-e", at("2026-09-30T09:00:00Z"));
    const keys = (await open.db.select({ key: rateLimits.key }).from(rateLimits)).map(
      (row) => row.key,
    );
    expect(keys.some((key) => key.endsWith("visitor-old"))).toBe(false);
    expect(keys.some((key) => key.endsWith("visitor-e"))).toBe(true);
  });

  test("stores only the key it is given, never anything else about the visitor", async () => {
    const columns = Object.keys((await open.db.select().from(rateLimits).limit(1))[0] ?? {});
    expect(columns.sort()).toEqual(["count", "key", "windowStart"]);
  });

  test("windows are fixed UTC minutes and days", () => {
    const now = at("2026-09-23T12:34:56.789Z");
    expect(windowStart(now, "minute").toISOString()).toBe("2026-09-23T12:34:00.000Z");
    expect(windowStart(now, "day").toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });
});

describe("spend and cache", () => {
  test("addSpend accumulates atomically and releases reservations", async () => {
    const day = "2026-09-23";
    await Promise.all(Array.from({ length: 20 }, () => addSpend(open.db, day, 0.5, 1)));
    expect(await spendOn(open.db, day)).toBeCloseTo(10, 4);
    expect(await addSpend(open.db, day, -0.5, -1)).toBeCloseTo(9.5, 4);
    expect(await spendOn(open.db, "2026-09-24")).toBe(0);
  });

  test("ask cache hits only for the same data version within an hour", async () => {
    const createdAt = "2026-09-23T12:00:00.000Z";
    await putAskCache(open.db, {
      key: "k1",
      dataVersion: "v1",
      response: [{ type: "start" }],
      createdAt,
    });
    expect(await getAskCache(open.db, "k1", "v1", at("2026-09-23T12:59:00Z"))).toEqual([
      { type: "start" },
    ]);
    expect(await getAskCache(open.db, "k1", "v2", at("2026-09-23T12:10:00Z"))).toBeNull();
    expect(await getAskCache(open.db, "k1", "v1", at("2026-09-23T13:00:01Z"))).toBeNull();
    await putAskCache(open.db, {
      key: "k1",
      dataVersion: "v2",
      response: [{ type: "finish" }],
      createdAt: "2026-09-23T14:00:00.000Z",
    });
    expect(await getAskCache(open.db, "k1", "v2", at("2026-09-23T14:30:00Z"))).toEqual([
      { type: "finish" },
    ]);
  });
});
