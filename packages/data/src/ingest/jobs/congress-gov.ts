import { MeasureType, parseMeasureId, type Measure, type MeasureId } from "@for-the-people/core";
import * as z from "zod";
import type { IngestContext } from "../context";
import { htmlToText } from "../parsers/billstatus";

/** Congress.gov API v3, used when GovInfo has no BILLSTATUS file yet. Requires CONGRESS_API_KEY. */

const API = "https://api.congress.gov/v3";

const billSchema = z.object({
  bill: z.object({
    congress: z.number(),
    type: z.string(),
    number: z.union([z.string(), z.number()]).transform(Number),
    title: z.string(),
    introducedDate: z.string().optional(),
    sponsors: z.array(z.object({ bioguideId: z.string() })).optional(),
    latestAction: z.object({ actionDate: z.string(), text: z.string() }),
    laws: z.array(z.object({ type: z.string() })).optional(),
  }),
});

const summariesSchema = z.object({
  summaries: z.array(
    z.object({
      actionDate: z.string(),
      actionDesc: z.string().optional(),
      text: z.string(),
      updateDate: z.string(),
    }),
  ),
});

export function congressApiUrl(path: string, key: string): string {
  return `${API}${path}${path.includes("?") ? "&" : "?"}format=json&api_key=${encodeURIComponent(key)}`;
}

export async function fetchCongressGovMeasure(
  context: IngestContext,
  id: MeasureId,
  knownPeople: ReadonlySet<string>,
): Promise<Measure | null> {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) return null;
  const { congress, type, number } = parseMeasureId(id);
  const billUrl = congressApiUrl(`/bill/${congress}/${type}/${number}`, key);
  const raw = await context.fetch(billUrl, {
    acceptStatuses: [404],
    maxAgeMs: 24 * 60 * 60 * 1000,
  });
  if (raw.status !== 200) return null;
  const { source } = await context.fetchWithSource(billUrl, { maxAgeMs: 24 * 60 * 60 * 1000 });
  const { bill } = billSchema.parse(JSON.parse(raw.body.toString("utf8")));

  const summariesUrl = congressApiUrl(`/bill/${congress}/${type}/${number}/summaries`, key);
  const summaries = await context.fetchWithSource(summariesUrl, { maxAgeMs: 24 * 60 * 60 * 1000 });
  const latest = summariesSchema
    .parse(JSON.parse(summaries.raw.body.toString("utf8")))
    .summaries.toSorted((a, b) => a.updateDate.localeCompare(b.updateDate))
    .at(-1);
  const sponsor = bill.sponsors?.[0]?.bioguideId ?? null;
  return {
    id,
    congress,
    type: MeasureType.parse(bill.type.toLowerCase()),
    number,
    titles: { display: bill.title, official: bill.title, short: null, popular: null },
    sponsorId: sponsor && knownPeople.has(sponsor) ? sponsor : null,
    introducedDate: bill.introducedDate ?? null,
    status: {
      latestAction: bill.latestAction.text,
      latestActionDate: bill.latestAction.actionDate.slice(0, 10),
      becameLaw: (bill.laws ?? []).length > 0,
    },
    crsSummary: latest
      ? {
          text: htmlToText(latest.text),
          versionLabel: latest.actionDesc ?? "Summary",
          date: latest.actionDate.slice(0, 10),
          sourceId: summaries.source.id,
        }
      : null,
    plainSummary: null,
    sourceIds: [source.id],
  };
}
