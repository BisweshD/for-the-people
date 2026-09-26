import { fetchRaw } from "../ingest/fetch";
import { houseRollUrl, senateVoteMenuUrl, senateVoteUrl } from "../ingest/sources";
import { parseSenateVoteMenu } from "../ingest/parsers/senate-menu";
import { rawCacheDir } from "../env";

/** Downloads every 119th-Congress roll call into the raw cache. Safe to rerun: cached files are reused. */
async function prefetchHouse(year: number): Promise<number> {
  let count = 0;
  for (let roll = 1; ; roll++) {
    const response = await fetchRaw(houseRollUrl(year, roll), { cacheDir: rawCacheDir(), acceptStatuses: [404] });
    if (response.status === 404) break;
    count = roll;
  }
  return count;
}

async function prefetchSenate(session: 1 | 2): Promise<number> {
  const menu = await fetchRaw(senateVoteMenuUrl(119, session), {
    cacheDir: rawCacheDir(),
    maxAgeMs: 6 * 60 * 60 * 1000,
  });
  const votes = parseSenateVoteMenu(menu.body.toString("utf8"));
  for (const vote of votes) {
    await fetchRaw(senateVoteUrl(119, session, vote.number), { cacheDir: rawCacheDir() });
  }
  return votes.length;
}

const [house2025, house2026, senate1, senate2] = await Promise.all([
  prefetchHouse(2025),
  prefetchHouse(2026),
  prefetchSenate(1),
  prefetchSenate(2),
]);
console.log(JSON.stringify({ house2025, house2026, senate1, senate2 }));
