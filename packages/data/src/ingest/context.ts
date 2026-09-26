import { randomUUID } from "node:crypto";
import type { ActionContext, ActionResult, Source } from "@for-the-people/core";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { attachSource } from "../actions/ingestion";
import { type ActionSpec, runAction } from "../actions/runner";
import type { Db } from "../db/client";
import { ingestionRuns } from "../db/schema";
import { rawCacheDir } from "../env";
import { fetchRaw, sha256, type FetchRawOptions, type RawResponse } from "./fetch";

/** Shared plumbing for ingestion jobs: fetching with provenance, running actions, and run bookkeeping. */

const PUBLISHERS: Array<[RegExp, string]> = [
  [/^https:\/\/clerk\.house\.gov\//, "Office of the Clerk, U.S. House of Representatives"],
  [/^https:\/\/www\.senate\.gov\//, "U.S. Senate"],
  [/^https:\/\/www\.govinfo\.gov\//, "U.S. Government Publishing Office (GovInfo)"],
  [/^https:\/\/api\.congress\.gov\//, "Library of Congress (Congress.gov)"],
  [/^https:\/\/(api\.open|www)\.fec\.gov\//, "Federal Election Commission"],
  [
    /^https:\/\/raw\.githubusercontent\.com\/unitedstates\/congress-legislators\//,
    "unitedstates/congress-legislators (public domain)",
  ],
  [
    /^https:\/\/raw\.githubusercontent\.com\/unitedstates\/images\//,
    "unitedstates/images (public domain, from the Government Publishing Office)",
  ],
  [/^https:\/\/(geocoding\.geo|www2)\.census\.gov\//, "U.S. Census Bureau"],
];

export function publisherFor(url: string): string {
  const match = PUBLISHERS.find(([pattern]) => pattern.test(url));
  if (!match) throw new Error(`No publisher known for ${url}`);
  return match[1];
}

export const sourceIdFor = (url: string, contentHash: string): string =>
  `src_${sha256(`${url}\n${contentHash}`).slice(0, 16)}`;

export function sourceFromRaw(raw: RawResponse, notes: string | null = null): Source {
  return {
    id: sourceIdFor(raw.url, raw.contentHash),
    publisher: publisherFor(raw.url),
    url: raw.url,
    retrievedAt: raw.retrievedAt,
    contentHash: raw.contentHash,
    notes,
  };
}

export interface JobReport {
  stats: Record<string, number>;
  notes: string[];
}

export class IngestContext {
  readonly report: JobReport = { stats: {}, notes: [] };
  readonly actionContext: ActionContext;

  constructor(
    readonly db: Db,
    readonly job: string,
    readonly now = new Date(),
  ) {
    this.actionContext = {
      actor: { kind: "ingestion", id: job },
      reason: `Scheduled ingestion: ${job}`,
      now,
    };
  }

  count(stat: string, by = 1): void {
    this.report.stats[stat] = (this.report.stats[stat] ?? 0) + by;
  }

  note(message: string): void {
    this.report.notes.push(message);
  }

  fetch(url: string, options: Omit<FetchRawOptions, "cacheDir"> = {}): Promise<RawResponse> {
    return fetchRaw(url, { cacheDir: rawCacheDir(), ...options });
  }

  /** Fetches and records a Source row for the exact bytes received. */
  async fetchWithSource(
    url: string,
    options: Omit<FetchRawOptions, "cacheDir"> = {},
  ): Promise<{ raw: RawResponse; source: Source }> {
    const raw = await this.fetch(url, options);
    const source = sourceFromRaw(raw);
    await this.act(attachSource, source);
    return { raw, source };
  }

  /** Runs an action and tallies the outcome; invalid or rejected input becomes a note, never a silent drop. */
  async act<S extends z.ZodType, R>(
    spec: ActionSpec<S, R>,
    input: unknown,
  ): Promise<ActionResult<R>> {
    const result = await runAction(this.db, spec, input, this.actionContext);
    if (result.ok) this.count(result.eventId ? `${spec.name}.written` : `${spec.name}.unchanged`);
    else {
      this.count(`${spec.name}.rejected`);
      const detail =
        result.error.code === "invalid"
          ? result.error.issues.slice(0, 3).join("; ")
          : result.error.message;
      this.note(`${spec.name} rejected: ${detail}`);
    }
    return result;
  }
}

/** Wraps a job in an IngestionRun row that /status reads. */
export async function withIngestionRun(
  db: Db,
  job: string,
  work: (context: IngestContext) => Promise<void>,
): Promise<JobReport> {
  const context = new IngestContext(db, job);
  const id = `run_${context.now.getTime().toString(36)}_${randomUUID().slice(0, 6)}`;
  await db.insert(ingestionRuns).values({
    id,
    job,
    startedAt: context.now.toISOString(),
    finishedAt: null,
    status: "running",
    stats: {},
    notes: [],
    error: null,
  });
  let error: string | null = null;
  try {
    await work(context);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : JSON.stringify(caught);
  }
  const rejected = Object.entries(context.report.stats).some(
    ([key, value]) => key.endsWith(".rejected") && value > 0,
  );
  await db
    .update(ingestionRuns)
    .set({
      finishedAt: new Date().toISOString(),
      status: error ? "failed" : rejected ? "partial" : "succeeded",
      stats: context.report.stats,
      notes: context.report.notes.slice(0, 200),
      error,
    })
    .where(eq(ingestionRuns.id, id));
  if (error) throw new Error(`${job} failed: ${error}`);
  return context.report;
}
