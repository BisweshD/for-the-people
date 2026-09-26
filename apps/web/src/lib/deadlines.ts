/**
 * The next registration deadline in a state, from vote.gov's wording. Deadlines stay in the official words
 * (counted back from Election Day); only the day count is read, to know which one closes first.
 */

export interface RegistrationDeadlines {
  online: string | null;
  mail: string | null;
  inPerson: string | null;
}

export type Channel = "online" | "by mail" | "in person";

export interface NextDeadline {
  /** Every way to register that shares this exact deadline, in the order online, by mail, in person. */
  channels: Channel[];
  /** vote.gov's wording. */
  wording: string;
}

const CHANNELS: Array<[keyof RegistrationDeadlines, Channel]> = [
  ["online", "online"],
  ["mail", "by mail"],
  ["inPerson", "in person"],
];

/** Days before Election Day in the wording; 0 for "on Election Day"; null when it gives no count. */
export function daysBefore(wording: string): number | null {
  const count = /(\d+) days? before/i.exec(wording);
  if (count) return Number(count[1]);
  return /\bon Election Day\b/i.test(wording) ? 0 : null;
}

/**
 * The deadline that closes first among those still open `daysLeft` days before Election Day. Wording with no
 * day count (same-day registration) comes last. Null when every deadline has passed or none is on file.
 */
export function nextDeadline(
  deadlines: RegistrationDeadlines,
  daysLeft: number | null,
): NextDeadline | null {
  const open = CHANNELS.flatMap(([key, channel]) => {
    const wording = deadlines[key];
    if (!wording) return [];
    const days = daysBefore(wording);
    return daysLeft === null || days === null || days <= daysLeft
      ? [{ channel, wording, days }]
      : [];
  });
  if (open.length === 0) return null;
  const first = Math.max(...open.map((entry) => entry.days ?? -1));
  const closing = open.filter((entry) => (entry.days ?? -1) === first);
  // Channels with the same words read as one line; the wording most of them share leads.
  const byWording = Map.groupBy(closing, (entry) => entry.wording);
  const [wording, entries] = [...byWording].reduce((best, next) =>
    next[1].length > best[1].length ? next : best,
  );
  return { channels: entries.map((entry) => entry.channel), wording };
}
