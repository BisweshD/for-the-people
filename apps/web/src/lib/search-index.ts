import { personIdToSlug, PARTY_NAMES, type Party } from "@for-the-people/core/client";
import type { SearchSource } from "@for-the-people/data/read/search";
import { districtLabel, measureLabel, officeLine, STATE_NAMES } from "./format";

/**
 * The ⌘K search index: a compact, serializable view of people, bills, and districts. Built on the
 * server, served from a cached GET route, and fetched by the palette the first time it opens.
 */

export interface SearchPerson {
  slug: string;
  name: string;
  office: string;
  party: Party;
  /** Portrait asset base path (add "-160.webp"), or null for the initials fallback. */
  portrait: string | null;
  serving: boolean;
  keywords: string[];
}

export interface SearchBill {
  id: string;
  label: string;
  title: string;
  keywords: string[];
}

export interface SearchDistrict {
  label: string;
  personSlug: string;
  personName: string;
  party: Party;
  keywords: string[];
}

export interface SearchIndex {
  people: SearchPerson[];
  bills: SearchBill[];
  districts: SearchDistrict[];
}

const MAX_TITLE = 180;

/** Long official titles are cut at a word boundary; the full title is on the bill page. */
export function shortTitle(title: string): string {
  if (title.length <= MAX_TITLE) return title;
  const cut = title.slice(0, MAX_TITLE);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function toSearchIndex(source: SearchSource): SearchIndex {
  const people = source.members
    .toSorted(
      (a, b) => Number(b.serving) - Number(a.serving) || a.lastName.localeCompare(b.lastName),
    )
    .map((member) => ({
      slug: personIdToSlug(member.id),
      name: member.name,
      office: member.serving ? officeLine(member) : `Former member, ${officeLine(member)}`,
      party: member.party,
      portrait: member.portrait?.asset ?? null,
      serving: member.serving,
      keywords: [member.lastName, STATE_NAMES[member.state], PARTY_NAMES[member.party]],
    }));

  const bills = source.measures.map((measure) => {
    const label = measureLabel(measure.id);
    return {
      id: measure.id,
      label,
      title: shortTitle(measure.title),
      keywords: [label.replace(/\./g, ""), ...measure.otherTitles.map(shortTitle)],
    };
  });

  const districts = source.members
    .filter((member) => member.serving && member.chamber === "house" && member.district !== null)
    .map((member) => {
      const label = districtLabel(member.state, member.district);
      const number = member.district ?? 0;
      return {
        label,
        personSlug: personIdToSlug(member.id),
        personName: member.name,
        party: member.party,
        keywords: [
          `${member.state}-${number}`,
          `${member.state}${number}`,
          `${STATE_NAMES[member.state]} ${number === 0 ? "at-large" : `district ${number}`}`,
        ],
      };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));

  return { people, bills, districts };
}
