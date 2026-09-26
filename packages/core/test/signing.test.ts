import { describe, expect, test } from "vitest";
import {
  REVALIDATE_MIN_SECRET_LENGTH,
  revalidateSecret,
  signBody,
  verifySignedBody,
} from "../src/signing";

describe("the revalidation secret (round-1 L4)", () => {
  test("is used only when it is at least 32 characters", () => {
    expect(REVALIDATE_MIN_SECRET_LENGTH).toBe(32);
    expect(revalidateSecret(undefined)).toBeNull();
    expect(revalidateSecret("")).toBeNull();
    expect(revalidateSecret("test-secret")).toBeNull();
    expect(revalidateSecret("x".repeat(31))).toBeNull();
    expect(revalidateSecret("x".repeat(32))).toBe("x".repeat(32));
  });
});

const SECRET = "test-secret";
const now = Date.parse("2026-09-23T12:00:00Z");
const body = JSON.stringify({ tags: ["key-votes"], at: "2026-09-23T11:59:00Z" });

describe("signed revalidation", () => {
  test("accepts a fresh, correctly signed body", async () => {
    const result = await verifySignedBody(SECRET, body, await signBody(SECRET, body), now);
    expect(result).toEqual({
      ok: true,
      request: { tags: ["key-votes"], at: "2026-09-23T11:59:00Z" },
    });
  });
  test("rejects a missing or wrong signature and a tampered body", async () => {
    expect((await verifySignedBody(SECRET, body, null, now)).ok).toBe(false);
    expect((await verifySignedBody(SECRET, body, await signBody("other", body), now)).ok).toBe(
      false,
    );
    const signature = await signBody(SECRET, body);
    expect(
      (await verifySignedBody(SECRET, body.replace("key-votes", "members"), signature, now)).ok,
    ).toBe(false);
  });
  test("rejects a replay older than five minutes", async () => {
    const old = JSON.stringify({ tags: ["key-votes"], at: "2026-09-23T11:50:00Z" });
    const result = await verifySignedBody(SECRET, old, await signBody(SECRET, old), now);
    expect(result).toEqual({ ok: false, reason: "stale request" });
  });
});
