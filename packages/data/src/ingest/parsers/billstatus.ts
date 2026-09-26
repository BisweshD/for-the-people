import { MeasureType, measureId, type Measure } from "@for-the-people/core";
import * as z from "zod";
import { parseXml } from "./xml";

/** Parser for GovInfo BILLSTATUS XML (https://www.govinfo.gov/bulkdata/BILLSTATUS/...). */

const text = z.union([z.string(), z.number()]).transform(String);
/** BILLSTATUS wraps lists as <x><item/>...</x>; one item parses as an object and an empty list as "". */
const unwrap = (key: string) => (value: unknown) =>
  value && typeof value === "object" && key in value
    ? [(value as Record<string, unknown>)[key]].flat()
    : [];
const list = <T extends z.ZodType>(item: T) => z.preprocess(unwrap("item"), z.array(item));

const summarySchema = z.object({
  versionCode: text.optional(),
  actionDate: text,
  actionDesc: text.optional(),
  updateDate: text,
  text: text.optional(),
});

const billSchema = z.object({
  billStatus: z.object({
    bill: z.object({
      number: text,
      type: text,
      congress: text,
      introducedDate: text.optional(),
      title: text,
      titles: list(z.object({ titleType: text, title: text })),
      sponsors: list(z.object({ bioguideId: text.optional() })),
      laws: list(z.object({ type: text, number: text })),
      summaries: z.preprocess(unwrap("summary"), z.array(summarySchema)),
      latestAction: z.object({ actionDate: text, text: text }),
    }),
  }),
});

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** CRS summaries arrive as HTML. Convert to plain paragraphs; we never render source HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*(br|\/p|\/li|\/ul|\/ol|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X"))
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}

const SHORT_TITLE_PREFERENCE = [
  "Short Title(s) as Enacted",
  "Short Title(s) as Passed Senate",
  "Short Title(s) as Passed House",
  "Short Title(s) as Reported to House",
  "Short Title(s) as Reported to Senate",
  "Short Title(s) as Introduced",
];

export interface BillStatusParse {
  measure: Omit<Measure, "sourceIds" | "crsSummary" | "plainSummary" | "sponsorId">;
  sponsorBioguide: string | null;
  crsSummary: { text: string; versionLabel: string; date: string } | null;
}

/** A Display Title that is a name ("GENIUS Act"), not a sentence ("An act to provide for ..."). */
export function displayAsName(display: string | null, short: string | null): string | null {
  if (!display || display === short) return null;
  return /^(an? (act|bill)|a (joint |concurrent )?resolution)\b/i.test(display) ? null : display;
}

export function parseBillStatus(xml: string): BillStatusParse {
  const { bill } = billSchema.parse(parseXml(xml)).billStatus;
  const type = MeasureType.parse(bill.type.toLowerCase());
  const congress = Number(bill.congress);
  const number = Number(bill.number);
  const byType = (titleType: string) =>
    bill.titles.find((title) => title.titleType === titleType)?.title ?? null;
  const short =
    SHORT_TITLE_PREFERENCE.map(byType).find((title): title is string => Boolean(title)) ?? null;
  const official = byType("Official Title as Introduced") ?? bill.title;
  const latestSummary = bill.summaries
    .filter((summary): summary is typeof summary & { text: string } =>
      Boolean(summary.text?.trim()),
    )
    .toSorted((a, b) => a.updateDate.localeCompare(b.updateDate))
    .at(-1);
  return {
    measure: {
      id: measureId(congress, type, number),
      congress,
      type,
      number,
      titles: {
        display: short ?? byType("Display Title") ?? bill.title,
        official,
        short,
        // The name people search for. Congress.gov's Display Title is often it ("GENIUS Act") when the
        // record has no Popular Title and the preferred short title is the long form.
        popular: byType("Popular Title") ?? displayAsName(byType("Display Title"), short),
      },
      introducedDate: bill.introducedDate?.slice(0, 10) ?? null,
      status: {
        latestAction: bill.latestAction.text,
        latestActionDate: bill.latestAction.actionDate.slice(0, 10),
        becameLaw: bill.laws.some((law) => law.type === "Public Law" || law.type === "Private Law"),
      },
    },
    sponsorBioguide: bill.sponsors[0]?.bioguideId ?? null,
    crsSummary: latestSummary
      ? {
          text: htmlToText(latestSummary.text),
          versionLabel: latestSummary.actionDesc ?? "Summary",
          date: latestSummary.actionDate.slice(0, 10),
        }
      : null,
  };
}
