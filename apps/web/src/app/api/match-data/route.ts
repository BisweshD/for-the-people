import { getKeyVoteRecord, getMemberIndex } from "@/server/data";

/**
 * Public data Home needs to show a returning voter's closest match: serving members and their
 * positions on the key-vote roll calls. The voter's answers never come here; matching runs on the
 * device (lib/matching.ts). Prerendered from cached data; Home fetches it only once a voter has
 * enough answers to show a match.
 */
export async function GET() {
  const [record, members] = await Promise.all([getKeyVoteRecord(), getMemberIndex()]);
  const serving = members.filter((member) => member.serving);
  const positions = Object.fromEntries(
    serving.flatMap((member) => {
      const codes = record.positions[member.id];
      return codes ? [[member.id, codes]] : [];
    }),
  );
  return Response.json(
    { record: { rollCallIds: record.rollCallIds, positions }, members: serving },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
