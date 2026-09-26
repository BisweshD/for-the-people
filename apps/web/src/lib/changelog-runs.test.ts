import { describe, expect, test } from "vitest";
import { runRows } from "./changelog-runs";

const run = (id: string, job: string, at: string) => ({ id, kind: "ingestion", job, at });
const step = (id: string, at: string) => ({ id, kind: "keyVote", job: null, at });

const ids = (rows: Array<Array<{ id: string }>>) => rows.map((row) => row.map((entry) => entry.id));

describe("changelog run rows", () => {
  test("runs of one update within 10 minutes share a row, even with other changes between", () => {
    const rows = runRows([
      run("keyvotes-b", "keyvotes", "2026-09-24T01:52:00Z"),
      run("stats-b", "stats", "2026-09-24T01:49:00Z"),
      step("publish", "2026-09-24T01:48:30Z"),
      run("keyvotes-a", "keyvotes", "2026-09-24T01:46:00Z"),
      run("stats-a", "stats", "2026-09-24T01:44:00Z"),
    ]);
    expect(ids(rows)).toEqual([["keyvotes-b", "keyvotes-a"], ["stats-b", "stats-a"], ["publish"]]);
  });

  test("a chain of retries stays one row; a run more than 10 minutes on starts a new one", () => {
    const rows = runRows([
      run("votes-d", "votes", "2026-09-24T02:30:00Z"),
      run("votes-c", "votes", "2026-09-24T02:05:00Z"),
      run("votes-b", "votes", "2026-09-24T01:57:00Z"),
      run("votes-a", "votes", "2026-09-24T01:47:00Z"),
    ]);
    expect(ids(rows)).toEqual([["votes-d"], ["votes-c", "votes-b", "votes-a"]]);
  });

  test("different updates and key-vote steps never merge", () => {
    const rows = runRows([
      run("votes", "votes", "2026-09-24T01:47:00Z"),
      run("stats", "stats", "2026-09-24T01:46:00Z"),
      step("verify", "2026-09-24T01:45:00Z"),
      step("propose", "2026-09-24T01:45:00Z"),
    ]);
    expect(ids(rows)).toEqual([["votes"], ["stats"], ["verify"], ["propose"]]);
  });
});
