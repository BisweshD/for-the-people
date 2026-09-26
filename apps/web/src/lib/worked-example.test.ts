import type { Stance } from "@for-the-people/core/client";
import { describe, expect, test } from "vitest";
import { pickSenator, SAMPLE, workExample, type ExampleData } from "./worked-example";

describe("the made-up worked example", () => {
  const worked = workExample(SAMPLE.stances, SAMPLE.keyVotes, SAMPLE.memberId, SAMPLE.positions);

  test("computeMatch gives the published 70% on 4 shared votes", () => {
    expect(worked.percent).toBe(70);
    expect(worked.rawPercent).toBe(75);
    expect(worked.match).toMatchObject({ n: 4, agreements: 3 });
    expect(worked.agreeTerms).toEqual([3, 2, 1]);
    expect(worked.weightTerms).toEqual([3, 2, 1, 2]);
  });

  test("rows show polarity, skips, and missed votes", () => {
    const byTitle = new Map(worked.rows.map((row) => [row.title, row]));
    expect(byTitle.get("Vote C")).toMatchObject({
      memberVoted: "Nay on a motion to table",
      countsAs: "Supports",
      agree: true,
    });
    expect(byTitle.get("Vote D")).toMatchObject({ countsAs: "Supports", agree: false });
    expect(byTitle.get("Vote E")).toMatchObject({ you: "Skip", weight: null, agree: null });
    expect(byTitle.get("Vote F")).toMatchObject({ memberVoted: "Not Voting", agree: null });
    expect(worked.rows.every((row) => row.receiptId === null)).toBe(true);
  });

  test("each row carries the member's recorded position for its mark", () => {
    expect(worked.rows.map((row) => [row.title, row.position])).toEqual([
      ["Vote A", "Yea"],
      ["Vote B", "Nay"],
      ["Vote C", "Nay"],
      ["Vote D", "Yea"],
      ["Vote E", "Yea"],
      ["Vote F", "NotVoting"],
    ]);
  });
});

describe("the live worked example", () => {
  const data: ExampleData = {
    keyVotes: [
      {
        id: "kv-one",
        issueArea: "taxes",
        title: "One",
        rollCalls: [
          {
            id: "senate-119-1-1",
            date: "2025-01-01",
            yeaSupportsMeasure: true,
            decisive: true,
            motionToTable: false,
            receiptId: "src_one",
          },
        ],
      },
      {
        id: "kv-two",
        issueArea: "taxes",
        title: "Two",
        rollCalls: [
          {
            id: "senate-119-1-2",
            date: "2025-01-02",
            yeaSupportsMeasure: true,
            decisive: true,
            motionToTable: false,
            receiptId: "src_two",
          },
        ],
      },
    ],
    senators: [
      { id: "A000001", name: "Ann Able", lastName: "Able", state: "TX" },
      { id: "B000001", name: "Bo Baker", lastName: "Baker", state: "OH" },
      { id: "C000001", name: "Cy Cole", lastName: "Cole", state: "TX" },
    ],
    record: {
      rollCallIds: ["senate-119-1-1", "senate-119-1-2"],
      positions: { A000001: "NN", B000001: "YY", C000001: "Y-" },
    },
  };
  const stances: Stance[] = [
    { keyVoteId: "kv-one", choice: "Yea", weight: 2, answeredAt: "2026-09-23T15:00:00.000Z" },
    { keyVoteId: "kv-two", choice: "Yea", weight: 3, answeredAt: "2026-09-23T15:01:00.000Z" },
  ];

  test("a saved location picks the voter's own senator with the most shared votes", () => {
    expect(pickSenator(stances, "TX", data)).toEqual({
      senator: data.senators[0],
      why: "your-senator",
    });
  });

  test("without a location, the closest senator is used", () => {
    expect(pickSenator(stances, null, data)).toEqual({
      senator: data.senators[1],
      why: "closest",
    });
  });

  test("each compared row carries the roll call's receipt", () => {
    const cole = workExample(
      stances,
      data.keyVotes,
      "C000001",
      new Map([["senate-119-1-1", "Yea"]]),
    );
    expect(cole.rows).toEqual([
      expect.objectContaining({ title: "One", agree: true, receiptId: "src_one" }),
      expect.objectContaining({ title: "Two", memberVoted: "No record yet", receiptId: null }),
    ]);
    expect(cole.match.n).toBe(1);
  });

  test("a key vote the member's chamber never held says so", () => {
    const houseOnly = {
      ...data.keyVotes[0]!,
      id: "kv-house",
      rollCalls: [{ ...data.keyVotes[0]!.rollCalls[0]!, id: "house-119-1-102" }],
    };
    const worked = workExample(
      [{ ...stances[0]!, keyVoteId: "kv-house" }],
      [houseOnly],
      "A000001",
      new Map(),
      "senate",
    );
    expect(worked.rows[0]).toMatchObject({ memberVoted: "No Senate vote", agree: null });
  });
});
