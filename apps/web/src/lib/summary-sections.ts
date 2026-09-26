import type { SummaryBlock } from "./bill-views";

/**
 * A long CRS summary as the bill itself is organized: its divisions, titles, subtitles, chapters, and
 * parts, nested by rank. The full summary page shows the top two levels as closed disclosures, each with
 * a one-line gist, so H.R. 1's hundreds of paragraphs read as a table of contents first.
 */

/** Bill divisions from largest to smallest. */
const RANKS = [
  "division",
  "title",
  "subtitle",
  "chapter",
  "subchapter",
  "part",
  "subpart",
] as const;
export type DivisionKind = (typeof RANKS)[number];

/** A heading block as summaryBlocks writes it: "Title I: Committee on Agriculture" or "Subtitle B". */
const DIVISION_HEADING =
  /^(Division|Title|Subtitle|Chapter|Subchapter|Part|Subpart) ([IVXLC]+|[A-Z]|\d+)(?::|$)/;

export interface SummarySection {
  /** Unique within the summary and stable across builds ("title-i-subtitle-a"), for links and the rail. */
  id: string;
  /** The heading as shown ("Title I: Committee on Agriculture, Nutrition, and Forestry"). */
  heading: string;
  /** Null for a plain CRS heading line that is not a bill division. */
  kind: DivisionKind | null;
  /**
   * One line from the CRS text, verbatim (gistText): for a title or top-level section, the first
   * sentence under it; for a deeper division, its own first sentence when that describes the division
   * ("This subtitle amends ..."). A leading "(Sec. 20001)" is not part of the sentence: it moves to
   * gistFrom. Null when there is none, so the heading stands alone.
   */
  gist: string | null;
  /**
   * Where the gist sits when it is not the section's own overview: the bill section it summarizes
   * ("Sec. 20001") or the division it opens ("Subtitle A, Chapter 1"). Shown in the meta line.
   */
  gistFrom: string | null;
  /**
   * What kind of part the gist describes when it is not the section's own overview ("section",
   * "chapter"), so the page can say "From its first section:" before it. Null for the section's own
   * text ("This title addresses ...").
   */
  gistUnit: DivisionKind | "section" | null;
  /**
   * What the section holds, counted from the text: "6 subtitles, 21 sections" (the sections are the
   * CRS's "(Sec. 10101)" paragraphs). Empty when there is nothing to count.
   */
  contents: string;
  /** Text before the first subsection. */
  blocks: SummaryBlock[];
  children: SummarySection[];
}

export interface SummaryOutline {
  /** Paragraphs before the first section: the summary's own overview. */
  lead: SummaryBlock[];
  sections: SummarySection[];
}

const rankOf = (kind: DivisionKind | null) => (kind === null ? RANKS.length : RANKS.indexOf(kind));

function divisionOf(heading: string): { kind: DivisionKind; numeral: string } | null {
  const match = DIVISION_HEADING.exec(heading);
  if (!match) return null;
  return { kind: match[1]!.toLowerCase() as DivisionKind, numeral: match[2]!.toLowerCase() };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

/**
 * The first sentence of a paragraph, or null when it has no finished sentence. A period after an
 * abbreviation ("U.S.", "i.e.", a single initial, the CRS's "(Sec. 20001)") does not end the sentence.
 */
export function firstSentence(text: string): string | null {
  const pattern = /[.!?](?=["”’)]?(\s+["“(]?[A-Z0-9]|\s*$))/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const before = text.slice(0, match.index);
    const token = before.slice(before.search(/\S+$/));
    if (/\./.test(token) || /^\(?([A-Z]|Secs?|Nos?|Pub|Stat)$/.test(token)) continue;
    const end = text.slice(match.index + 1).match(/^["”’)]?/)![0].length;
    return text.slice(0, match.index + 1 + end).trim();
  }
  return null;
}

/** About one line on a phone and two on a desktop. */
const GIST_CHARACTERS = 200;
/** A cut closer to the start than this would leave too little to read. */
const GIST_MINIMUM = 40;

/** Where a sentence turns from its main clause to examples or a numbered list. */
const CLAUSE_TURN = /,? (?:including|such as|for example|specifically)\b|;\s|:\s|\s\(1\)\s/gi;
/** Words that cannot end a cut: the cut backs up past them. */
const DANGLING =
  /[\s,;:]+(?:a|an|and|by|for|from|in|including|of|on|or|such as|that|the|to|under|which|with)$/i;

/**
 * A gist from one CRS paragraph: its first sentence, verbatim. When that sentence runs past about 200
 * characters, or never finishes because it leads into a list, it is cut where its main clause ends
 * (before "including", a colon, or a numbered list; else at the last comma that fits), dangling words
 * are dropped, and an ellipsis marks the cut. The result is always the paragraph's own opening words.
 */
export function gistText(paragraph: string): string {
  const sentence = firstSentence(paragraph);
  if (sentence && sentence.length <= GIST_CHARACTERS) return sentence;
  const text = sentence ?? paragraph.trim();
  let cut = text.length;
  for (const turn of text.matchAll(CLAUSE_TURN))
    if (turn.index >= GIST_MINIMUM) {
      cut = turn.index;
      break;
    }
  if (cut > GIST_CHARACTERS) {
    const comma = text.lastIndexOf(", ", GIST_CHARACTERS);
    cut = comma >= GIST_MINIMUM ? comma : text.lastIndexOf(" ", GIST_CHARACTERS);
  }
  // Never inside a parenthesis: "(i.e., the form)" is kept whole or left out.
  const open = text.slice(0, cut).lastIndexOf("(");
  if (open > text.slice(0, cut).lastIndexOf(")")) cut = open;
  let clipped = text.slice(0, cut).trimEnd();
  for (let shorter = clipped.replace(DANGLING, ""); shorter !== clipped;) {
    clipped = shorter;
    shorter = clipped.replace(DANGLING, "");
  }
  return `${clipped.replace(/[\s,;:]+$/, "")}…`;
}

/** "Subtitle A: Tax" as a gist's source: "Subtitle A". */
const divisionLabel = (heading: string) => heading.split(":")[0]!;

/**
 * The first paragraph in a section's text, its subsections included, the path to where it sits, and
 * the kind of division it belongs to. A line that only repeats the section's name ("Military
 * Construction, ... Appropriations Act, 2026") is passed over.
 */
function firstParagraph(
  section: SummarySection,
): { text: string; path: string[]; kind: DivisionKind | null } | null {
  const name = section.heading.split(": ").at(-1)!.toLowerCase();
  const own = section.blocks.find(
    (block) => block.kind !== "heading" && block.lines[0]!.toLowerCase() !== name,
  );
  if (own)
    return own.kind === "paragraph" ? { text: own.lines[0]!, path: [], kind: section.kind } : null;
  for (const child of section.children) {
    const found = firstParagraph(child);
    if (found) return { ...found, path: [divisionLabel(child.heading), ...found.path] };
  }
  return null;
}

/** The CRS's "(Sec. 20001)" before a paragraph about one section of the bill: a locator, not text. */
const SECTION_LOCATOR = /^\(Sec\.\s?(\d+)\)\s*/;

type Gist = Pick<SummarySection, "gist" | "gistFrom" | "gistUnit">;
const NO_GIST: Gist = { gist: null, gistFrom: null, gistUnit: null };

/**
 * A title or top-level section always has a gist: the first sentence of its text, its subsections
 * included. When that sentence is about one bill section ("(Sec. 20001) This section ...") or opens a
 * subsection, it is not the title's own overview, so it carries where it is from and what it
 * describes; the sentence stays verbatim, without its "(Sec. 20001)". Deeper divisions have a gist
 * only when their own text describes them ("This subtitle amends ..."), after any short name line such
 * as "Continuing Appropriations Act, 2026"; a section-level line or a lead-in there gives none.
 */
function gistOf(section: SummarySection, top: boolean): Gist {
  if (top || section.kind === "title") {
    const found = firstParagraph(section);
    if (!found) return NO_GIST;
    const locator = SECTION_LOCATOR.exec(found.text);
    if (locator)
      return {
        gist: gistText(found.text.slice(locator[0].length)),
        gistFrom: `Sec. ${locator[1]}`,
        gistUnit: "section",
      };
    return {
      gist: gistText(found.text),
      gistFrom: found.path.join(", ") || null,
      gistUnit: found.path.length > 0 ? found.kind : null,
    };
  }
  const first = section.blocks.find((block) => block.kind !== "heading");
  if (!section.kind || first?.kind !== "paragraph") return NO_GIST;
  const text = first.lines[0]!;
  if (!new RegExp(`^(This|The) ${section.kind}\\b`, "i").test(text) || !firstSentence(text))
    return NO_GIST;
  return { gist: gistText(text), gistFrom: null, gistUnit: null };
}

/** A CRS paragraph about one section of the bill starts "(Sec. 10101)". */
const SECTION_NOTE = /^\(Sec\.\s?\d/;

const countSections = (section: SummarySection): number =>
  section.blocks.filter((block) => block.kind === "paragraph" && SECTION_NOTE.test(block.lines[0]!))
    .length + section.children.reduce((sum, child) => sum + countSections(child), 0);

function contentsOf(section: SummarySection): string {
  const parts: string[] = [];
  const kinds = new Set(section.children.map((child) => child.kind));
  const kind = kinds.size === 1 ? [...kinds][0] : null;
  const children = section.children.length;
  if (children > 0 && kind) parts.push(`${children} ${kind}${children === 1 ? "" : "s"}`);
  const sections = countSections(section);
  if (sections > 0) parts.push(`${sections} ${sections === 1 ? "section" : "sections"}`);
  return parts.join(", ");
}

/** A heading's name without its division label or "Committee on": "Armed Services". */
const shortName = (heading: string) =>
  heading
    .split(": ")
    .at(-1)!
    .replace(/^Committee on (the )?/, "");

/**
 * A heading as the page's short lists show it: "Title II: Committee on Armed Services" becomes
 * "Title II: Armed Services", so "Committee on" is not read nine times down a rail.
 */
export function shortHeading(heading: string): string {
  const split = heading.indexOf(": ");
  return split < 0 ? heading : `${heading.slice(0, split)}: ${shortName(heading)}`;
}

export interface SectionShare {
  id: string;
  heading: string;
  /** The heading's name without its division label or "Committee on": "Armed Services". */
  name: string;
  /** How many "(Sec. 10101)" paragraphs the section holds, its subsections included. */
  count: number;
  /** Its bar's length, as a fraction of all the sections. Every bar starts at zero. */
  share: number;
}

/**
 * The top-level sections sized by how many bill sections each holds, in the bill's order, for the
 * summary page's bar chart. Null when the text numbers no sections.
 */
export function sectionShares(
  sections: readonly SummarySection[],
): { total: number; rows: SectionShare[] } | null {
  const counts = sections.map(countSections);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;
  const rows = sections.map((section, index) => ({
    id: section.id,
    heading: section.heading,
    name: shortName(section.heading),
    count: counts[index]!,
    share: counts[index]! / total,
  }));
  return { total, rows };
}

const listNames = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;

/**
 * The chart's one-sentence summary for screen readers, from its rows: "Finance is the largest title,
 * with 86 of 207 sections." Titles tied for the most are named together.
 */
export function sharesSummary(
  { total, rows }: { total: number; rows: readonly SectionShare[] },
  noun: string,
): string {
  const most = Math.max(...rows.map((row) => row.count));
  const largest = rows.filter((row) => row.count === most).map((row) => row.name);
  const of = `${most.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${total === 1 ? "section" : "sections"}`;
  return largest.length === 1
    ? `${largest[0]} is the largest ${noun}, with ${of}.`
    : `${listNames(largest)} are the largest ${noun}s, with ${of} each.`;
}

/**
 * Nests summary blocks by division rank. The top level is the largest division the text uses; with no
 * divisions, plain CRS headings become the sections. Returns no sections when there is only one, since
 * a single disclosure would only hide the text.
 */
export function summaryOutline(blocks: readonly SummaryBlock[]): SummaryOutline {
  const divisions = blocks.some(
    (block) => block.kind === "heading" && divisionOf(block.lines[0]!) !== null,
  );
  const lead: SummaryBlock[] = [];
  const roots: SummarySection[] = [];
  const stack: SummarySection[] = [];
  const used = new Set<string>();

  for (const block of blocks) {
    const heading = block.kind === "heading" ? block.lines[0]! : null;
    const division = heading ? divisionOf(heading) : null;
    const opens = heading !== null && (division !== null || !divisions);
    if (!opens) {
      const current = stack.at(-1);
      if (current) current.blocks.push(block);
      else lead.push(block);
      continue;
    }
    const kind = division?.kind ?? null;
    while (stack.length > 0 && rankOf(stack.at(-1)!.kind) >= rankOf(kind)) stack.pop();
    const parent = stack.at(-1);
    const own = division ? `${division.kind}-${division.numeral}` : slug(heading);
    let id = parent ? `${parent.id}-${own}` : own;
    for (let n = 2; used.has(id); n++) id = `${parent ? `${parent.id}-` : ""}${own}-${n}`;
    used.add(id);
    const section: SummarySection = {
      id,
      heading,
      kind,
      gist: null,
      gistFrom: null,
      gistUnit: null,
      contents: "",
      blocks: [],
      children: [],
    };
    (parent ? parent.children : roots).push(section);
    stack.push(section);
  }

  const finish = (section: SummarySection, top: boolean) => {
    Object.assign(section, gistOf(section, top));
    section.contents = contentsOf(section);
    for (const child of section.children) finish(child, false);
  };
  for (const root of roots) finish(root, true);
  if (roots.length < 2) return { lead: [...blocks], sections: [] };
  return { lead, sections: roots };
}
