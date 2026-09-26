import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Source } from "@for-the-people/core";
import { ElectionDatesFile } from "@for-the-people/core/calendar";
import { workspaceRoot } from "../db/client";

/**
 * Election hub reads: registration deadlines and official links for every state, from the curated file
 * data/election-dates.json (read from vote.gov, validated on every load).
 */

export async function electionDates(): Promise<ElectionDatesFile> {
  const raw = await readFile(join(workspaceRoot(), "data", "election-dates.json"), "utf8");
  return ElectionDatesFile.parse(JSON.parse(raw));
}

/** The Receipt for one state's entry, so /api/receipts resolves election facts like any other. */
export async function electionSource(id: string): Promise<Source | null> {
  const file = await electionDates();
  return file.states.find((entry) => entry.source.id === id)?.source ?? null;
}
