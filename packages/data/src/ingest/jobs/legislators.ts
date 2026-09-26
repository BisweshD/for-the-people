import { upsertDistrictMap, upsertPerson, upsertTerm } from "../../actions/ingestion";
import type { IngestContext } from "../context";
import { parseMemberDataVacancies } from "../parsers/clerk";
import { applyClerkVacateDates, parseLegislators } from "../parsers/legislators";
import { clerkMemberDataUrl, legislatorsCurrentUrl, legislatorsHistoricalUrl } from "../sources";

const HALF_DAY = 12 * 60 * 60 * 1000;

/**
 * Members of the 119th Congress (current and departed), their terms, offices, and cd119 districts. A House
 * term's end date follows the Clerk's vacate date where the two sources disagree.
 */
export async function ingestLegislators(context: IngestContext): Promise<void> {
  const clerk = await context.fetchWithSource(clerkMemberDataUrl, { maxAgeMs: HALF_DAY });
  const vacancies = parseMemberDataVacancies(clerk.raw.body.toString("utf8"));
  context.count("clerk.vacancies", vacancies.length);
  for (const url of [legislatorsCurrentUrl, legislatorsHistoricalUrl]) {
    const { raw, source } = await context.fetchWithSource(url, { maxAgeMs: HALF_DAY });
    const parsed = parseLegislators(JSON.parse(raw.body.toString("utf8")), source.id);
    context.count(
      `people.${url.endsWith("current.json") ? "current" : "historical"}`,
      parsed.people.length,
    );

    for (const person of parsed.people)
      await context.act(upsertPerson, { ...person, portrait: null });
    if (parsed.districts.length > 0) {
      await context.act(upsertDistrictMap, {
        mapVersion: "cd119",
        districts: parsed.districts.map((district) => ({ ...district, sourceId: source.id })),
      });
    }
    const offices = new Map(parsed.offices.map((office) => [office.id, office]));
    for (const term of applyClerkVacateDates(parsed.terms, vacancies, clerk.source.id)) {
      const office = offices.get(term.officeId);
      if (!office) throw new Error(`Term ${term.id} has no office`);
      await context.act(upsertTerm, { term, office });
    }
  }
}
