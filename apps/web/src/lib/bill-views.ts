import {
  PARTY_NAMES,
  personIdToSlug,
  type KeyVote,
  type Location,
  type Measure,
  type MeasureType,
  type Party,
  type Position,
  type RollCall,
  type Source,
  type StateCode,
} from "@for-the-people/core/client";
import type { MeasurePage, RollCallSeats, Sponsor } from "@for-the-people/data/read/bills";
import {
  chamberName,
  formatDate,
  formatDateLong,
  formatInteger,
  measureLabel,
  officeLine,
  STATE_NAMES,
} from "./format";
import {
  isPassageVote,
  measureKindNote,
  measureOutcome,
  measureShortName,
  thresholdText,
  type MeasureOutcome,
} from "./outcomes";
import { resultLabel } from "./vote-margin";
import { boardOrder, partyTallies, type PartyTally } from "./seat-layout";
import { toReceipt, type ReceiptView, type RollCallView } from "./views";

/** Serializable view models for the bill page, the roll call page, The Board, and the hemicycle. */

export interface SeatView {
  slug: string;
  name: string;
  lastName: string;
  state: StateCode;
  district: number | null;
  party: Party;
  position: Position;
}

/**
 * A roll call as the page lists it: the receipt view, the official description of what was voted on, and
 * whether a published KeyVote cites it.
 */
export type RollCallRow = RollCallView & { title: string | null; keyVote: boolean };

export interface BoardView {
  rollCall: RollCallRow;
  /** Every member in Board order: state name, then last name. */
  seats: SeatView[];
  tallies: PartyTally[];
  /** One sentence that says what the chart shows, for screen readers and as its caption. */
  summary: string;
  /** Present when a published KeyVote cites this roll call. */
  keyVote: {
    id: string;
    title: string;
    question?: string;
    yeaMeans: string;
    yeaSupportsMeasure: boolean;
  } | null;
}

export interface SummaryBlock {
  /** A heading is a CRS title or subtitle line, already in sentence case. */
  kind: "paragraph" | "list" | "heading";
  lines: string[];
}

export interface MeasureView {
  id: string;
  label: string;
  title: string;
  /** The name the measure is known by, for plain lines about its votes (lib/outcomes.ts). */
  shortName: string | null;
  officialTitle: string;
  congressUrl: string;
  becameLaw: boolean;
  /** Became law, passed, adopted, or failed, in plain words (lib/outcomes.ts). */
  outcome: MeasureOutcome;
  /** What kind of measure a joint resolution is, in plain words (lib/outcomes.ts); null for others. */
  kindNote: string | null;
  latestAction: string;
  latestActionDate: string;
  introducedDate: string | null;
  receipt: ReceiptView;
  crsSummary: {
    blocks: SummaryBlock[];
    versionLabel: string;
    date: string;
    receipt: ReceiptView;
  } | null;
  plainSummary: { text: string; reviewed: boolean } | null;
}

export interface SponsorView {
  slug: string;
  name: string;
  party: Party;
  office: string;
}

export interface KeyVoteCardView {
  id: string;
  title: string;
  /** The card's plain yes/no question, when it has one. */
  question?: string;
  yeaMeans: string;
  /** What the measure does, in the card's reviewed plain words. */
  whatItDoes: string;
  /** The card's roll calls with polarity, so the page can place the voter's stance on each vote. */
  refs: Array<{ rollCallId: string; yeaSupportsMeasure: boolean }>;
}

export interface BillPageView {
  measure: MeasureView;
  sponsor: SponsorView | null;
  rollCalls: RollCallRow[];
  card: KeyVoteCardView | null;
  /** The roll call shown on The Board and the hemicycle. */
  featured: BoardView | null;
  /** The key roll call in each chamber, for "How your members voted". Includes the featured one. */
  chamberBoards: BoardView[];
}

const CONGRESS_GOV_TYPE: Record<MeasureType, string> = {
  hr: "house-bill",
  s: "senate-bill",
  hjres: "house-joint-resolution",
  sjres: "senate-joint-resolution",
  hconres: "house-concurrent-resolution",
  sconres: "senate-concurrent-resolution",
  hres: "house-resolution",
  sres: "senate-resolution",
};

/** The measure's human-readable page on Congress.gov (the Source itself is the GovInfo XML behind it). */
export const congressGovUrl = (measure: Pick<Measure, "congress" | "type" | "number">): string =>
  `https://www.congress.gov/bill/${measure.congress}th-congress/${CONGRESS_GOV_TYPE[measure.type]}/${measure.number}`;

const DIVISION =
  /^(title|subtitle|part|subpart|chapter|subchapter|division)\s+([a-z0-9]+)\b\s*(?:--|—|–|:)?\s*/i;
const ENDS_SENTENCE = /[.!?)"”’]$/;

/**
 * "TITLE I--COMMITTEE ON AGRICULTURE" and "Subtitle A--Nutrition" are headings, as is a short untitled
 * line, unless a list follows it: "This title provides appropriations to the Senate for" leads into one.
 */
function isHeading(line: string, leadsList: boolean): boolean {
  if (DIVISION.test(line) && line.length < 160 && !ENDS_SENTENCE.test(line)) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) return true;
  return (
    !leadsList && line.split(/\s+/).length <= 8 && !ENDS_SENTENCE.test(line) && !/[,;:]$/.test(line)
  );
}

/** Acronyms that stay in capitals when an ALL-CAPS heading is lowercased. */
const ACRONYMS = new Set(["SNAP", "USDA", "DC", "DOD", "DHS", "FDA", "EPA", "IRS", "NASA", "TANF"]);

/**
 * Proper nouns that keep their capitals in a sentence-cased heading, longest first so "Department of
 * Veterans Affairs" wins over "Veterans Affairs". Matched whole-word, ignoring case.
 */
const PROPER_NOUNS = [
  "Department of Veterans Affairs",
  "Department of Homeland Security",
  "Department of Agriculture",
  "Department of Defense",
  "Food and Drug Administration",
  "House of Representatives",
  "Veterans Affairs",
  "Homeland Security",
  "Social Security",
  "Armed Services",
  "United States",
  "Main Street",
  "Americans",
  "American",
  "America",
  "Congress",
  "Senate",
  "House",
  "Medicare",
  "Medicaid",
].map((name) => [new RegExp(`\\b${name}\\b`, "gi"), name] as const);

/** Words a title-cased name keeps in lowercase unless they open it. */
const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

const lowerWord = (word: string) =>
  word.includes(".") || ACRONYMS.has(word.replace(/[^A-Z]/g, "")) ? word : word.toLowerCase();

/** "COMMITTEE ON ARMED SERVICES" becomes "Committee on Armed Services"; "FULL-YEAR" becomes "Full-Year". */
function titleCase(phrase: string): string {
  return phrase
    .split(" ")
    .map((word, index) => {
      const lower = lowerWord(word);
      if (lower !== word.toLowerCase() || (index > 0 && MINOR_WORDS.has(lower))) return lower;
      return lower.replace(
        /(^|-)([a-z])/g,
        (_, dash: string, letter: string) => dash + letter.toUpperCase(),
      );
    })
    .join(" ");
}

/** "BUILDING MORE IN AMERICA" becomes "Building more in America": lowercase, then proper nouns restored. */
function lowerWithProperNouns(phrase: string): string {
  let text = phrase.split(" ").map(lowerWord).join(" ");
  for (const [pattern, name] of PROPER_NOUNS) text = text.replace(pattern, name);
  return text;
}

/** A congressional committee's name, or an act's name up to "ACT" and its year: printed as a proper noun. */
const COMMITTEE = /^COMMITTEE ON\b/;
const ACT_NAME = /^(.*?\bACT\b(?:,\s*\d{4})?)(.*)$/;

/**
 * Lowercases an ALL-CAPS phrase to sentence case, keeping abbreviations such as "U.S.", acronyms,
 * proper nouns, and the names of committees and acts ("Committee on Armed Services", "Continuing
 * Appropriations Act, 2026"). Mixed-case text is left as the CRS printed it.
 */
function sentenceCase(phrase: string): string {
  if (phrase !== phrase.toUpperCase()) return phrase;
  const act = ACT_NAME.exec(phrase);
  const text = COMMITTEE.test(phrase)
    ? titleCase(phrase)
    : act
      ? titleCase(act[1]!) + lowerWithProperNouns(act[2]!)
      : lowerWithProperNouns(phrase);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "TITLE I--COMMITTEE ON AGRICULTURE" becomes "Title I: Committee on Agriculture". */
function headingText(line: string): string {
  const division = DIVISION.exec(line);
  if (!division) return sentenceCase(line.replace(/\s*--\s*/g, " – "));
  const kind = division[1]!.charAt(0).toUpperCase() + division[1]!.slice(1).toLowerCase();
  const rest = line.slice(division[0].length).replace(/\s*--\s*/g, " – ");
  return rest ? `${kind} ${division[2]}: ${sentenceCase(rest)}` : `${kind} ${division[2]}`;
}

/**
 * CRS text arrives as plain lines: lines that start with "- " were list items, and title and subtitle
 * lines are headings. A first line that only repeats the bill's title is dropped.
 */
export function summaryBlocks(text: string, title?: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  const lines = text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean);
  for (const [index, line] of lines.entries()) {
    const last = blocks.at(-1);
    if (line.startsWith("- ")) {
      if (last?.kind === "list") last.lines.push(line.slice(2));
      else blocks.push({ kind: "list", lines: [line.slice(2)] });
    } else if (isHeading(line, lines[index + 1]?.startsWith("- ") ?? false)) {
      if (blocks.length === 0 && title && line.toLowerCase() === title.toLowerCase()) continue;
      blocks.push({ kind: "heading", lines: [headingText(line)] });
    } else {
      blocks.push({ kind: "paragraph", lines: [line] });
    }
  }
  return blocks;
}

/** About two short paragraphs: enough to say what the bill does before "Read the full summary". */
const PREVIEW_CHARACTERS = 480;

/**
 * How many blocks the summary preview shows: at least PREVIEW_CHARACTERS of text, ending on a finished
 * paragraph (never a heading, a list, or a line that leads into one). A shorter summary stops at its
 * last finished paragraph; with none, it is shown whole.
 */
export function summaryPreviewLength(
  blocks: readonly SummaryBlock[],
  characters = PREVIEW_CHARACTERS,
): number {
  let total = 0;
  let lastFinished = -1;
  for (const [index, block] of blocks.entries()) {
    total += block.lines.join(" ").length;
    if (block.kind !== "paragraph" || !ENDS_SENTENCE.test(block.lines[0]!)) continue;
    if (total >= characters) return index + 1;
    lastFinished = index;
  }
  return lastFinished >= 0 ? lastFinished + 1 : blocks.length;
}

/**
 * The CRS summary's opening: its first finished paragraph, the one sentence or two that say what the
 * measure does before its titles and lists begin. Null when it has none.
 */
export function summaryLead(blocks: readonly SummaryBlock[]): string | null {
  return (
    blocks.find((block) => block.kind === "paragraph" && ENDS_SENTENCE.test(block.lines[0]!))
      ?.lines[0] ?? null
  );
}

/**
 * The line under the status label, as one sentence. For a law it continues "Became law":
 * "On Jul 4, 2025, as Public Law 119-21."
 */
export function measureStatusLine(
  measure: Pick<MeasureView, "outcome" | "latestAction" | "latestActionDate">,
): string {
  const date = formatDate(measure.latestActionDate);
  const law = /Public Law(?: No)?:?\s*(\d+-\d+)/i.exec(measure.latestAction);
  if (measure.outcome.tone === "law" && law) return `On ${date}, as Public Law ${law[1]}.`;
  const action = measure.latestAction.trim().replace(/[.\s]+$/, "");
  return `Latest action on ${date}: ${action}.`;
}

const newestFirst = (a: RollCallRow, b: RollCallRow): number =>
  b.date.localeCompare(a.date) || rollCallOrder(b.id) - rollCallOrder(a.id);

/**
 * The roll calls a bill page shows before "Show all": every key vote, then the newest others until
 * there are `size`, newest first. With `size` at least the list's length this is the whole list.
 */
export function previewRollCalls(rows: readonly RollCallRow[], size: number): RollCallRow[] {
  const ordered = rows.toSorted(newestFirst);
  const room = Math.max(0, size - ordered.filter((row) => row.keyVote).length);
  const others = new Set(
    ordered
      .filter((row) => !row.keyVote)
      .slice(0, room)
      .map((row) => row.id),
  );
  return ordered.filter((row) => row.keyVote || others.has(row.id));
}

/** Questions that say only what kind of vote it was, not what it was about. */
const GENERIC_QUESTION =
  /^On (the )?(Motion|Amendment|Decision of the Chair|Nomination|Cloture Motion|Point of Order|Joint Resolution|Resolution)$/i;

/** A row's lead line says what was voted on: the description when the question is generic. */
export function rollCallHeadline(row: Pick<RollCallRow, "question" | "title">): {
  primary: string;
  secondary: string | null;
} {
  if (row.title && GENERIC_QUESTION.test(row.question.trim()))
    return { primary: row.title, secondary: row.question };
  return { primary: row.question, secondary: row.title };
}

const UNVERIFIED = { status: "unverified", checkedAt: null, notes: null } as const;

export function toRollCallView(
  rollCall: RollCall,
  source: Source,
  ref?: KeyVote["rollCallRefs"][number],
): RollCallRow {
  return {
    id: rollCall.id,
    chamber: rollCall.chamber,
    number: rollCall.number,
    date: rollCall.date,
    question: rollCall.question,
    title: rollCall.title,
    result: rollCall.result,
    requires: rollCall.requires,
    totals: rollCall.totals,
    tieBreaker: rollCall.tieBreaker,
    officialUrl: rollCall.officialUrl,
    yeaSupportsMeasure: ref?.yeaSupportsMeasure ?? true,
    decisive: ref?.decisive ?? false,
    keyVote: ref !== undefined,
    verification: ref?.verification ?? UNVERIFIED,
    measureLabel: rollCall.measureId ? measureLabel(rollCall.measureId) : null,
    receipt: toReceipt(source),
  };
}

const HONORIFIC_TERRITORIES = new Set<StateCode>(["DC", "AS", "GU", "MP", "VI"]);

/** "Rep." or "Sen." (delegates are "Del.", Puerto Rico's member is "Res. Comm."), from the roll call's chamber. */
/** The seat's office title in the words OfficeText uses: "U.S. Senator", "Delegate", and so on. */
export function seatTitle(chamber: "house" | "senate", state: StateCode): string {
  if (chamber === "senate") return "U.S. Senator";
  if (state === "PR") return "Resident Commissioner";
  return HONORIFIC_TERRITORIES.has(state) ? "Delegate" : "U.S. Representative";
}

export function honorific(chamber: "house" | "senate", state: StateCode): string {
  if (chamber === "senate") return "Sen.";
  if (state === "PR") return "Res. Comm.";
  return HONORIFIC_TERRITORIES.has(state) ? "Del." : "Rep.";
}

export const POSITION_WORDS: Record<Position, string> = {
  Yea: "voted Yea",
  Nay: "voted Nay",
  Present: "voted Present",
  NotVoting: "did not vote",
};

/** The accessible name of one Board cell: "Rep. Nancy Pelosi, CA, voted Nay". */
export const seatLabel = (chamber: "house" | "senate", seat: SeatView): string =>
  `${honorific(chamber, seat.state)} ${seat.name}, ${seat.state}, ${POSITION_WORDS[seat.position]}`;

/** One state's line on The Board: its two-letter code and the indexes of its seats, in Board order. */
export interface BoardRow {
  state: StateCode;
  cells: number[];
}

/** Seats already in Board order, grouped into one row per state so the state order can be read. */
export function boardRows(seats: readonly Pick<SeatView, "state">[]): BoardRow[] {
  const rows: BoardRow[] = [];
  seats.forEach((seat, index) => {
    const last = rows.at(-1);
    if (last?.state === seat.state) last.cells.push(index);
    else rows.push({ state: seat.state, cells: [index] });
  });
  return rows;
}

const SERVED_DISTRICT = /^([A-Z]{2})-(\d{1,2})@cd119$/;

/**
 * Whether a seat on a roll call belongs to the voter's own members: their senators by state, and in the
 * House the member for the district they live in now (the 119th Congress map), not their 2026 ballot
 * district. The location stays on the device; this runs there.
 */
export function isVotersMember(
  chamber: "house" | "senate",
  seat: Pick<SeatView, "state" | "district">,
  location: Pick<Location, "state" | "districts"> | null,
): boolean {
  if (!location || seat.state !== location.state) return false;
  if (chamber === "senate") return true;
  const served = location.districts.flatMap((id) => {
    const match = SERVED_DISTRICT.exec(id);
    return match && match[1] === location.state ? [Number(match[2])] : [];
  })[0];
  return served !== undefined && seat.district === served;
}

const PARTY_PLURAL: Record<Party, string> = {
  D: "Democrats",
  R: "Republicans",
  I: "Independents",
  L: "Libertarians",
  G: "Greens",
  O: "Others",
};

export const partyPlural = (party: Party, count: number): string =>
  count === 1 ? PARTY_NAMES[party] : PARTY_PLURAL[party];

function partyClause(tally: PartyTally): string {
  const parts = [`${formatInteger(tally.yea)} Yea`, `${formatInteger(tally.nay)} Nay`];
  if (tally.present) parts.push(`${formatInteger(tally.present)} Present`);
  if (tally.notVoting) parts.push(`${formatInteger(tally.notVoting)} not voting`);
  return `${partyPlural(tally.party as Party, tally.total)}: ${parts.join(", ")}.`;
}

/** Short sentences: which roll call and when, the result and totals, then how each party voted. */
export function boardSummary(rollCall: RollCall, tallies: PartyTally[]): string {
  const { yea, nay, present, notVoting } = rollCall.totals;
  const extra = [
    present ? `${formatInteger(present)} Present` : null,
    notVoting ? `${formatInteger(notVoting)} not voting` : null,
  ].filter(Boolean);
  const threshold = thresholdText(rollCall);
  const tie = rollCall.tieBreaker
    ? ` and the ${rollCall.tieBreaker.by} breaking the tie with a ${rollCall.tieBreaker.vote}`
    : "";
  return (
    `${chamberName(rollCall.chamber)} roll call ${rollCall.number}, ${formatDateLong(rollCall.date)}: ` +
    `${resultLabel(rollCall)} ${formatInteger(yea)} to ${formatInteger(nay)}` +
    (extra.length ? `, with ${extra.join(" and ")}` : "") +
    `${tie}.${threshold ? ` ${threshold}.` : ""} ${tallies.map(partyClause).join(" ")}`
  );
}

export function toBoardView(data: RollCallSeats, keyVotes: readonly KeyVote[]): BoardView {
  const { rollCall } = data;
  const card = keyVotes.find((keyVote) =>
    keyVote.rollCallRefs.some((ref) => ref.rollCallId === rollCall.id),
  );
  const ref = card?.rollCallRefs.find((candidate) => candidate.rollCallId === rollCall.id);
  const seats = boardOrder(
    data.seats.map((seat) => ({
      slug: personIdToSlug(seat.personId),
      name: seat.name,
      lastName: seat.lastName,
      state: seat.state,
      district: seat.district,
      party: seat.party,
      position: seat.position,
    })),
    (state) => STATE_NAMES[state as StateCode] ?? state,
  );
  const tallies = partyTallies(seats);
  return {
    rollCall: toRollCallView(rollCall, data.source, ref),
    seats,
    tallies,
    summary: boardSummary(rollCall, tallies),
    keyVote:
      card && ref
        ? {
            id: card.id,
            title: card.card.title,
            question: card.card.question,
            yeaMeans: card.card.yeaMeans,
            yeaSupportsMeasure: ref.yeaSupportsMeasure,
          }
        : null,
  };
}

export function toSponsorView(sponsor: Sponsor): SponsorView {
  return {
    slug: personIdToSlug(sponsor.person.id),
    name: sponsor.person.names.full,
    party: sponsor.party,
    office: officeLine({
      chamber: sponsor.chamber,
      state: sponsor.state,
      district: sponsor.district,
      title: sponsor.title,
    }),
  };
}

export function toMeasureView(
  measure: Measure,
  sources: readonly Source[],
  rollCalls: readonly RollCall[] = [],
): MeasureView | null {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const source = measure.sourceIds.map((id) => byId.get(id)).find(Boolean);
  if (!source) return null;
  const summarySource = measure.crsSummary ? byId.get(measure.crsSummary.sourceId) : undefined;
  return {
    id: measure.id,
    label: measureLabel(measure.id),
    title: measure.titles.display,
    shortName: measureShortName(measure.titles),
    officialTitle: measure.titles.official,
    congressUrl: congressGovUrl(measure),
    becameLaw: measure.status.becameLaw,
    outcome: measureOutcome(
      {
        type: measure.type,
        becameLaw: measure.status.becameLaw,
        latestAction: measure.status.latestAction,
      },
      rollCalls,
    ),
    kindNote: measureKindNote({
      type: measure.type,
      label: measureLabel(measure.id),
      officialTitle: measure.titles.official,
    }),
    latestAction: measure.status.latestAction,
    latestActionDate: measure.status.latestActionDate,
    introducedDate: measure.introducedDate,
    receipt: toReceipt(source),
    crsSummary:
      measure.crsSummary && summarySource
        ? {
            blocks: summaryBlocks(measure.crsSummary.text, measure.titles.display),
            versionLabel: measure.crsSummary.versionLabel,
            date: measure.crsSummary.date,
            receipt: toReceipt(summarySource),
          }
        : null,
    plainSummary: measure.plainSummary
      ? { text: measure.plainSummary.text, reviewed: measure.plainSummary.reviewed }
      : null,
  };
}

/** Roll call ids sort by session, then number, within one chamber and Congress. */
const rollCallOrder = (id: string): number => {
  const [, , session, number] = id.split("-");
  return Number(session) * 100_000 + Number(number);
};

/**
 * The key roll call in each chamber: the decisive vote on a published card when there is one, otherwise
 * the latest passage vote, otherwise the latest vote of any kind.
 */
export function keyRollCallIds(page: Pick<MeasurePage, "rollCalls" | "keyVotes">): string[] {
  const picks: string[] = [];
  for (const chamber of ["house", "senate"] as const) {
    const decisive = page.keyVotes
      .flatMap((keyVote) => keyVote.rollCallRefs)
      .filter((ref) => ref.decisive && ref.rollCallId.startsWith(`${chamber}-`))
      .map((ref) => ref.rollCallId)
      .toSorted((a, b) => rollCallOrder(b) - rollCallOrder(a));
    const inChamber = page.rollCalls
      .filter((rollCall) => rollCall.chamber === chamber)
      .toSorted((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
    const pick = decisive[0] ?? inChamber.find(isPassageVote)?.id ?? inChamber[0]?.id;
    if (pick) picks.push(pick);
  }
  return picks;
}

/** The roll call to feature: the latest of the chambers' key votes. */
export function featuredBoard(boards: readonly BoardView[]): BoardView | null {
  return (
    boards.toSorted(
      (a, b) =>
        b.rollCall.date.localeCompare(a.rollCall.date) || b.rollCall.number - a.rollCall.number,
    )[0] ?? null
  );
}
