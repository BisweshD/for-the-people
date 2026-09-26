import { getDb } from "@for-the-people/data";
import { moneyFor } from "@for-the-people/data/read/money";
import { cacheLife, cacheTag } from "next/cache";
import { TAGS } from "@/server/data";

export async function getMoney(personId: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TAGS.person(personId), "money");
  return moneyFor(await getDb(), personId);
}
