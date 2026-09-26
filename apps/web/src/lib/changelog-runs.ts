/** Runs of one data update this close together share a changelog row. */
export const RUN_WINDOW_MINUTES = 10;

/**
 * Newest-first changelog entries as rows. Runs of the same data update that follow each other within
 * RUN_WINDOW_MINUTES (a retry, or a schedule tick that started a job twice) share one row, even when
 * other changes were logged between them; every other entry is a row of its own. Rows keep the order
 * of their newest entry, and each row lists its entries newest first.
 */
export function runRows<T extends { kind: string; job: string | null; at: string }>(
  entries: readonly T[],
): T[][] {
  const rows: T[][] = [];
  const open = new Map<string, T[]>();
  for (const entry of entries) {
    if (entry.kind !== "ingestion" || entry.job === null) {
      rows.push([entry]);
      continue;
    }
    const row = open.get(entry.job);
    const gap = row ? Date.parse(row.at(-1)!.at) - Date.parse(entry.at) : Infinity;
    if (row && gap <= RUN_WINDOW_MINUTES * 60_000) row.push(entry);
    else {
      const fresh = [entry];
      open.set(entry.job, fresh);
      rows.push(fresh);
    }
  }
  return rows;
}
