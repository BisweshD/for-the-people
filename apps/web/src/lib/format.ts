import type { MeasureType, Party, StateCode } from "@for-the-people/core/client";
import { honorific } from "./share";

/** Formatting helpers. Numbers always get context and tabular figures in the UI. */

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const INTEGER = new Intl.NumberFormat("en-US");
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
/**
 * Always one decimal, so amounts shown together read at one precision ("$1.0M" beside "$247.2K", never
 * "$1M" beside it).
 */
const COMPACT_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "2026-01-08" or an ISO datetime becomes "Jan 8, 2026". */
export const formatDate = (value: string): string =>
  DATE.format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
export const formatDateLong = (value: string): string =>
  DATE_LONG.format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
export const formatInteger = (value: number): string => INTEGER.format(value);
export const formatDollars = (value: number): string => DOLLARS.format(value);
/** "$247.2K", "$1.0M"; under $1,000, whole dollars ("$850"). */
export function formatDollarsCompact(value: number): string {
  const whole = Math.round(value);
  return Math.abs(whole) < 1_000 ? DOLLARS.format(whole) : COMPACT_DOLLARS.format(whole);
}
export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * A share of a count, rounded to a whole percent, except that it never rounds to 100% or 0% unless the
 * share is exact (767 of 768 reads "99.9%", not "100%").
 */
export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return "No record yet";
  const percent = (part / whole) * 100;
  const rounded = Math.round(percent);
  if ((rounded === 100 && part !== whole) || (rounded === 0 && part !== 0)) {
    const oneDecimal = Math.round(percent * 10) / 10;
    if (oneDecimal === 0) return "under 0.1%";
    if (oneDecimal === 100) return "over 99.9%";
    const precise = oneDecimal;
    return `${precise.toFixed(1)}%`;
  }
  return `${rounded}%`;
}

const MEASURE_PREFIX: Record<MeasureType, string> = {
  hr: "H.R.",
  s: "S.",
  hjres: "H.J.Res.",
  sjres: "S.J.Res.",
  hconres: "H.Con.Res.",
  sconres: "S.Con.Res.",
  hres: "H.Res.",
  sres: "S.Res.",
};

/** 119-hr-1834 becomes "H.R. 1834". */
export function measureLabel(id: string): string {
  const [, type, number] = id.split("-");
  const prefix = MEASURE_PREFIX[type as MeasureType];
  return prefix ? `${prefix} ${number}` : id;
}

export const measureSlug = (id: string): string => id;

export const STATE_NAMES: Record<StateCode, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
  AS: "American Samoa",
  GU: "Guam",
  MP: "Northern Mariana Islands",
  PR: "Puerto Rico",
  VI: "U.S. Virgin Islands",
};

export const PARTY_LETTER: Record<Party, string> = {
  D: "D",
  R: "R",
  I: "I",
  L: "L",
  G: "G",
  O: "O",
};

/** "CA-12", or "AK at-large" for number 0. */
export function districtLabel(state: StateCode, district: number | null): string {
  if (district === null) return STATE_NAMES[state];
  return district === 0 ? `${state} at-large` : `${state}-${district}`;
}

interface OfficeHolder {
  chamber: "house" | "senate";
  state: StateCode;
  district: number | null;
  title: string;
}

export function officeLine(member: OfficeHolder): string {
  if (member.chamber === "senate") return `U.S. Senator, ${STATE_NAMES[member.state]}`;
  if (member.title !== "U.S. Representative")
    return `${member.title}, ${STATE_NAMES[member.state]}`;
  return `U.S. Representative, ${districtLabel(member.state, member.district)}`;
}

/** The office line for narrow rows: "Rep., TX-34", "Sen., Vermont", "Del., Guam". */
export function officeShort(member: OfficeHolder): string {
  const title = honorific(member);
  if (member.chamber === "senate" || member.title !== "U.S. Representative")
    return `${title}, ${STATE_NAMES[member.state]}`;
  return `${title}, ${districtLabel(member.state, member.district)}`;
}

export const chamberName = (chamber: "house" | "senate"): string =>
  chamber === "house" ? "House" : "Senate";

const SMALL_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to"]);
const KEEP_UPPER = new Set(["PAC", "USA", "US", "II", "III", "IV", "LLC", "DC"]);

/**
 * FEC files committee names in capitals ("FRIENDS OF BERNIE SANDERS"). Shown in title case, leaving
 * names that already use mixed case alone.
 */
export function titleCaseName(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (KEEP_UPPER.has(upper.replace(/[^A-Z]/g, ""))) return upper;
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word
        .replace(/^(\W*)(\w)/, (_, lead: string, first: string) => lead + first.toUpperCase())
        .replace(/^(Mc)(\w)/, (_, mc: string, next: string) => mc + next.toUpperCase());
    })
    .join("");
}

/**
 * Congress.gov action text carries Congressional Record citations and vote bookkeeping
 * ("Record Vote Number: 81. (consideration: CR S1779)"). The vote itself stays one tap away.
 */
export function cleanActionText(text: string): string {
  return text
    .replace(/\s*\((?:consideration|text)[^)]*\)/gi, "")
    .replace(/\s*Record Vote Number:\s*\d+\.?/gi, "")
    .replace(/\s*\(Roll no\. \d+\)\.?/gi, "")
    .replace(/(\d+)\s*-\s*(\d+)/g, "$1-$2")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.;:,]?$/, ".");
}

/**
 * An address without its scheme, cut in the middle to at most `max` characters so both the host and
 * the file name stay readable ("clerk.house.gov/evs/2026/rol…/roll130.xml").
 */
export function middleTruncate(url: string, max = 48): string {
  const bare = url.replace(/^https?:\/\//, "");
  if (bare.length <= max) return bare;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${bare.slice(0, head)}…${bare.slice(bare.length - (keep - head))}`;
}
