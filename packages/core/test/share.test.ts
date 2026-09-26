import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  decodeFriendCompare,
  encodeFriendCompare,
  friendCompareFragment,
  friendCompareFromHash,
  friendCompareFromStances,
  shareCardFromSearchParams,
  shareCardToSearchParams,
} from "../src/share";
import type { FriendCompare, ShareCard, Stance, Weight } from "../src/voter";

const keyVoteId = fc
  .array(fc.stringMatching(/^[a-z0-9]{1,8}$/), { minLength: 1, maxLength: 4 })
  .map((parts) => `kv-${parts.join("-")}`);

const friendCompare: fc.Arbitrary<FriendCompare> = fc
  .uniqueArray(
    fc.record({
      keyVoteId,
      choice: fc.constantFrom<"Yea" | "Nay">("Yea", "Nay"),
      weight: fc.constantFrom<Weight>(1, 2, 3),
    }),
    { minLength: 1, maxLength: 64, selector: (stance) => stance.keyVoteId },
  )
  .map((stances) => ({ v: 1 as const, stances }));

describe("Friend Compare fragment", () => {
  test("round-trips every valid FriendCompare", () => {
    fc.assert(
      fc.property(friendCompare, (value) => {
        expect(decodeFriendCompare(encodeFriendCompare(value))).toEqual(value);
        expect(friendCompareFromHash(`#${friendCompareFragment(value)}`)).toEqual(value);
      }),
    );
  });

  test("uses only characters that need no escaping in a URL", () => {
    fc.assert(
      fc.property(friendCompare, (value) => {
        const encoded = encodeFriendCompare(value);
        expect(encoded).toMatch(/^[a-z0-9.\-YN]+$/);
        expect(encodeURIComponent(encoded)).toBe(encoded);
      }),
    );
  });

  test("packs a real deck compactly", () => {
    const value: FriendCompare = {
      v: 1,
      stances: [
        { keyVoteId: "kv-aca-extension", choice: "Yea", weight: 2 },
        { keyVoteId: "kv-obbba", choice: "Nay", weight: 3 },
      ],
    };
    expect(encodeFriendCompare(value)).toBe("1.aca-extensionY2.obbbaN3");
  });

  test.each([
    ["empty", ""],
    ["unknown version", "2.obbbaY2"],
    ["no stances", "1"],
    ["trailing dot", "1.obbbaY2."],
    ["missing weight", "1.obbbaY"],
    ["weight out of range", "1.obbbaY4"],
    ["weight zero", "1.obbbaN0"],
    ["Skip is never shared", "1.obbbaS2"],
    ["lowercase choice", "1.obbbay2"],
    ["uppercase id", "1.OBBBAY2"],
    ["leading dash", "1.-obbbaY2"],
    ["double dash", "1.aca--extY2"],
    ["repeated key vote", "1.obbbaY2.obbbaN1"],
    ["script injection", "1.<script>Y2"],
    ["percent-encoded", "1.obbba%59%32"],
    ["too many stances", `1.${Array.from({ length: 65 }, (_, i) => `k${i}Y1`).join(".")}`],
  ])("rejects malformed input: %s", (_label, encoded) => {
    expect(decodeFriendCompare(encoded)).toBeNull();
  });

  test("rejects fuzzed strings unless they re-encode to themselves", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (text) => {
        const decoded = decodeFriendCompare(text);
        if (decoded) expect(encodeFriendCompare(decoded)).toBe(text);
      }),
    );
  });

  test("reads only a single s parameter from the hash", () => {
    expect(friendCompareFromHash("")).toBeNull();
    expect(friendCompareFromHash("#")).toBeNull();
    expect(friendCompareFromHash("#x=1.obbbaY2")).toBeNull();
    expect(friendCompareFromHash("#s=1.obbbaY2&s=1.obbbaN2")).toBeNull();
    expect(friendCompareFromHash("s=1.obbbaY2")).toEqual({
      v: 1,
      stances: [{ keyVoteId: "kv-obbba", choice: "Yea", weight: 2 }],
    });
  });

  test("builds from device stances: drops Skips and keeps the latest answer per card", () => {
    const stances: Stance[] = [
      { keyVoteId: "kv-a", choice: "Yea", weight: 1, answeredAt: "2026-09-23T10:00:00.000Z" },
      { keyVoteId: "kv-b", choice: "Skip", weight: 2, answeredAt: "2026-09-23T10:01:00.000Z" },
      { keyVoteId: "kv-a", choice: "Nay", weight: 3, answeredAt: "2026-09-23T10:02:00.000Z" },
      { keyVoteId: "kv-c", choice: "Yea", weight: 2, answeredAt: "2026-09-23T10:03:00.000Z" },
    ];
    expect(friendCompareFromStances(stances)).toEqual({
      v: 1,
      stances: [
        { keyVoteId: "kv-a", choice: "Nay", weight: 3 },
        { keyVoteId: "kv-c", choice: "Yea", weight: 2 },
      ],
    });
  });
});

describe("ShareCard query string", () => {
  const cards: ShareCard[] = [
    { kind: "match", personId: "A000370", score: 0.781, n: 9, agreements: 7 },
    { kind: "duel", a: "A000370", b: "P000197" },
    { kind: "ballot", electionId: "2026-11-03-general", races: 3, decided: 2 },
  ];

  test.each(cards)("round-trips a $kind card", (card) => {
    expect(shareCardFromSearchParams(card.kind, shareCardToSearchParams(card))).toEqual(card);
  });

  test("carries only public ids and counts", () => {
    for (const card of cards) {
      for (const [, value] of shareCardToSearchParams(card))
        expect(value).toMatch(/^[A-Za-z0-9.:-]+$/);
    }
  });

  test.each([
    ["unknown kind", "stances", "a=A000370"],
    ["missing field", "match", "personId=A000370&score=0.5&n=4"],
    ["extra field", "match", "personId=A000370&score=0.5&n=4&agreements=2&stances=Y"],
    ["repeated field", "duel", "a=A000370&a=P000197"],
    ["bad person id", "duel", "a=A000370&b=robert"],
    ["same person twice", "duel", "a=A000370&b=A000370"],
    ["score above 1", "match", "personId=A000370&score=1.5&n=4&agreements=2"],
    ["negative count", "match", "personId=A000370&score=0.5&n=-4&agreements=2"],
    ["no shared votes", "match", "personId=A000370&score=0.5&n=0&agreements=0"],
    ["more agreements than votes", "match", "personId=A000370&score=0.5&n=4&agreements=5"],
    ["fractional count", "match", "personId=A000370&score=0.5&n=4.5&agreements=2"],
    ["exponent notation", "match", "personId=A000370&score=1e-1&n=4&agreements=2"],
    ["more decided than races", "ballot", "electionId=2026-11-03-general&races=2&decided=3"],
    ["bad election id", "ballot", "electionId=soon&races=2&decided=1"],
    ["too many races to draw", "ballot", "electionId=2026-11-03-general&races=500&decided=1"],
    ["more votes than a deck holds", "match", "personId=A000370&score=0.5&n=900&agreements=2"],
    [
      "100% on 0 of 64 (the audit's forged card)",
      "match",
      "personId=A000370&score=1&n=64&agreements=0",
    ],
    ["2% on 16 of 16", "match", "personId=S000148&score=0.02&n=16&agreements=16"],
    [
      "a perfect score the prior never allows",
      "match",
      "personId=A000370&score=1&n=16&agreements=16",
    ],
    [
      "just above the highest possible score",
      "match",
      "personId=A000370&score=0.702&n=4&agreements=2",
    ],
    [
      "just below the lowest possible score",
      "match",
      "personId=A000370&score=0.298&n=4&agreements=2",
    ],
  ])("rejects %s", (_label, kind, query) => {
    expect(shareCardFromSearchParams(kind, new URLSearchParams(query))).toBeNull();
  });

  test("accepts every score the engine can produce, as the share link rounds it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ agree: fc.boolean(), weight: fc.constantFrom(1, 2, 3) }), {
          minLength: 1,
          maxLength: 64,
        }),
        (votes) => {
          const agreed = votes.filter((vote) => vote.agree);
          const total = votes.reduce((sum, vote) => sum + vote.weight, 0);
          const score = (agreed.reduce((sum, vote) => sum + vote.weight, 0) + 1) / (total + 2);
          const card: ShareCard = {
            kind: "match",
            personId: "A000370",
            score,
            n: votes.length,
            agreements: agreed.length,
          };
          const decoded = shareCardFromSearchParams("match", shareCardToSearchParams(card));
          expect(decoded).not.toBeNull();
        },
      ),
    );
  });
});
