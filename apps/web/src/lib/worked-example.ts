import {
  computeMatch,
  parseRollCallId,
  type Choice,
  type Match,
  type Position,
  type ScoreKeyVote,
  type Stance,
  type Weight,
} from "@for-the-people/core/client";
import type { KeyVoteRecord } from "@for-the-people/data/read";
import { positionsFor } from "./matching";

/**
 * The methodology page's worked example. By default it scores
 * six made-up key votes, so no real member's record is implied; with "Use my answers" it scores the
 * voter's own answers against one senator. Both run through the same computeMatch the Matches page uses,
 * on the device, so the page shows the published formula doing the real work.
 */

export interface ExampleRollCall {
  id: string;
  date: string;
  yeaSupportsMeasure: boolean;
  decisive: boolean;
  /** The official question was a motion to table (a Yea there opposes the bill). */
  motionToTable: boolean;
  /** The Receipt behind the member's vote; null for the made-up example. */
  receiptId: string | null;
}

export interface ExampleKeyVote {
  id: string;
  issueArea: string;
  title: string;
  rollCalls: ExampleRollCall[];
}

export interface ExampleSenator {
  id: string;
  name: string;
  lastName: string;
  state: string;
}

/** What the page ships for the live version: the key votes, every sitting senator, and their votes. */
export interface ExampleData {
  keyVotes: ExampleKeyVote[];
  senators: ExampleSenator[];
  record: KeyVoteRecord;
}

export interface WorkedRow {
  id: string;
  title: string;
  you: Choice;
  weight: Weight | null;
  /** How the member voted, in words ("Nay on a motion to table", "Not Voting", "No record yet"). */
  memberVoted: string;
  /** The member's recorded position on the roll call shown; null when there is no record. */
  position: Position | null;
  countsAs: "Supports" | "Opposes" | "Not compared";
  /** Null when the key vote is left out of the score. */
  agree: boolean | null;
  receiptId: string | null;
}

export interface Worked {
  rows: WorkedRow[];
  match: Match;
  /** The score as a whole percent; null when nothing could be compared. */
  percent: number | null;
  /** The share without the pull toward 50%, as a whole percent. */
  rawPercent: number | null;
  agreeTerms: Weight[];
  weightTerms: Weight[];
}

const at = (minute: number) => `2026-01-05T15:${String(minute).padStart(2, "0")}:00.000Z`;

/** Six made-up key votes, each with one roll call, and a made-up member's votes on them. */
const SAMPLE_VOTES: Array<{
  label: string;
  you: Choice;
  weight: Weight;
  member: Position;
  motionToTable?: boolean;
}> = [
  { label: "Vote A", you: "Yea", weight: 3, member: "Yea" },
  { label: "Vote B", you: "Nay", weight: 2, member: "Nay" },
  { label: "Vote C", you: "Yea", weight: 1, member: "Nay", motionToTable: true },
  { label: "Vote D", you: "Nay", weight: 2, member: "Yea" },
  { label: "Vote E", you: "Skip", weight: 2, member: "Yea" },
  { label: "Vote F", you: "Yea", weight: 2, member: "NotVoting" },
];

export const SAMPLE = {
  memberId: "X000001",
  keyVotes: SAMPLE_VOTES.map((vote, index): ExampleKeyVote => ({
    id: `kv-example-${index + 1}`,
    issueArea: "example",
    title: vote.label,
    rollCalls: [
      {
        id: `senate-119-1-${9001 + index}`,
        date: "2026-01-05",
        yeaSupportsMeasure: !vote.motionToTable,
        decisive: true,
        motionToTable: Boolean(vote.motionToTable),
        receiptId: null,
      },
    ],
  })),
  stances: SAMPLE_VOTES.map((vote, index): Stance => ({
    keyVoteId: `kv-example-${index + 1}`,
    choice: vote.you,
    weight: vote.weight,
    answeredAt: at(index),
  })),
  positions: new Map<string, Position>(
    SAMPLE_VOTES.map((vote, index) => [`senate-119-1-${9001 + index}`, vote.member]),
  ),
};

const POSITION_WORDS: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "Not Voting",
};

export const toScoreKeyVotes = (keyVotes: readonly ExampleKeyVote[]): ScoreKeyVote[] =>
  keyVotes.map((keyVote) => ({
    id: keyVote.id,
    issueArea: keyVote.issueArea,
    rollCallRefs: keyVote.rollCalls.map((rollCall) => ({
      rollCallId: rollCall.id,
      date: rollCall.date,
      yeaSupportsMeasure: rollCall.yeaSupportsMeasure,
      decisive: rollCall.decisive,
    })),
  }));

/** The roll call to show for a key vote the member was not compared on: the decisive one they sat for. */
function shownRollCall(keyVote: ExampleKeyVote, positions: ReadonlyMap<string, Position>) {
  const held = keyVote.rollCalls.filter((rollCall) => positions.has(rollCall.id));
  return (
    held.find((rollCall) => rollCall.decisive) ?? held.at(-1) ?? keyVote.rollCalls.at(-1) ?? null
  );
}

/**
 * Scores `stances` against one member with computeMatch and lays out every answered key vote as a row
 * of the worked example, in the order of `keyVotes`.
 */
export function workExample(
  stances: readonly Stance[],
  keyVotes: readonly ExampleKeyVote[],
  memberId: string,
  positions: ReadonlyMap<string, Position>,
  /** The member's chamber, so a key vote their chamber never held says so instead of "No record yet". */
  chamber?: "house" | "senate",
): Worked {
  const match = computeMatch({
    stances,
    keyVotes: toScoreKeyVotes(keyVotes),
    member: { personId: memberId as Match["personId"], positions },
  });
  const byKeyVote = new Map(
    match.comparisons.map((comparison) => [comparison.keyVoteId, comparison]),
  );
  const rows: WorkedRow[] = [];
  for (const keyVote of keyVotes) {
    const stance = stances.find((entry) => entry.keyVoteId === keyVote.id);
    if (!stance) continue;
    const comparison = byKeyVote.get(keyVote.id);
    const rollCall = comparison
      ? keyVote.rollCalls.find((entry) => entry.id === comparison.rollCallId)!
      : shownRollCall(keyVote, positions);
    const position = rollCall ? positions.get(rollCall.id) : undefined;
    const heldInChamber =
      !chamber || keyVote.rollCalls.some((entry) => parseRollCallId(entry.id).chamber === chamber);
    const memberVoted = !position
      ? heldInChamber
        ? "No record yet"
        : `No ${chamber === "senate" ? "Senate" : "House"} vote`
      : rollCall && !rollCall.yeaSupportsMeasure && (position === "Yea" || position === "Nay")
        ? `${POSITION_WORDS[position]} on ${rollCall.motionToTable ? "a motion to table" : "a motion against the bill"}`
        : POSITION_WORDS[position];
    rows.push({
      id: keyVote.id,
      title: keyVote.title,
      you: stance.choice,
      weight: stance.choice === "Skip" ? null : stance.weight,
      memberVoted,
      position: position ?? null,
      countsAs: comparison ? (comparison.memberSupports ? "Supports" : "Opposes") : "Not compared",
      agree: comparison ? comparison.agree : null,
      receiptId: position && rollCall ? rollCall.receiptId : null,
    });
  }
  const agreeTerms = match.comparisons.filter((entry) => entry.agree).map((entry) => entry.weight);
  const weightTerms = match.comparisons.map((entry) => entry.weight);
  const sum = (terms: Weight[]) => terms.reduce<number>((total, weight) => total + weight, 0);
  return {
    rows,
    match,
    percent: match.score === null ? null : Math.round(match.score * 100),
    rawPercent:
      match.n === 0 ? null : Math.round((sum(agreeTerms) / Math.max(1, sum(weightTerms))) * 100),
    agreeTerms,
    weightTerms,
  };
}

export type PickedSenator = { senator: ExampleSenator; why: "your-senator" | "closest" };

/**
 * The senator the live example compares the voter with: one of their own senators when a location is
 * saved (the one who shares more votes with them), otherwise the senator whose votes are closest to the
 * voter's answers, ranked as Matches ranks (score, then shared votes, then last name).
 */
export function pickSenator(
  stances: readonly Stance[],
  state: string | null,
  data: ExampleData,
): PickedSenator | null {
  const keyVotes = toScoreKeyVotes(data.keyVotes);
  const scored = data.senators.map((senator) => ({
    senator,
    match: computeMatch({
      stances,
      keyVotes,
      member: {
        personId: senator.id as Match["personId"],
        positions: positionsFor(data.record, senator.id),
      },
    }),
  }));
  const ranked = scored
    .filter(({ match }) => match.n > 0)
    .toSorted(
      (a, b) =>
        (b.match.score ?? 0) - (a.match.score ?? 0) ||
        b.match.n - a.match.n ||
        a.senator.lastName.localeCompare(b.senator.lastName),
    );
  const own = scored
    .filter(({ senator }) => senator.state === state)
    .toSorted(
      (a, b) => b.match.n - a.match.n || a.senator.lastName.localeCompare(b.senator.lastName),
    );
  if (own[0]) return { senator: own[0].senator, why: "your-senator" };
  if (ranked[0]) return { senator: ranked[0].senator, why: "closest" };
  return null;
}
