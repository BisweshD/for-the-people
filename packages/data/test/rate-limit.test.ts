import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openMemoryDb, type OpenDb } from "../src/db/client";
import { rateLimits } from "../src/db/schema";
import { checkRateLimit, rateLimitKey } from "../src/runtime/rate-limit";

/** Fixed-window limits in a real (in-memory) Postgres with the real migrations. */

let open: OpenDb;
beforeAll(async () => {
  open = await openMemoryDb({ migrate: true });
});
afterAll(async () => {
  await open.close();
});

const LIMITS = [
  { windowSeconds: 60, max: 3 },
  { windowSeconds: 86_400, max: 5 },
];

describe("checkRateLimit", () => {
  test("allows up to the limit in a window, then says when to retry", async () => {
    const key = rateLimitKey("location", "203.0.113.7", "salt");
    const at = new Date("2026-09-23T16:00:10Z");
    for (let i = 0; i < 3; i++)
      expect(await checkRateLimit(open.db, key, LIMITS, at)).toEqual({ ok: true });
    expect(await checkRateLimit(open.db, key, LIMITS, at)).toEqual({
      ok: false,
      retryAfterSeconds: 50,
    });
    const nextMinute = new Date("2026-09-23T16:01:05Z");
    expect(await checkRateLimit(open.db, key, LIMITS, nextMinute)).toEqual({ ok: true });
    const blocked = await checkRateLimit(open.db, key, LIMITS, nextMinute);
    expect(blocked.ok).toBe(false);
  });

  test("keys are salted hashes: no address is stored, and callers are kept apart", async () => {
    const a = rateLimitKey("location", "203.0.113.7", "salt");
    expect(a).toMatch(/^location:[0-9a-f]{32}$/);
    expect(a).not.toContain("203.0.113.7");
    expect(rateLimitKey("location", "203.0.113.7", "other salt")).not.toBe(a);
    expect(rateLimitKey("ask", "203.0.113.7", "salt")).not.toBe(a);
    const rows = await open.db.select().from(rateLimits);
    expect(rows.every((row) => !row.key.includes("203.0.113"))).toBe(true);
    const other = rateLimitKey("location", "198.51.100.2", "salt");
    expect(await checkRateLimit(open.db, other, LIMITS, new Date("2026-09-23T16:00:10Z"))).toEqual({
      ok: true,
    });
  });
});
