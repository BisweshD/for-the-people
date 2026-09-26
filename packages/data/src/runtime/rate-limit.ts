import { createHash, randomBytes } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { rateLimits } from "../db/schema";

/**
 * Runtime bookkeeping for abuse limits, not civic facts. Keys are salted hashes (never an IP address),
 * and each window is one row whose count is bumped by a single upsert. Two shapes share the table:
 * named windows (Ask: per minute and per day) and windows in seconds (corrections: per 10 minutes).
 */

export type RateWindow = "minute" | "day";

export interface RateLimit {
  window: RateWindow;
  max: number;
}

/** Ask For The People: 10 questions a minute and 50 a day per visitor. */
export const ASK_RATE_LIMITS: readonly RateLimit[] = [
  { window: "minute", max: 10 },
  { window: "day", max: 50 },
];

const WINDOW_MS: Record<RateWindow, number> = { minute: 60_000, day: 86_400_000 };

/** The start of the fixed window that contains `now` (UTC). */
export function windowStart(now: Date, window: RateWindow): Date {
  const size = WINDOW_MS[window];
  return new Date(Math.floor(now.getTime() / size) * size);
}

/** Adds one hit to a key's window and returns the window's new count. One upsert. */
export async function incrementRateWindow(db: Db, key: string, start: Date): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: start.toISOString(), count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  return row?.count ?? 1;
}

/** Deletes windows that ended before `before`. */
export async function pruneRateWindows(db: Db, before: Date): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, before.toISOString()));
}

export type RateDecision =
  { ok: true } | { ok: false; window: RateWindow; retryAfterSeconds: number };

/**
 * Counts one request against every limit for `key` and decides whether it may proceed.
 * The first request of a day also prunes windows older than two days.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  now: Date,
  limits: readonly RateLimit[] = ASK_RATE_LIMITS,
): Promise<RateDecision> {
  let decision: RateDecision = { ok: true };
  for (const limit of limits) {
    const start = windowStart(now, limit.window);
    const count = await incrementRateWindow(db, `${limit.window}:${key}`, start);
    if (limit.window === "day" && count === 1) {
      await pruneRateWindows(db, new Date(start.getTime() - 2 * WINDOW_MS.day));
    }
    if (count > limit.max && decision.ok) {
      const end = start.getTime() + WINDOW_MS[limit.window];
      decision = {
        ok: false,
        window: limit.window,
        retryAfterSeconds: Math.max(1, Math.ceil((end - now.getTime()) / 1000)),
      };
    }
  }
  return decision;
}

/** A limit over a window given in seconds, for example 600 for "per 10 minutes". */
export interface SecondsRateLimit {
  /** Window length in seconds, for example 600 for "per 10 minutes". */
  windowSeconds: number;
  /** Requests allowed in one window. */
  max: number;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

// Without a configured salt each server process draws its own, so hashes never match a raw IP list.
let processSalt: string | null = null;

/** The salt for hashing request identifiers: IP_HASH_SALT when set, else a random per-process value. */
export function hashSalt(): string {
  const configured = process.env.IP_HASH_SALT;
  if (configured && configured.length >= 16) return configured;
  processSalt ??= randomBytes(32).toString("hex");
  return processSalt;
}

/**
 * The rate-limit key for one scope ("location", "ask", "corrections") and one caller address: the scope
 * in the clear, then a salted hash, so no address is ever stored.
 */
export function rateLimitKey(scope: string, clientAddress: string, salt = hashSalt()): string {
  return `${scope}:${saltedHash(`${scope}
${clientAddress}`, salt)}`;
}

/** A salted SHA-256 of an identifier (an IP address), shortened to 32 hex characters. */
export function saltedHash(value: string, salt = hashSalt()): string {
  return createHash("sha256").update(`${salt}\n${value}`).digest("hex").slice(0, 32);
}

const secondsWindowStart = (now: Date, windowSeconds: number): Date => {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / size) * size);
};

/**
 * Counts one request against every limit and reports whether all of them still allow it.
 * `key` should already be namespaced and hashed, for example `corrections:<saltedHash>`.
 * A request that is refused still counts, so hammering the endpoint does not reset the window.
 */
export async function checkRateLimit(
  db: Db,
  key: string,
  limits: readonly SecondsRateLimit[],
  now = new Date(),
): Promise<RateLimitResult> {
  let retryAfterSeconds = 0;
  for (const limit of limits) {
    const start = secondsWindowStart(now, limit.windowSeconds);
    const [row] = await db
      .insert(rateLimits)
      .values({ key: `${key}:${limit.windowSeconds}`, windowStart: start.toISOString(), count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    if ((row?.count ?? 1) > limit.max) {
      const reset = start.getTime() + limit.windowSeconds * 1000;
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((reset - now.getTime()) / 1000));
    }
  }
  return retryAfterSeconds > 0 ? { ok: false, retryAfterSeconds } : { ok: true };
}
