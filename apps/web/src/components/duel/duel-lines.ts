/** Vote Duel's splits grouped by month, kept apart from the component so it can be tested. */

/** "July 2025", the same on the server and in every browser (a fixed locale and time zone). */
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface MonthGroup<T> {
  /** "2025-07". */
  month: string;
  /** "July 2025". */
  label: string;
  rows: T[];
}

/** Rows already in date order, grouped under their month; the order is kept. */
export function monthGroups<T extends { rollCall: { date: string } }>(
  rows: readonly T[],
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const row of rows) {
    const month = row.rollCall.date.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.rows.push(row);
    else
      groups.push({ month, label: MONTH.format(new Date(`${month}-01T12:00:00Z`)), rows: [row] });
  }
  return groups;
}
