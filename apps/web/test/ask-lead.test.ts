import { numbersInText, numbersInValue, type Position } from "@for-the-people/core";
import { describe, expect, test } from "vitest";
import type { AskPerson, AskVote, GetVotesOutput, SharedMatch } from "../src/lib/ask-types";
import type { CardView, RollCallView } from "../src/lib/views";
import { classifyQuestion, planStep } from "../src/server/ask/mock-model";
import { compact, GetVotesInput, memberVotes, tallyVotes } from "../src/server/ask/tools";

/**
 * Ask's lead sentence for "How has X voted?" (design review round 4, fix 6): a summary of the listed
 * key votes built only from counts in the tool result the model reads, never one arbitrary vote.
 */

const rollCall = (id: string, chamber: "house" | "senate", number: number): RollCallView => ({
  id,
  chamber,
  number,
  date: "2025-04-02",
  question: "On Passage",
  result: "Passed",
  totals: { yea: 51, nay: 48, present: 0, notVoting: 1 },
  tieBreaker: null,
  officialUrl: "https://www.senate.gov/",
  yeaSupportsMeasure: true,
  decisive: true,
  verification: { status: "verified", checkedAt: "2026-09-01", notes: null },
  measureLabel: null,
  receipt: {
    sourceId: `src-${id}`,
    publisher: "U.S. Senate",
    url: "https://www.senate.gov/",
    retrievedAt: "2026-09-01T00:00:00.000Z",
  },
});

const vote = (
  index: number,
  position: Position | null,
  heldOnlyIn: "house" | "senate" | null = null,
): AskVote => ({
  keyVoteId: `kv-${index}`,
  title: `Key vote ${index}`,
  issue: { id: "trade", label: "Trade and tariffs" },
  side: position
    ? {
        position,
        rollCall: rollCall(`senate-119-1-${index}`, "senate", 100 + index),
        supportsMeasure: position === "Yea" ? true : position === "Nay" ? false : null,
      }
    : null,
  heldOnlyIn,
  heldOnlyRollCall: heldOnlyIn ? rollCall(`${heldOnlyIn}-119-1-${index}`, heldOnlyIn, index) : null,
});

const person = (sharedMatch: SharedMatch | null): AskPerson => ({
  member: {
    id: "C001098",
    name: "Ted Cruz",
    lastName: "Cruz",
    party: "R",
    state: "TX",
    chamber: "senate",
    district: null,
    title: "Sen.",
    serving: true,
    portrait: null,
  },
  receiptId: "src-term",
  keyVotePositions: {},
  sharedMatch,
});

/** Ten Yea or Nay votes and four key votes with only a House roll call. */
const CRUZ_VOTES: AskVote[] = [
  ...Array.from({ length: 10 }, (_, index) => vote(index, index % 3 === 0 ? "Nay" : "Yea")),
  ...Array.from({ length: 4 }, (_, index) => vote(10 + index, null, "house")),
];

function output(votes: AskVote[], match: SharedMatch | null = null): GetVotesOutput {
  return { person: person(match), issue: null, votes, tally: tallyVotes(votes) };
}

/** The demo model's final sentences for a question, given the getVotes result it would receive. */
function lead(question: string, result: GetVotesOutput): string {
  const intent = classifyQuestion(question);
  const found = { toolName: "findPeople", value: compact.findPeople({ people: [result.person!] }) };
  const votes = { toolName: "getVotes", value: compact.getVotes(result) };
  const step = planStep(intent, [found, votes] as never);
  if (!("text" in step)) throw new Error("expected text");
  return step.text;
}

const numbersAllowed = (text: string, result: GetVotesOutput) => {
  const allowed = numbersInValue([compact.getVotes(result)]);
  return [...numbersInText(text)].filter((number) => !allowed.has(number));
};

describe("tallyVotes", () => {
  test("counts each kind of VotePosition and the key votes the member could not vote on", () => {
    const votes = [
      vote(1, "Yea"),
      vote(2, "Nay"),
      vote(3, "Present"),
      vote(4, "NotVoting"),
      vote(5, null),
      vote(6, null, "house"),
    ];
    expect(tallyVotes(votes)).toEqual({
      keyVotes: 6,
      yea: 1,
      nay: 1,
      present: 1,
      didNotVote: 1,
      otherChamberOnly: 1,
      noRecordedVote: 1,
    });
  });
});

describe("compact.getVotes", () => {
  test("gives the model the counts and says where a key vote was held", () => {
    const summary = compact.getVotes(output(CRUZ_VOTES));
    expect(summary.counts).toEqual({
      keyVotes: 14,
      heldInTheirChamber: 10,
      theirChamber: "Senate",
      votedYea: 6,
      votedNay: 4,
      votedPresent: 0,
      didNotVote: 0,
      noRecordedVote: 0,
      heldOnlyInOtherChamber: 4,
      otherChamber: "House",
    });
    expect(summary.votes.at(-1)?.memberVote).toBe(
      "House vote only: senators do not vote on House roll calls",
    );
    expect("listedBelow" in summary.counts).toBe(false);
  });
});

/** A key vote as getVotes reads it: its roll calls, the first one decisive. */
const keyVoteCard = (index: number, chambers: Array<"house" | "senate">): CardView =>
  ({
    id: `kv-${index}`,
    order: index,
    issue: { id: index % 2 ? "trade" : "health", label: index % 2 ? "Trade" : "Health" },
    card: { title: `Key vote ${index}` },
    measures: [],
    rollCalls: chambers.map((chamber, position) => ({
      ...rollCall(`${chamber}-119-1-${index}`, chamber, index),
      decisive: position === 0,
    })),
    reviewers: [],
  }) as unknown as CardView;

/**
 * Twenty published key votes, like the snapshot: thirteen with a Senate roll call (eight Yea and five
 * Nay from this senator) and seven with only a House roll call.
 */
const PUBLISHED = [
  ...Array.from({ length: 13 }, (_, index) =>
    keyVoteCard(index, index % 2 ? ["senate", "house"] : ["house", "senate"]),
  ),
  ...Array.from({ length: 7 }, (_, index) => keyVoteCard(13 + index, ["house"])),
];
const SENATOR: AskPerson = {
  ...person(null),
  keyVotePositions: Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => [`senate-119-1-${index}`, index < 8 ? "Yea" : "Nay"]),
  ) as Record<string, Position>,
};

describe("memberVotes (getVotes)", () => {
  test("with no issue, counts every published key vote", () => {
    const { votes, tally } = memberVotes(PUBLISHED, SENATOR, { issue: undefined, area: null });
    expect(votes).toHaveLength(20);
    expect(tally).toEqual({
      keyVotes: 20,
      yea: 8,
      nay: 5,
      present: 0,
      didNotVote: 0,
      otherChamberOnly: 7,
      noRecordedVote: 0,
    });
    const houseOnly = votes.find((entry) => entry.keyVoteId === "kv-19");
    expect(houseOnly?.heldOnlyIn).toBe("house");
    expect(houseOnly?.heldOnlyRollCall?.id).toBe("house-119-1-19");
  });

  test("the tool's default lists every key vote it chose", () => {
    expect(GetVotesInput.parse({ personId: "C001098" }).limit).toBeUndefined();
  });

  test("a limit shortens the list, never the counts, and the answer says so", () => {
    const listed = memberVotes(PUBLISHED, SENATOR, { issue: undefined, area: null, limit: 14 });
    expect(listed.votes).toHaveLength(14);
    expect(listed.tally).toEqual(memberVotes(PUBLISHED, SENATOR, { area: null }).tally);
    const result: GetVotesOutput = { person: SENATOR, issue: null, ...listed };
    expect(compact.getVotes(result).counts).toMatchObject({ keyVotes: 20, listedBelow: 14 });
    const text = lead("How has Ted Cruz voted?", result);
    expect(text).toBe(
      "Ted Cruz voted Yea on 8 and Nay on 5 of the 13 key votes held in the Senate; the other 7 have only a House roll call. The list below shows 14 of these 20 key votes.",
    );
    expect(numbersAllowed(text, result)).toEqual([]);
  });
});

describe("the demo model's lead for a member's votes", () => {
  test("summarizes how the member voted on the listed key votes instead of naming one", () => {
    const result = output(CRUZ_VOTES);
    const text = lead("How has Ted Cruz voted?", result);
    expect(text).toBe(
      "Ted Cruz voted Yea on 6 and Nay on 4 of the 10 key votes held in the Senate; the other 4 have only a House roll call.",
    );
    expect(numbersAllowed(text, result)).toEqual([]);
  });

  test("adds the match only when the voter shared their answers", () => {
    const result = output(CRUZ_VOTES, { score: 0.46, n: 9, agreements: 4 });
    const text = lead("How has Ted Cruz voted?", result);
    expect(text).toBe(
      "Ted Cruz voted Yea on 6 and Nay on 4 of the 10 key votes held in the Senate; the other 4 have only a House roll call. They agree with you on 4 of 9 key votes where you both took a side.",
    );
    expect(numbersAllowed(text, result)).toEqual([]);
    expect(lead("How has Ted Cruz voted?", output(CRUZ_VOTES))).not.toMatch(/agree with you/);
  });

  test("names missed votes and votes with no record, and an issue when one was asked", () => {
    const votes = [vote(1, "Yea"), vote(2, "NotVoting"), vote(3, "Nay"), vote(4, null)];
    const result = { ...output(votes), issue: { id: "trade", label: "Trade and tariffs" } };
    const text = lead("How has Ted Cruz voted on trade?", result);
    expect(text).toBe(
      "Ted Cruz voted Yea on 1 and Nay on 1 of 4 key votes on trade and tariffs, did not vote on 1 and has no recorded vote on 1.",
    );
    expect(numbersAllowed(text, result)).toEqual([]);
  });

  test("leaves out a kind of vote the member never cast", () => {
    const result = output([vote(1, "Yea"), vote(2, "Yea"), vote(3, "Yea")]);
    expect(lead("How has Ted Cruz voted?", result)).toBe("Ted Cruz voted Yea on 3 of 3 key votes.");
  });

  test("with no Yea or Nay, the other counts carry the sentence", () => {
    const missed = output([vote(1, "NotVoting"), vote(2, "NotVoting"), vote(3, null, "house")]);
    const text = lead("How has Ted Cruz voted?", missed);
    expect(text).toBe(
      "Ted Cruz did not vote on 2 of the 2 key votes held in the Senate; the other 1 has only a House roll call.",
    );
    expect(numbersAllowed(text, missed)).toEqual([]);
    const elsewhere = output([
      vote(1, null, "house"),
      vote(2, null, "house"),
      vote(3, null, "house"),
    ]);
    expect(lead("How has Ted Cruz voted?", elsewhere)).toBe(
      "All 3 key votes have only a House roll call; senators do not vote on House roll calls.",
    );
  });

  test("one or two key votes are each named with their roll call", () => {
    expect(lead("How did Ted Cruz vote on tariffs?", output([vote(1, "Nay")]))).toBe(
      "Ted Cruz voted Nay on Key vote 1 in Senate roll call 101 on Apr 2, 2025.",
    );
    const two = output([vote(1, "Nay"), vote(2, null, "house")]);
    expect(lead("How did Ted Cruz vote on tariffs?", two)).toBe(
      "Ted Cruz voted Nay on Key vote 1 in Senate roll call 101 on Apr 2, 2025. Key vote 2 has only a House roll call; senators do not vote on House roll calls.",
    );
  });
});

// The product name is a methodology subject, not a member of Congress.
test("routes questions using the full product name", () => {
  expect(classifyQuestion("How does For The People calculate my match?")).toEqual({
    kind: "method",
    topic: "match",
  });
});
