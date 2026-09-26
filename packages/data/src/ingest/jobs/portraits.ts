import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { upsertPerson } from "../../actions/ingestion";
import { workspaceRoot } from "../../db/client";
import * as m from "../../db/mappers";
import { people } from "../../db/schema";
import type { IngestContext } from "../context";
import { portraitRenditions } from "../image";
import { portraitUrl } from "../sources";

/**
 * Official portraits (public domain, unitedstates/images). Downloaded once, converted to AVIF and WebP
 * at two widths, and served from our own origin; never hotlinked. Members without one get initials.
 */

export const PORTRAIT_WIDTHS = [160, 400] as const;
const outputDir = () => join(workspaceRoot(), "apps", "web", "public", "portraits");

/** Some official JPEGs use color encodings the WASM decoder rejects; the smaller official copy usually decodes. */
async function convert(context: IngestContext, bioguide: string, jpeg: Buffer) {
  try {
    return await portraitRenditions(jpeg, PORTRAIT_WIDTHS);
  } catch {
    const small = await context.fetch(portraitUrl(bioguide, "225x275"), { acceptStatuses: [404] });
    if (small.status === 200) {
      try {
        return await portraitRenditions(small.body, PORTRAIT_WIDTHS);
      } catch {
        // Fall through to the note below.
      }
    }
    context.count("portraits.undecodable");
    context.note(
      `The official portrait for ${bioguide} could not be decoded; the initials avatar is shown.`,
    );
    return null;
  }
}

export async function ingestPortraits(context: IngestContext): Promise<void> {
  await mkdir(outputDir(), { recursive: true });
  const rows = await context.db.select().from(people);
  for (const row of rows) {
    const person = m.personFromRow(row);
    const bioguide = person.ids.bioguide;
    if (!bioguide) continue;
    const raw = await context.fetch(portraitUrl(bioguide), { acceptStatuses: [404] });
    if (raw.status === 404) {
      context.count("portraits.missing");
      context.note(`No official portrait for ${bioguide}; the initials avatar is shown.`);
      continue;
    }
    const { source } = await context.fetchWithSource(portraitUrl(bioguide));
    const files = PORTRAIT_WIDTHS.flatMap((width) =>
      ["avif", "webp"].map((ext) => join(outputDir(), `${bioguide}-${width}.${ext}`)),
    );
    if (person.portrait?.sourceId === source.id && files.every((file) => existsSync(file))) {
      context.count("portraits.unchanged");
      continue;
    }
    const renditions = await convert(context, bioguide, raw.body);
    if (!renditions) continue;
    for (const size of renditions.sizes) {
      const base = join(outputDir(), `${bioguide}-${size.width}`);
      await writeFile(`${base}.avif`, size.avif);
      await writeFile(`${base}.webp`, size.webp);
    }
    await context.act(upsertPerson, {
      ...person,
      portrait: {
        asset: `/portraits/${bioguide}`,
        sourceId: source.id,
        placeholder: `data:image/webp;base64,${renditions.placeholder.toString("base64")}`,
      },
      sourceIds: [...new Set([...person.sourceIds, source.id])],
    });
    context.count("portraits.stored");
  }
}
