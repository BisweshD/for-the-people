import { LOW_CONFIDENCE_N, type StateCode } from "@for-the-people/core/client";

/**
 * Explore's list order, its one-sentence explanation, and the per-state numbers behind the map.
 * Pure functions, so the ranking and the map can be tested without a browser.
 */

/** How the member list is ordered: A to Z, by overall match, or by match on the selected issue. */
export type Ranking = "name" | "overall" | "issue";

/** The part of a Match (or an IssueMatch) the list ranks by. */
export interface Scored {
  score: number | null;
  n: number;
  agreements: number;
}

export function rankMembers<T extends { member: { lastName: string }; scored: Scored | null }>(
  rows: readonly T[],
  ranking: Ranking,
): T[] {
  const byName = (a: T, b: T) => a.member.lastName.localeCompare(b.member.lastName);
  if (ranking === "name") return rows.toSorted(byName);
  const value = (row: T) => row.scored?.score ?? -1;
  // A few shared votes must not outrank a long record (the same bar as Matches): members who share
  // at least LOW_CONFIDENCE_N votes, or as many as anyone shares on this issue, come first.
  const most = Math.max(0, ...rows.map((row) => row.scored?.n ?? 0));
  const bar = Math.min(LOW_CONFIDENCE_N, most);
  const confident = (row: T) => ((row.scored?.n ?? 0) >= bar && row.scored?.score != null ? 1 : 0);
  return rows.toSorted(
    (a, b) =>
      confident(b) - confident(a) ||
      value(b) - value(a) ||
      (b.scored?.n ?? 0) - (a.scored?.n ?? 0) ||
      byName(a, b),
  );
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The one plain sentence under the list heading that says how the list is ordered. `action` is the
 * part of it that links to answering key votes, when there is one.
 */
export function rankingSentence({
  ranking,
  answered,
  issueLabel,
}: {
  ranking: Ranking;
  /** Answers behind the ranking: all of them, or only those on the selected issue. */
  answered: number;
  issueLabel: string | null;
}): { text: string; action: string | null } {
  const topic = issueLabel?.toLowerCase() ?? null;
  if (ranking === "name") {
    const action = topic ? `answer the ${topic} key votes` : "answer some key votes";
    return { text: `Listed A to Z by last name until you ${action}.`, action };
  }
  const on = ranking === "issue" && topic ? ` on ${topic}` : "";
  const ties = answered < LOW_CONFIDENCE_N ? ", so many members tie" : "";
  return {
    text: `Ranked by how often they voted your way${on}, based on your ${answered} Yea or Nay ${plural(answered, "answer", "answers")}${ties}.`,
    action: null,
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export interface StateSummary {
  /** Members in view from this state. */
  count: number;
  /** Members with a value (a match score, or a party-line record). */
  scored: number;
  median: number | null;
}

export function summarizeStates(
  entries: ReadonlyArray<{ state: StateCode; value: number | null }>,
): Map<StateCode, StateSummary> {
  const values = new Map<StateCode, { count: number; values: number[] }>();
  for (const { state, value } of entries) {
    const entry = values.get(state) ?? { count: 0, values: [] };
    entry.count += 1;
    if (value !== null) entry.values.push(value);
    values.set(state, entry);
  }
  return new Map(
    [...values].map(([state, entry]) => [
      state,
      { count: entry.count, scored: entry.values.length, median: median(entry.values) },
    ]),
  );
}

export interface StateMedian {
  state: StateCode;
  median: number;
}

/** The states with the highest and lowest median; on a tie, the larger delegation, then A to Z. */
export function highAndLow(summaries: ReadonlyMap<StateCode, StateSummary>): {
  high: StateMedian | null;
  low: StateMedian | null;
} {
  const ranked = [...summaries]
    .filter(([, summary]) => summary.median !== null)
    .map(([state, summary]) => ({ state, median: summary.median!, count: summary.scored }));
  const pick = (direction: 1 | -1) =>
    ranked.toSorted(
      (a, b) =>
        direction * (b.median - a.median) || b.count - a.count || a.state.localeCompare(b.state),
    )[0];
  const high = pick(1);
  const low = pick(-1);
  return {
    high: high ? { state: high.state, median: high.median } : null,
    low: low ? { state: low.state, median: low.median } : null,
  };
}

/** A map fill: a token color and its strength. "even" is the neutral middle of the match scale. */
export interface Shade {
  tone: "agree" | "split" | "even" | "ink";
  opacity: number;
}

/** The diverging match scale (PRGn): its steps and the labels the legend prints under them. */
export const MATCH_STEPS: ReadonlyArray<{ upTo: number; shade: Shade; label: string }> = [
  { upTo: 29, shade: { tone: "split", opacity: 0.85 }, label: "Under 30%" },
  { upTo: 44, shade: { tone: "split", opacity: 0.42 }, label: "30 to 44%" },
  { upTo: 55, shade: { tone: "even", opacity: 0.32 }, label: "45 to 55%" },
  { upTo: 70, shade: { tone: "agree", opacity: 0.42 }, label: "56 to 70%" },
  { upTo: 100, shade: { tone: "agree", opacity: 0.85 }, label: "Over 70%" },
];

export function matchShade(value: number): Shade {
  // Steps are in whole percents, so a state labeled "55%" is never shaded as "56 to 70%".
  const percent = Math.round(value * 100);
  return (MATCH_STEPS.find((step) => percent <= step.upTo) ?? MATCH_STEPS.at(-1)!).shade;
}

/** Five steps of one ink tone. */
export const RANK_OPACITY = [0.12, 0.22, 0.34, 0.48, 0.64] as const;

/**
 * Shading by rank: each of the five steps holds about a fifth of the values on the map, so states
 * whose medians sit close together (party-line votes cluster near 97%) still read apart. Ties share
 * a step. The printed numbers carry the exact values.
 */
export function rankShade(value: number, values: readonly number[]): Shade {
  // With nothing to rank against (one value, or all equal), every state takes the full shade.
  const spread = values.some((other) => other !== values[0]);
  const below = values.filter((other) => other < value).length;
  const level = spread ? Math.min(4, Math.floor((below / values.length) * 5)) : 4;
  return { tone: "ink", opacity: RANK_OPACITY[level]! };
}

/**
 * Places a column of labels (the map's northeast callouts) at least `pitch` apart. `anchors` are the
 * ideal positions in ascending order; crowded labels form a block centered on their anchors, kept
 * between `min` and `max`.
 */
export function stackLabels(
  anchors: readonly number[],
  pitch: number,
  min: number,
  max: number,
): number[] {
  const clusters: Array<{ top: number; members: number[] }> = [];
  const place = (members: number[]) => {
    const ideal =
      members.reduce((sum, anchor, index) => sum + anchor - index * pitch, 0) / members.length;
    const lowest = max - (members.length - 1) * pitch;
    return Math.max(min, Math.min(lowest, ideal));
  };
  for (const anchor of anchors) {
    clusters.push({ top: place([anchor]), members: [anchor] });
    while (clusters.length > 1) {
      const last = clusters.at(-1)!;
      const previous = clusters.at(-2)!;
      if (previous.top + previous.members.length * pitch <= last.top) break;
      clusters.splice(-2, 2, {
        top: place([...previous.members, ...last.members]),
        members: [...previous.members, ...last.members],
      });
    }
  }
  return clusters.flatMap(({ top, members }) => members.map((_, index) => top + index * pitch));
}
