import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Position } from "../src/civic";
import { computeMatch, matchScoreBounds } from "../src/score";
import type { ScoreInput, ScoreKeyVote } from "../src/score/contract";
import type { Stance, Weight } from "../src/voter";

const PERSON = "A000370";
const ISSUES = ["health-care", "immigration", "trade"] as const;
const at = (i: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString();

interface Row {
  choice: "Yea" | "Nay" | "Skip";
  weight: Weight;
  position: Position;
  yeaSupportsMeasure: boolean;
  issue: (typeof ISSUES)[number];
}

const weightArb = fc.constantFrom<Weight>(1, 2, 3);
const rowArb: fc.Arbitrary<Row> = fc.record({
  choice: fc.constantFrom("Yea", "Nay", "Skip"),
  weight: weightArb,
  position: fc.constantFrom<Position>("Yea", "Nay", "Present", "NotVoting"),
  yeaSupportsMeasure: fc.boolean(),
  issue: fc.constantFrom(...ISSUES),
});

function build(rows: readonly Row[]): ScoreInput {
  const keyVotes: ScoreKeyVote[] = rows.map((row, i) => ({
    id: `kv-card-${i}`,
    issueArea: row.issue,
    rollCallRefs: [
      {
        rollCallId: `house-119-1-${i + 1}`,
        date: "2025-06-01",
        yeaSupportsMeasure: row.yeaSupportsMeasure,
        decisive: true,
      },
    ],
  }));
  const stances: Stance[] = rows.map((row, i) => ({
    keyVoteId: `kv-card-${i}`,
    choice: row.choice,
    weight: row.weight,
    answeredAt: at(i),
  }));
  const positions = new Map(rows.map((row, i) => [`house-119-1-${i + 1}`, row.position] as const));
  return { stances, keyVotes, member: { personId: PERSON, positions } };
}

/** The member's raw vote that agrees (or disagrees) with a voter choice, given polarity. */
function memberVoteFor(
  choice: "Yea" | "Nay",
  yeaSupportsMeasure: boolean,
  agree: boolean,
): Position {
  const voterSupports = choice === "Yea";
  const memberSupports = agree ? voterSupports : !voterSupports;
  return memberSupports === yeaSupportsMeasure ? "Yea" : "Nay";
}

const decidedRowsArb = (minLength: number) =>
  fc.array(
    fc.record({
      choice: fc.constantFrom<"Yea" | "Nay">("Yea", "Nay"),
      weight: weightArb,
      yeaSupportsMeasure: fc.boolean(),
      issue: fc.constantFrom(...ISSUES),
    }),
    { minLength, maxLength: 30 },
  );

describe("computeMatch: the brief's property tests", () => {
  test("identical answers with n >= 10 score >= 0.9", () => {
    fc.assert(
      fc.property(decidedRowsArb(10), (decided) => {
        const rows = decided.map((row) => ({
          ...row,
          position: memberVoteFor(row.choice, row.yeaSupportsMeasure, true),
        }));
        const match = computeMatch(build(rows));
        expect(match.n).toBe(rows.length);
        expect(match.score).not.toBeNull();
        expect(match.score!).toBeGreaterThanOrEqual(0.9);
      }),
    );
  });

  test("opposite answers with n >= 10 score <= 0.1", () => {
    fc.assert(
      fc.property(decidedRowsArb(10), (decided) => {
        const rows = decided.map((row) => ({
          ...row,
          position: memberVoteFor(row.choice, row.yeaSupportsMeasure, false),
        }));
        const match = computeMatch(build(rows));
        expect(match.n).toBe(rows.length);
        expect(match.score!).toBeLessThanOrEqual(0.1);
      }),
    );
  });

  test("skips are ignored", () => {
    fc.assert(
      fc.property(
        fc.array(rowArb, { maxLength: 25 }),
        fc.array(rowArb, { maxLength: 10 }),
        (rows, extra) => {
          const skips = extra.map((row) => ({ ...row, choice: "Skip" as const }));
          const base = computeMatch(build(rows));
          const withSkips = computeMatch(build([...rows, ...skips]));
          expect(withSkips.score).toBe(base.score);
          expect(withSkips.n).toBe(base.n);
          expect(withSkips.agreements).toBe(base.agreements);
        },
      ),
    );
  });

  test("the result is order-invariant", () => {
    fc.assert(
      fc.property(
        fc.array(rowArb, { maxLength: 25 }).chain((rows) =>
          fc.tuple(
            fc.constant(rows),
            fc.shuffledSubarray(
              rows.map((_, i) => i),
              { minLength: rows.length, maxLength: rows.length },
            ),
          ),
        ),
        ([rows, order]) => {
          const input = build(rows);
          const shuffled: ScoreInput = {
            ...input,
            stances: order.map((i) => input.stances[i]!),
            keyVotes: [...order].reverse().map((i) => input.keyVotes[i]!),
          };
          const a = computeMatch(input);
          const b = computeMatch(shuffled);
          if (a.score === null) expect(b.score).toBeNull();
          else expect(b.score).toBeCloseTo(a.score, 12);
          expect(b.n).toBe(a.n);
          expect(b.agreements).toBe(a.agreements);
          expect(b.splits).toBe(a.splits);
          expect(new Set(b.byIssue.map((issue) => JSON.stringify(issue)))).toEqual(
            new Set(a.byIssue.map((issue) => JSON.stringify(issue))),
          );
        },
      ),
    );
  });

  test("raising the weight of an agreement never lowers the score", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { minLength: 1, maxLength: 25 }), fc.nat(), (rows, pick) => {
        const base = computeMatch(build(rows));
        const agreeing = base.comparisons.filter(
          (comparison) => comparison.agree && comparison.weight < 3,
        );
        fc.pre(agreeing.length > 0);
        const target = agreeing[pick % agreeing.length]!;
        const index = Number(target.keyVoteId.replace("kv-card-", ""));
        const raised = rows.map((row, i) =>
          i === index ? { ...row, weight: (row.weight + 1) as Weight } : row,
        );
        expect(computeMatch(build(raised)).score!).toBeGreaterThanOrEqual(base.score!);
      }),
    );
  });
});

describe("computeMatch: method details", () => {
  test("n = 0 has no score, and n > 0 always has a score strictly between 0 and 1", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 25 }), (rows) => {
        const match = computeMatch(build(rows));
        if (match.n === 0) expect(match.score).toBeNull();
        else {
          expect(match.score!).toBeGreaterThan(0);
          expect(match.score!).toBeLessThan(1);
        }
        expect(match.agreements + match.splits).toBe(match.n);
        expect(match.comparisons).toHaveLength(match.n);
      }),
    );
  });

  test("uses the exact formula (sum w*agree + k/2) / (sum w + k) with k = 2", () => {
    const rows: Row[] = [
      { choice: "Yea", weight: 3, position: "Yea", yeaSupportsMeasure: true, issue: "trade" },
      { choice: "Nay", weight: 1, position: "Yea", yeaSupportsMeasure: true, issue: "trade" },
    ];
    const match = computeMatch(build(rows));
    expect(match.n).toBe(2);
    expect(match.agreements).toBe(1);
    expect(match.splits).toBe(1);
    expect(match.score).toBeCloseTo((3 * 1 + 1 * 0 + 1) / (3 + 1 + 2), 12);
  });

  test("Present and Not Voting are never compared", () => {
    const rows: Row[] = [
      { choice: "Yea", weight: 2, position: "Present", yeaSupportsMeasure: true, issue: "trade" },
      { choice: "Nay", weight: 2, position: "NotVoting", yeaSupportsMeasure: true, issue: "trade" },
    ];
    const match = computeMatch(build(rows));
    expect(match.n).toBe(0);
    expect(match.score).toBeNull();
  });

  test("a Yea on a roll call where Yea opposes the measure counts as opposing it", () => {
    const rows: Row[] = [
      { choice: "Nay", weight: 2, position: "Yea", yeaSupportsMeasure: false, issue: "trade" },
    ];
    const match = computeMatch(build(rows));
    expect(match.comparisons[0]).toMatchObject({
      voterSupports: false,
      memberSupports: false,
      agree: true,
    });
  });

  test("flipping polarity and the member's vote together changes nothing", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 25 }), (rows) => {
        const flipped = rows.map((row) => ({
          ...row,
          yeaSupportsMeasure: !row.yeaSupportsMeasure,
          position: row.position === "Yea" ? "Nay" : row.position === "Nay" ? "Yea" : row.position,
        })) as Row[];
        const a = computeMatch(build(rows));
        const b = computeMatch(build(flipped));
        expect(b.score).toBe(a.score);
        expect(b.agreements).toBe(a.agreements);
      }),
    );
  });

  test("uses only the decisive roll call when a card has several in one chamber", () => {
    const keyVotes: ScoreKeyVote[] = [
      {
        id: "kv-two-votes",
        issueArea: "trade",
        rollCallRefs: [
          {
            rollCallId: "house-119-1-10",
            date: "2025-03-01",
            yeaSupportsMeasure: true,
            decisive: false,
          },
          {
            rollCallId: "house-119-1-11",
            date: "2025-03-02",
            yeaSupportsMeasure: true,
            decisive: true,
          },
        ],
      },
    ];
    const stances: Stance[] = [
      { keyVoteId: "kv-two-votes", choice: "Yea", weight: 2, answeredAt: at(0) },
    ];
    const positions = new Map<string, Position>([
      ["house-119-1-10", "Nay"],
      ["house-119-1-11", "Yea"],
    ]);
    const match = computeMatch({ stances, keyVotes, member: { personId: PERSON, positions } });
    expect(match.n).toBe(1);
    expect(match.comparisons[0]?.rollCallId).toBe("house-119-1-11");
    expect(match.agreements).toBe(1);
  });

  test("a senator is compared on the Senate roll call and never on the House one", () => {
    const keyVotes: ScoreKeyVote[] = [
      {
        id: "kv-both-chambers",
        issueArea: "immigration",
        rollCallRefs: [
          {
            rollCallId: "house-119-1-23",
            date: "2025-01-22",
            yeaSupportsMeasure: true,
            decisive: true,
          },
          {
            rollCallId: "senate-119-1-7",
            date: "2025-01-20",
            yeaSupportsMeasure: true,
            decisive: true,
          },
        ],
      },
    ];
    const stances: Stance[] = [
      { keyVoteId: "kv-both-chambers", choice: "Nay", weight: 1, answeredAt: at(0) },
    ];
    const match = computeMatch({
      stances,
      keyVotes,
      member: { personId: "S000148", positions: new Map([["senate-119-1-7", "Yea" as Position]]) },
    });
    expect(match.n).toBe(1);
    expect(match.comparisons[0]).toMatchObject({
      rollCallId: "senate-119-1-7",
      chamber: "senate",
      agree: false,
    });
  });

  test("a member who voted in both chambers on one card is compared once, on the later roll call", () => {
    const keyVotes: ScoreKeyVote[] = [
      {
        id: "kv-moved-chambers",
        issueArea: "trade",
        rollCallRefs: [
          {
            rollCallId: "house-119-1-5",
            date: "2025-01-10",
            yeaSupportsMeasure: true,
            decisive: true,
          },
          {
            rollCallId: "senate-119-2-5",
            date: "2026-02-10",
            yeaSupportsMeasure: true,
            decisive: true,
          },
        ],
      },
    ];
    const stances: Stance[] = [
      { keyVoteId: "kv-moved-chambers", choice: "Yea", weight: 2, answeredAt: at(0) },
    ];
    const positions = new Map<string, Position>([
      ["house-119-1-5", "Nay"],
      ["senate-119-2-5", "Yea"],
    ]);
    const match = computeMatch({ stances, keyVotes, member: { personId: PERSON, positions } });
    expect(match.n).toBe(1);
    expect(match.comparisons[0]).toMatchObject({ rollCallId: "senate-119-2-5", agree: true });
  });

  test("the latest answer wins when a key vote was answered twice, and unknown key votes are ignored", () => {
    const keyVotes: ScoreKeyVote[] = [
      {
        id: "kv-a",
        issueArea: "trade",
        rollCallRefs: [
          {
            rollCallId: "house-119-1-1",
            date: "2025-01-01",
            yeaSupportsMeasure: true,
            decisive: true,
          },
        ],
      },
    ];
    const stances: Stance[] = [
      { keyVoteId: "kv-a", choice: "Nay", weight: 1, answeredAt: at(1) },
      { keyVoteId: "kv-a", choice: "Yea", weight: 3, answeredAt: at(5) },
      { keyVoteId: "kv-retired", choice: "Yea", weight: 3, answeredAt: at(6) },
    ];
    const match = computeMatch({
      stances,
      keyVotes,
      member: { personId: PERSON, positions: new Map([["house-119-1-1", "Yea" as Position]]) },
    });
    expect(match.n).toBe(1);
    expect(match.comparisons[0]).toMatchObject({ weight: 3, agree: true });
  });

  test("a key vote listed twice is compared once", () => {
    const input = build([
      { choice: "Yea", weight: 2, position: "Yea", yeaSupportsMeasure: true, issue: "trade" },
    ]);
    const match = computeMatch({ ...input, keyVotes: [...input.keyVotes, ...input.keyVotes] });
    expect(match.n).toBe(1);
  });

  test("answers at the same instant resolve the same way in any order, whatever the UTC offset", () => {
    const keyVotes: ScoreKeyVote[] = [
      {
        id: "kv-a",
        issueArea: "trade",
        rollCallRefs: [
          {
            rollCallId: "house-119-1-1",
            date: "2025-01-01",
            yeaSupportsMeasure: true,
            decisive: true,
          },
        ],
      },
    ];
    const member = { personId: PERSON, positions: new Map([["house-119-1-1", "Yea" as Position]]) };
    const noonUtc: Stance = {
      keyVoteId: "kv-a",
      choice: "Nay",
      weight: 2,
      answeredAt: "2026-09-01T12:00:00Z",
    };
    const sameInstant: Stance = {
      keyVoteId: "kv-a",
      choice: "Yea",
      weight: 1,
      answeredAt: "2026-09-01T07:00:00-05:00",
    };
    const earlierLooking: Stance = {
      keyVoteId: "kv-a",
      choice: "Nay",
      weight: 3,
      answeredAt: "2026-09-01T11:00:00-05:00",
    };
    const a = computeMatch({ stances: [noonUtc, sameInstant], keyVotes, member });
    const b = computeMatch({ stances: [sameInstant, noonUtc], keyVotes, member });
    expect(a.comparisons).toEqual(b.comparisons);
    const later = computeMatch({ stances: [earlierLooking, noonUtc], keyVotes, member });
    expect(later.comparisons[0]).toMatchObject({ voterSupports: false, weight: 3 });
  });

  test("byIssue uses the same formula per issue area", () => {
    const rows: Row[] = [
      { choice: "Yea", weight: 3, position: "Yea", yeaSupportsMeasure: true, issue: "trade" },
      { choice: "Yea", weight: 1, position: "Nay", yeaSupportsMeasure: true, issue: "immigration" },
    ];
    const match = computeMatch(build(rows));
    const trade = match.byIssue.find((issue) => issue.issueArea === "trade");
    const immigration = match.byIssue.find((issue) => issue.issueArea === "immigration");
    expect(trade).toEqual({ issueArea: "trade", n: 1, agreements: 1, score: (3 + 1) / (3 + 2) });
    expect(immigration).toEqual({
      issueArea: "immigration",
      n: 1,
      agreements: 0,
      score: 1 / (1 + 2),
    });
    expect(match.byIssue.find((issue) => issue.issueArea === "health-care")).toBeUndefined();
  });
});

describe("matchScoreBounds", () => {
  test("every score the engine produces lies within the bounds for its counts", () => {
    fc.assert(
      fc.property(fc.array(rowArb, { minLength: 1, maxLength: 30 }), (rows) => {
        const match = computeMatch(build(rows));
        if (match.score === null) {
          expect(matchScoreBounds(match.agreements, match.n)).toBeNull();
          return;
        }
        const bounds = matchScoreBounds(match.agreements, match.n)!;
        expect(match.score).toBeGreaterThanOrEqual(bounds.min - 1e-12);
        expect(match.score).toBeLessThanOrEqual(bounds.max + 1e-12);
      }),
    );
  });

  test("the bounds are reached: agreements at weight 1 and splits at 3, and the reverse", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 0, max: 40 }), (n, a) => {
        const agreements = Math.min(a, n);
        const rowsWith = (agreeWeight: Weight, splitWeight: Weight) =>
          Array.from({ length: n }, (_, i): Row => {
            const agree = i < agreements;
            return {
              choice: "Yea",
              weight: agree ? agreeWeight : splitWeight,
              position: memberVoteFor("Yea", true, agree),
              yeaSupportsMeasure: true,
              issue: "trade",
            };
          });
        const bounds = matchScoreBounds(agreements, n)!;
        expect(computeMatch(build(rowsWith(1, 3))).score).toBeCloseTo(bounds.min, 12);
        expect(computeMatch(build(rowsWith(3, 1))).score).toBeCloseTo(bounds.max, 12);
      }),
    );
  });

  test("matches the closed forms and rejects impossible counts", () => {
    expect(matchScoreBounds(0, 64)).toEqual({ min: 1 / 194, max: 1 / 66 });
    expect(matchScoreBounds(16, 16)).toEqual({ min: 17 / 18, max: 49 / 50 });
    expect(matchScoreBounds(0, 0)).toBeNull();
    expect(matchScoreBounds(5, 4)).toBeNull();
    expect(matchScoreBounds(-1, 4)).toBeNull();
    expect(matchScoreBounds(1.5, 4)).toBeNull();
  });
});
