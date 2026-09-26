import { SourceId } from "@for-the-people/core";
import { isMethodReceipt, METHOD_RECEIPTS } from "@/lib/methods";
import { getStateListSource } from "@/server/ballot";
import { getSources } from "@/server/data";
import { getElectionSource } from "@/server/trust";

/** Resolves a data-receipt-id: an official Source, or a published method for derived numbers. */
export async function GET(_request: Request, context: RouteContext<"/api/receipts/[id]">) {
  const { id } = await context.params;
  if (isMethodReceipt(id)) {
    const method = METHOD_RECEIPTS[id];
    return Response.json({
      id,
      kind: "method",
      title: method.title,
      summary: method.summary,
      href: `/methodology#${method.anchor}`,
    });
  }
  if (!SourceId.safeParse(id).success)
    return Response.json({ error: "Unknown receipt id" }, { status: 404 });
  // Election key dates (data/election-dates.json) and state Senate candidate lists
  // (data/candidates-2026-senate.json) keep their Receipts in those files, not the database.
  const [stored] = await getSources([id]);
  const source = stored ?? (await getElectionSource(id)) ?? (await getStateListSource(id));
  if (!source) return Response.json({ error: "No receipt with that id" }, { status: 404 });
  return Response.json({
    id: source.id,
    kind: "source",
    publisher: source.publisher,
    url: source.url,
    retrievedAt: source.retrievedAt,
    contentHash: source.contentHash,
  });
}
