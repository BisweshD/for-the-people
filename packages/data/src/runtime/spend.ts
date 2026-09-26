import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiSpend } from "../db/schema";

/**
 * Runtime bookkeeping for the Anthropic spend cap: one row per UTC day with
 * the dollars spent and the number of requests. Not a civic fact.
 */

export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Adds to a day's spend (a negative amount releases a reservation) and returns the day's new total.
 * One upsert, so concurrent requests cannot lose each other's updates.
 */
export async function addSpend(
  db: Db,
  day: string,
  usd: number,
  requests: number,
): Promise<number> {
  const [row] = await db
    .insert(aiSpend)
    .values({ day, usd, requests })
    .onConflictDoUpdate({
      target: aiSpend.day,
      set: {
        usd: sql`${aiSpend.usd} + ${usd}`,
        requests: sql`${aiSpend.requests} + ${requests}`,
      },
    })
    .returning({ usd: aiSpend.usd });
  return Number(row?.usd ?? usd);
}

export async function spendOn(db: Db, day: string): Promise<number> {
  const [row] = await db.select({ usd: aiSpend.usd }).from(aiSpend).where(eq(aiSpend.day, day));
  return Number(row?.usd ?? 0);
}
