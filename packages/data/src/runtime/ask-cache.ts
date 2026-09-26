import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { askCache } from "../db/schema";

/**
 * Runtime cache of Ask For The People answers. The key is a hash of the normalized question and the data
 * version; the question text itself is never stored. Not a civic fact.
 */

export const ASK_CACHE_TTL_MS = 60 * 60 * 1000;

export interface AskCacheEntry {
  key: string;
  dataVersion: string;
  response: unknown;
  createdAt: string;
}

/** Stores an answer under its key. One upsert. */
export async function putAskCache(db: Db, entry: AskCacheEntry): Promise<void> {
  await db
    .insert(askCache)
    .values(entry)
    .onConflictDoUpdate({
      target: askCache.key,
      set: { dataVersion: entry.dataVersion, response: entry.response, createdAt: entry.createdAt },
    });
}

/** A cached answer for this key and data version that is younger than one hour, or null. */
export async function getAskCache(
  db: Db,
  key: string,
  dataVersion: string,
  now: Date,
): Promise<unknown> {
  const [row] = await db.select().from(askCache).where(eq(askCache.key, key));
  if (!row || row.dataVersion !== dataVersion) return null;
  if (now.getTime() - new Date(row.createdAt).getTime() > ASK_CACHE_TTL_MS) return null;
  return row.response;
}
