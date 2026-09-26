import type { Match } from "@for-the-people/core/client";

/**
 * Tied ranks, shared by Matches and the Swipe rail. Members are grouped by what the reader sees (the
 * rounded percent), so two rows that both say "74%" are never ranked apart.
 */

export interface RankedEntry<M> {
  member: M;
  match: Match;
}

export interface Tier<M> {
  key: string;
  /** The first member's exact score. */
  score: number;
  /** The rounded percent every member in the tier shows. */
  percent: number;
  entries: Array<RankedEntry<M>>;
}

const percentOf = (match: Match) => Math.round((match.score ?? 0) * 100);

/**
 * Groups ranked entries (best first) into tiers, starting new tiers until `target` members are shown.
 * A tier that starts before the target keeps all its members.
 */
export function groupTies<M>(
  entries: ReadonlyArray<RankedEntry<M>>,
  target: number,
): Array<Tier<M>> {
  const groups = new Map<string, Tier<M>>();
  let shown = 0;
  for (const entry of entries) {
    const percent = percentOf(entry.match);
    const key = String(percent);
    const tier = groups.get(key);
    if (tier) tier.entries.push(entry);
    else {
      if (shown >= target) continue;
      groups.set(key, { key, score: entry.match.score ?? 0, percent, entries: [entry] });
    }
    shown += 1;
  }
  return [...groups.values()];
}

export interface RailGroup<M> {
  key: string;
  /** A tie: every row shows `percent`, under one "Tied at" label that covers these rows only. */
  tie: boolean;
  /** The first row's percent. */
  percent: number;
  rows: Array<RankedEntry<M>>;
  /** Tied members past the rail's room, counted instead of listed. */
  more: number;
}

/**
 * The Swipe rail: at most `room` rows. A tie is its own group, so its label never sits over a row at
 * another percent; rows that tie with no one run together in a plain group.
 */
export function railGroups<M>(
  entries: ReadonlyArray<RankedEntry<M>>,
  room: number,
): Array<RailGroup<M>> {
  const groups: Array<RailGroup<M>> = [];
  let left = room;
  for (const tier of groupTies(entries, room)) {
    if (left === 0) break;
    const rows = tier.entries.slice(0, left);
    left -= rows.length;
    const tie = tier.entries.length > 1;
    const last = groups.at(-1);
    if (!tie && last && !last.tie) last.rows.push(...rows);
    else
      groups.push({
        key: tier.key,
        tie,
        percent: tier.percent,
        rows,
        more: tier.entries.length - rows.length,
      });
  }
  return groups;
}

export interface Count {
  agreements: number;
  n: number;
}

/** The distinct "X of Y" counts in a tie, fewest shared votes first, then fewest agreements. */
export function tieCounts(matches: readonly Match[]): Count[] {
  const seen = new Map<string, Count>();
  for (const { agreements, n } of matches) seen.set(`${agreements}/${n}`, { agreements, n });
  return [...seen.values()].toSorted((a, b) => a.n - b.n || a.agreements - b.agreements);
}

function listJoin(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/**
 * One sentence under a tie. When everyone shares one count it says so; when the tie mixes counts it
 * names each, so "74%" next to "8 of 11" and "9 of 11" never looks like a mistake.
 */
export function tieExplainer(percent: number, matches: readonly Match[]): string {
  const detail = tieDetail(matches);
  if (tieCounts(matches).length === 1) return detail;
  return `Tied at ${percent}%: ${detail[0]!.toLowerCase()}${detail.slice(1)}`;
}

/**
 * The same sentence for a tie whose heading already says "Tied at 74%". Mixed counts tie because of
 * the pull toward 50% (k = 2) and rounding to a whole percent, and also the voter's weights when the
 * compared votes carry more than one weight; the sentence names only the causes at work.
 */
export function tieDetail(matches: readonly Match[]): string {
  const counts = tieCounts(matches);
  if (counts.length === 1) {
    const { agreements, n } = counts[0]!;
    return `${matches.length} members agree with you on ${agreements} of ${n} ${n === 1 ? "vote" : "votes"}.`;
  }
  const named = listJoin(counts.map(({ agreements, n }) => `${agreements} of ${n}`));
  const weights = new Set(
    matches.flatMap((match) => match.comparisons.map((comparison) => comparison.weight)),
  );
  return weights.size > 1
    ? `${named} land on the same percent because votes you care more about count more and scores stay near 50% when few votes are shared.`
    : `${named} land on the same percent because scores stay near 50% when few votes are shared and percents are rounded.`;
}

export interface IssueAgreement {
  issueArea: string;
  /** "2 of 2", or "1 to 2 of 3" when members in the group differ. */
  label: string;
}

const span = (low: number, high: number) => (low === high ? `${low}` : `${low} to ${high}`);

/** Fewer shared votes than this on an issue is too thin to call agreement "on" that issue. */
const MIN_ISSUE_VOTES = 2;

/**
 * "Where you agree most": agreement by issue across a group (one member or a tie), the issues with the
 * highest share of agreement first, then the most shared votes. An issue counts only the members who
 * share at least two votes on it, so a single vote never reads as a pattern.
 */
export function issueAgreement(matches: readonly Match[]): IssueAgreement[] {
  const byIssue = new Map<string, { agreements: number[]; n: number[] }>();
  for (const match of matches) {
    for (const issue of match.byIssue) {
      if (issue.n < MIN_ISSUE_VOTES) continue;
      const entry = byIssue.get(issue.issueArea) ?? { agreements: [], n: [] };
      entry.agreements.push(issue.agreements);
      entry.n.push(issue.n);
      byIssue.set(issue.issueArea, entry);
    }
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const rate = ({ agreements, n }: { agreements: number[]; n: number[] }) =>
    sum(agreements) / sum(n);
  return [...byIssue]
    .toSorted(
      ([issueA, a], [issueB, b]) =>
        rate(b) - rate(a) || Math.max(...b.n) - Math.max(...a.n) || issueA.localeCompare(issueB),
    )
    .map(([issueArea, { agreements, n }]) => ({
      issueArea,
      label: `${span(Math.min(...agreements), Math.max(...agreements))} of ${span(Math.min(...n), Math.max(...n))}`,
    }));
}

/**
 * The one short note on a tie whose rows show different counts ("8 of 10" and "4 of 5" both at 75%),
 * naming only the causes at work. A tie where every row shows the same count needs no note.
 */
export function tieNote(matches: readonly Match[]): string | null {
  if (tieCounts(matches).length === 1) return null;
  const weights = new Set(
    matches.flatMap((match) => match.comparisons.map((comparison) => comparison.weight)),
  );
  return weights.size > 1
    ? "Scores lean toward 50% until you share more votes, and votes you care more about count more."
    : "Scores lean toward 50% until you share more votes, and percents are rounded.";
}
