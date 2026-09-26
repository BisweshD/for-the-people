import {
  districtId,
  houseOfficeId,
  senateOfficeId,
  SERVING_MAP_VERSION,
  StateCode,
  type District,
  type Office,
  type Party,
  type Person,
  type SourceId,
  type Term,
} from "@for-the-people/core";
import * as z from "zod";

/** Parser for unitedstates/congress-legislators (legislators-current.json and legislators-historical.json). */

const CONGRESS_119_START = "2025-01-03";
const CONGRESS_119_END = "2027-01-03";

const rawTermSchema = z.object({
  type: z.enum(["rep", "sen"]),
  start: z.iso.date(),
  end: z.iso.date(),
  state: z.string().length(2),
  district: z.number().int().min(-1).optional(),
  class: z.number().int().min(1).max(3).optional(),
  party: z.string().optional(),
  caucus: z.string().optional(),
  url: z.string().optional(),
  party_affiliations: z
    .array(z.object({ start: z.iso.date(), end: z.iso.date(), party: z.string() }))
    .optional(),
});

const rawLegislatorSchema = z.object({
  id: z.object({
    bioguide: z.string(),
    fec: z.array(z.string()).optional(),
    lis: z.string().optional(),
    govtrack: z.number().int().optional(),
    wikidata: z.string().optional(),
    ballotpedia: z.string().optional(),
  }),
  name: z.object({
    first: z.string(),
    last: z.string(),
    middle: z.string().optional(),
    suffix: z.string().optional(),
    nickname: z.string().optional(),
    official_full: z.string().optional(),
  }),
  terms: z.array(rawTermSchema).min(1),
});

export type RawLegislator = z.infer<typeof rawLegislatorSchema>;

export function toParty(name: string | undefined): Party {
  switch (name) {
    case "Democrat":
    case "Democratic":
      return "D";
    case "Republican":
      return "R";
    case "Independent":
      return "I";
    case "Libertarian":
      return "L";
    case "Green":
      return "G";
    default:
      return "O";
  }
}

/** A term overlaps the 119th Congress when it ends after the Congress began (terms end at noon on January 3). */
const overlaps119 = (term: { start: string; end: string }) =>
  term.end > CONGRESS_119_START && term.start < CONGRESS_119_END;

export interface LegislatorsParse {
  people: Omit<Person, "portrait">[];
  terms: Term[];
  offices: Office[];
  districts: Omit<District, "sourceId">[];
}

function officeFor(term: z.infer<typeof rawTermSchema>, state: StateCode): Office {
  if (term.type === "sen") {
    const seatClass = z.union([z.literal(1), z.literal(2), z.literal(3)]).parse(term.class);
    return {
      id: senateOfficeId(state, seatClass),
      level: "federal",
      chamber: "senate",
      title: "U.S. Senator",
      state,
      seatClass,
    };
  }
  const title =
    state === "PR"
      ? "Resident Commissioner"
      : ["DC", "AS", "GU", "MP", "VI"].includes(state)
        ? "Delegate"
        : "U.S. Representative";
  return {
    id: houseOfficeId(state),
    level: "federal",
    chamber: "house",
    title,
    state,
    seatClass: null,
  };
}

/**
 * Keeps only people who served in the 119th Congress, splits a term wherever the member's
 * party changed (party_affiliations), and records each House term's cd119 district.
 */
export function parseLegislators(json: unknown, sourceId: SourceId): LegislatorsParse {
  const legislators = z.array(rawLegislatorSchema).parse(json);
  const people: LegislatorsParse["people"] = [];
  const terms: Term[] = [];
  const offices = new Map<string, Office>();
  const districts = new Map<string, Omit<District, "sourceId">>();

  for (const legislator of legislators) {
    const serving = legislator.terms.filter(overlaps119);
    if (serving.length === 0) continue;
    const bioguide = legislator.id.bioguide;
    const latest = legislator.terms.at(-1);
    const { name, id } = legislator;
    people.push({
      id: bioguide,
      names: {
        full:
          name.official_full ??
          [name.nickname ?? name.first, name.last, name.suffix].filter(Boolean).join(" "),
        first: name.first,
        last: name.last,
        nickname: name.nickname ?? null,
        suffix: name.suffix ?? null,
      },
      ids: {
        bioguide,
        fec: id.fec ?? [],
        wikidata: id.wikidata ?? null,
        ballotpedia: id.ballotpedia ?? null,
        govtrack: id.govtrack ?? null,
        lis: id.lis ?? null,
      },
      links: latest?.url ? [{ label: "Official website", url: latest.url }] : [],
      sourceIds: [sourceId],
    });

    for (const term of serving) {
      const state = StateCode.parse(term.state);
      const office = officeFor(term, state);
      offices.set(office.id, office);
      let district: string | null = null;
      if (term.type === "rep") {
        const number = Math.max(0, term.district ?? 0);
        district = districtId(state, number, SERVING_MAP_VERSION);
        districts.set(district, {
          id: district,
          state,
          number,
          mapVersion: SERVING_MAP_VERSION,
          geometryRef: null,
        });
      }
      const caucus = term.caucus ? toParty(term.caucus) : null;
      const spans = term.party_affiliations?.filter(overlaps119) ?? [
        { start: term.start, end: term.end, party: term.party ?? "" },
      ];
      for (const span of spans) {
        terms.push({
          id: `${bioguide}:${office.chamber}:${span.start}`,
          personId: bioguide,
          officeId: office.id,
          chamber: office.chamber,
          state,
          districtId: district,
          party: toParty(span.party),
          caucus,
          start: span.start,
          end: span.end,
          sourceIds: [sourceId],
        });
      }
    }
  }
  return { people, terms, offices: [...offices.values()], districts: [...districts.values()] };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where congress-legislators and the House Clerk disagree on the day a Representative left, the Clerk's
 * vacate date wins: it is the official record. Only a House term ending within a week of that date moves.
 */
export function applyClerkVacateDates(
  terms: readonly Term[],
  vacancies: ReadonlyArray<{ bioguide: string; vacated: string }>,
  clerkSourceId: SourceId,
): Term[] {
  const vacated = new Map(vacancies.map((vacancy) => [vacancy.bioguide, vacancy.vacated]));
  return terms.map((term) => {
    const date = vacated.get(term.personId);
    if (term.chamber !== "house" || !date || date === term.end || date < term.start) return term;
    if (Math.abs(Date.parse(date) - Date.parse(term.end)) > 7 * DAY_MS) return term;
    return { ...term, end: date, sourceIds: [...new Set([...term.sourceIds, clerkSourceId])] };
  });
}

/**
 * The crosswalk for people who served in Congress before the 119th: FEC candidate id to bioguide id, from
 * legislators-historical.json. Members of the 119th Congress are left out; they have their own records.
 */
export function formerMembersByFec(json: unknown): Map<string, string> {
  const legislators = z.array(rawLegislatorSchema).parse(json);
  const byFec = new Map<string, string>();
  for (const legislator of legislators) {
    if (legislator.terms.some(overlaps119)) continue;
    for (const fec of legislator.id.fec ?? []) byFec.set(fec, legislator.id.bioguide);
  }
  return byFec;
}
