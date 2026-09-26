import type { MeasureType } from "@for-the-people/core/client";
import { shortMeasureTitle } from "@/lib/outcomes";

/**
 * Sponsored measures grouped under short, plain titles. Every title is read out of the official title with a
 * fixed pattern (a country, an agency, a fiscal year, a bill number); nothing is summarized or guessed. Titles
 * that match no pattern keep the measure's own short title, and identical titles share a group.
 */

export interface SponsoredMeasure {
  id: string;
  type: MeasureType;
  titles: { display: string; short: string | null };
}

export interface SponsoredItem<M extends SponsoredMeasure> {
  measure: M;
  /** What sets this measure apart inside its group (a rule's bill, a rule's name, a fiscal year), or null. */
  detail: string | null;
}

export interface SponsoredGroup<M extends SponsoredMeasure> {
  key: string;
  title: string;
  /** "6 resolutions", or null for a group of one. */
  count: string | null;
  /** The official title, when every measure in the group shares it. */
  officialTitle: string | null;
  items: SponsoredItem<M>[];
}

interface Family {
  pattern: RegExp;
  key: (match: RegExpExecArray) => string;
  title: (match: RegExpExecArray, size: number) => string;
  detail?: (match: RegExpExecArray, titles: SponsoredMeasure["titles"]) => string | null;
  /** Show the detail even for a group of one (a rule's name is never in the group title). */
  alwaysDetail?: boolean;
}

/** "the Government of Israel" is Israel; "the Islamic Republic of Iran" is Iran. */
export function countryName(raw: string): string {
  return raw
    .trim()
    .replace(
      /^(?:the )?(?:Government|Islamic Republic|People's Republic|Federal Republic|Republic|Kingdom|State) of (?:the )?/i,
      "",
    )
    .replace(/^the /i, "")
    .replace(/[.,;]+$/, "");
}

const RULE_DETAIL = /^Rule for considering /;

/**
 * Every pattern is anchored at the start of the official title, after an optional "A joint resolution" or
 * "An original concurrent resolution". A rule's title also names the measures it sets up ("providing for
 * consideration of the joint resolution (H.J. Res. 25) providing for congressional disapproval of…"), so a
 * phrase found later in a title never decides what the measure is.
 */
const lead = (body: string) =>
  new RegExp(`^(?:an? (?:original )?(?:joint |concurrent |executive )?resolution )?${body}`, "i");

const FAMILIES: Family[] = [
  {
    // Special rules from the Rules Committee.
    pattern: lead("providing for (?:consideration|disposition) of "),
    key: () => "special-rule",
    title: (_match, size) => (size > 1 ? "Rules for considering other measures" : ""),
    detail: (_match, titles) => {
      const short = shortMeasureTitle(titles);
      return RULE_DETAIL.test(short) ? short.replace(RULE_DETAIL, "For ") : null;
    },
  },
  {
    // Joint resolutions of disapproval of an arms sale (Arms Export Control Act).
    pattern: lead(
      String.raw`providing (?:for )?congressional disapproval of the proposed (?:foreign military sale|direct commercial sale|sale|export|transfer)s?(?: of (?:certain )?defense articles(?: and (?:defense )?services)?)? to (.+?)(?= of (?:certain )?defense articles|\.|,|;|$)`,
    ),
    key: (match) => `arms:${countryName(match[1]!)}`,
    title: (match) => `Block arms sales to ${countryName(match[1]!)}`,
  },
  {
    // Congressional Review Act resolutions.
    pattern: lead(
      "providing (?:for )?congressional disapproval under chapter 8 of title 5, United States Code, of (?:the|a) rule (?:submitted|issued) by (?:the )?(.+?) relating to (.+)$",
    ),
    key: (match) => `rule-review:${match[1]}`,
    title: (match, size) => `Overturn ${size > 1 ? "rules" : "a rule"} from the ${match[1]}`,
    detail: (match) => ruleName(match[2]!),
    alwaysDetail: true,
  },
  {
    // War Powers Resolution: remove forces from hostilities.
    pattern: lead(
      String.raw`(?:to direct the removal of|directing the President, pursuant to section 5\(c\) of the War Powers Resolution, to remove) United States Armed Forces from hostilities (?:within or against|within|against|with) (.+?)(?= that ha(?:ve|s) not|\.|,|;|$)`,
    ),
    key: (match) => `war-powers:${countryName(match[1]!)}`,
    title: (match) => `Remove U.S. forces from hostilities with ${countryName(match[1]!)}`,
  },
  {
    pattern: lead(
      String.raw`terminating the national emergency declared (?:to impose duties on articles imported from (.+?)|to impose (global tariffs)|with respect to (.+?))\.?$`,
    ),
    key: (match) => `emergency:${match[1] ?? match[2] ?? match[3]}`,
    title: (match) =>
      match[1]
        ? `End the national emergency behind tariffs on ${countryName(match[1])}`
        : match[2]
          ? "End the national emergency behind global tariffs"
          : `End the national emergency on ${match[3]}`,
  },
  {
    pattern: lead(
      String.raw`(?:setting forth|establishing) the congressional budget for the United States Government for fiscal year (\d{4})`,
    ),
    key: () => "budget",
    title: (match, size) =>
      size > 1 ? "Congressional budgets" : `Congressional budget for fiscal year ${match[1]}`,
    detail: (match) => `Fiscal year ${match[1]}`,
  },
  {
    pattern: lead(
      "authorizing the en bloc consideration in Executive Session of certain nominations",
    ),
    key: () => "en-bloc-nominations",
    title: () => "Consider nominations as a group",
  },
];

/** The rule's own name, without the official title's quote marks, clipped for a list. */
function ruleName(raw: string): string {
  const name = raw
    .trim()
    .replace(/^(?:the )?[‘'"“]+/, "")
    .replace(/[’'"”]*\.?$/, "")
    .replace(/[’'"”]+$/, "");
  if (name.length <= 80) return name;
  const clipped = name.slice(0, 78);
  return `${clipped.slice(0, clipped.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

const RESOLUTION_TYPES = new Set<MeasureType>([
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
]);

function countLabel(types: MeasureType[]): string {
  const n = types.length;
  const resolutions = types.every((type) => RESOLUTION_TYPES.has(type));
  const bills = types.every((type) => !RESOLUTION_TYPES.has(type));
  const noun = resolutions ? "resolution" : bills ? "bill" : "measure";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function familyOf(
  titles: SponsoredMeasure["titles"],
): { family: Family; match: RegExpExecArray } | null {
  if (titles.short) return null;
  for (const family of FAMILIES) {
    const match = family.pattern.exec(titles.display);
    if (match) return { family, match };
  }
  return null;
}

/** Groups a member's sponsored measures in the order they arrive. */
export function groupSponsored<M extends SponsoredMeasure>(
  measures: readonly M[],
): SponsoredGroup<M>[] {
  const buckets = new Map<
    string,
    {
      found: ReturnType<typeof familyOf>;
      members: Array<{ measure: M; match: RegExpExecArray | null }>;
    }
  >();
  for (const measure of measures) {
    const found = familyOf(measure.titles);
    const key = found ? found.family.key(found.match) : `title:${measure.titles.display}`;
    const bucket = buckets.get(key) ?? { found, members: [] };
    bucket.members.push({ measure, match: found?.match ?? null });
    buckets.set(key, bucket);
  }
  return [...buckets].map(([key, { found, members }]) => {
    const [first] = members;
    const size = members.length;
    const shared = members.every(
      (entry) => entry.measure.titles.display === first!.measure.titles.display,
    );
    const familyTitle = found ? found.family.title(found.match, size) : "";
    return {
      key,
      title: familyTitle || shortMeasureTitle(first!.measure.titles),
      count: size > 1 ? countLabel(members.map((entry) => entry.measure.type)) : null,
      officialTitle: shared ? first!.measure.titles.display : null,
      items: members.map(({ measure, match }) => ({
        measure,
        detail:
          found?.family.detail && match && (size > 1 || found.family.alwaysDetail)
            ? found.family.detail(match, measure.titles)
            : null,
      })),
    };
  });
}
