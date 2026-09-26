import { getDb } from "@for-the-people/data";
import { searchSource } from "@for-the-people/data/read/search";
import { cacheLife, cacheTag } from "next/cache";
import { toSearchIndex, type SearchIndex } from "@/lib/search-index";
import { TAGS } from "@/server/data";

/** Cached reads for the ⌘K palette. */

export const SEARCH_TAG = "search-index";

export async function getSearchIndex(): Promise<SearchIndex> {
  "use cache";
  cacheLife("days");
  cacheTag(SEARCH_TAG, TAGS.members, TAGS.keyVotes);
  const today = new Date().toISOString().slice(0, 10);
  return toSearchIndex(await searchSource(await getDb(), today));
}
