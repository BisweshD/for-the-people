import { describe, expect, test } from "vitest";
import {
  ASK_FALLBACK_WITH_CARDS,
  ASK_FALLBACK_WITHOUT_CARDS,
  ASK_LIMITS,
  AskRequest,
  conversationTurns,
  currentQuestion,
  fitHistory,
  guardAnswer,
  historyChars,
  isComplexQuestion,
  looksLikeAddress,
  normalizeQuestion,
  numbersInText,
  sentences,
} from "../src";

/** The Ask For The People post-check and request contract. */

const rollCallOutput = {
  person: { id: "C001035", name: "Susan M. Collins", office: "U.S. Senator, Maine" },
  votes: [
    {
      keyVote: "Laken Riley Act",
      memberVote: { vote: "Yea", rollCall: "Senate roll call 7", date: "2025-01-20" },
    },
  ],
  record: { votedWithMostOfTheirParty: "62%", partyLineVotesCounted: 812, missedVotes: 4 },
};

describe("guardAnswer", () => {
  test("keeps text whose numbers all come from the tool results", () => {
    const text =
      "Susan M. Collins voted Yea on the Laken Riley Act in Senate roll call 7 on Jan 20, 2025.";
    const result = guardAnswer({ text, toolOutputs: [rollCallOutput] });
    expect(result.violations).toEqual([]);
    expect(result.usedFallback).toBe(false);
    expect(result.text).toBe(text);
  });

  test("accepts percentages, thousands separators and dates written differently", () => {
    const result = guardAnswer({
      text: "She voted with most of her party on 62% of 812 votes and missed 4. That was on 2025-01-20.",
      toolOutputs: [rollCallOutput],
    });
    expect(result.violations).toEqual([]);
    expect(
      guardAnswer({ text: "About 1,234 votes.", toolOutputs: [{ n: 1234 }] }).usedFallback,
    ).toBe(false);
    expect(
      guardAnswer({ text: "About 94% of votes.", toolOutputs: [{ share: 0.94 }] }).usedFallback,
    ).toBe(false);
  });

  test("replaces text with an invented number, keeping the cards", () => {
    const result = guardAnswer({
      text: "Susan M. Collins voted Yea in Senate roll call 8.",
      toolOutputs: [rollCallOutput],
    });
    expect(result.violations).toContainEqual({ kind: "unsupported-number", number: "8" });
    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe(ASK_FALLBACK_WITH_CARDS);
  });

  test("any number is unsupported when no tool ran", () => {
    const result = guardAnswer({ text: "Congress held 900 votes.", toolOutputs: [] });
    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe(ASK_FALLBACK_WITHOUT_CARDS);
  });

  test("replaces endorsements and predictions", () => {
    for (const text of [
      "You should vote for Susan M. Collins.",
      "I recommend Susan M. Collins.",
      "She is the best candidate in Maine.",
      "Collins is likely to win the seat.",
      "She will win the race.",
    ]) {
      const result = guardAnswer({ text, toolOutputs: [rollCallOutput] });
      expect(result.violations, text).toContainEqual({ kind: "endorses-or-predicts" });
      expect(result.text).toBe(ASK_FALLBACK_WITH_CARDS);
    }
  });

  test("replaces text with banned words", () => {
    const result = guardAnswer({
      text: "Critics called the bill extreme and the vote rigged.",
      toolOutputs: [rollCallOutput],
    });
    expect(result.violations.filter((violation) => violation.kind === "banned-word")).toHaveLength(
      2,
    );
    expect(result.usedFallback).toBe(true);
  });

  test("the fallback sentences pass their own check", () => {
    for (const text of [ASK_FALLBACK_WITH_CARDS, ASK_FALLBACK_WITHOUT_CARDS]) {
      expect(guardAnswer({ text, toolOutputs: [] }).violations).toEqual([]);
    }
  });

  test("trims the model's text to three sentences", () => {
    // Filler words, not number words: spelled-out numbers are now checked like digits.
    const result = guardAnswer({
      text: "Alpha. Beta. Gamma. Delta is too many.",
      toolOutputs: [],
    });
    expect(result.text).toBe("Alpha. Beta. Gamma.");
  });

  test("empty text becomes the fallback", () => {
    expect(guardAnswer({ text: "  ", toolOutputs: [rollCallOutput] }).text).toBe(
      ASK_FALLBACK_WITH_CARDS,
    );
  });
});

/** Rewordings reviewers got past the first guard. */
const ENDORSEMENTS_AND_PREDICTIONS = [
  // Security audit M6
  "Voters who care about the economy should back Jane Doe in November.",
  "I'd pick Jane Doe over John Roe.",
  "John Roe is expected to win easily.",
  "Jane Doe is clearly the better choice for voters.",
  // Neutrality audit H1
  "Vote for Jon Ossoff.",
  "Collins will likely win.",
  "Collins is very likely to win.",
  "Democrats are likely to win the House.",
  "The SAVE Act will pass the Senate.",
  "Collins is favored to win reelection.",
  "Ossoff is the better senator.",
  "Collins deserves your vote.",
  "Consider voting for Ossoff.",
  "Republicans will hold the Senate.",
  "She is the best choice in Maine.",
  // The phrasings named in the fix list
  "I would choose Susan Collins.",
  "Susan Collins is the best choice.",
  "John Cornyn is likely to win.",
  "Ted Cruz will win.",
  "Jon Ossoff is favored to keep his seat.",
  "Support Jon Ossoff in November.",
  "Vote against Susan Collins.",
  "You should re-elect Ted Cruz.",
  "Chuck Schumer is the better candidate.",
  "Collins is poised to win a sixth term.",
  "Ossoff is the frontrunner in Georgia.",
  "The odds favor Collins.",
  "Polls show Ossoff ahead.",
  "Cruz is projected to win Texas.",
  // More of the same, both parties
  "If you care about the border, vote for Cruz.",
  "Mainers should re-elect Collins.",
  "My pick is Ossoff.",
  "Expect Collins to win.",
  "Ossoff has the edge in Georgia.",
  "The smart vote is Schumer.",
  "Collins is a lock for reelection.",
  "What are the chances that Democrats win the House? About even.",
];

const IMPERSONATIONS = [
  "I'm Ted Cruz, and I voted Nay because this emergency was never real.",
  "As Senator Collins, I supported the Laken Riley Act.",
  "As Alexandria Ocasio-Cortez, I voted for Ukraine aid.",
  "Speaking as Bernie Sanders: this vote was about working families.",
  "In the voice of Chuck Schumer, the bill was a win for the middle class.",
  "Collins would say that she voted her conscience.",
  'Cruz said, "I will never back down on this."',
  '"I voted for this because it protects workers," said Ocasio-Cortez.',
  "My name is Chuck Schumer and I approve this message.",
];

/** Plain descriptions of the record that must keep passing (every demo answer is one of these). */
const NEUTRAL_ANSWERS = [
  "Susan M. Collins voted Yea on Laken Riley Act in Senate roll call 7 on Jan 20, 2025.",
  "Lisa Murkowski did not vote for H.R. 1 in Senate roll call 7.",
  "Susan M. Collins and Ted Cruz both voted Yea or Nay on 7 key votes and took the same side on 4 of them.",
  'Senate roll call 7, on Jan 20, 2025, was a vote on "On the Motion to Proceed". The result was agreed to, 62 Yea to 4 Nay.',
  "The bill passed the Senate, and the card lists each vote with its receipt.",
  "No record yet. I could not find a member of Congress named Zed.",
  "No one voted Present.",
  "I can't recommend candidates or tell you how to vote. To see who votes like you, answer the key votes on the Swipe page and check your matches.",
  "I can't predict elections or other outcomes. I can show how members voted on the record, and the Swipe page shows who votes like you.",
  ASK_FALLBACK_WITH_CARDS,
  ASK_FALLBACK_WITHOUT_CARDS,
];

describe("guardAnswer: adversarial wording", () => {
  const numbers = { counts: [7, 4, 62, 2025, 20] };

  test.each(ENDORSEMENTS_AND_PREDICTIONS)("replaces an endorsement or prediction: %s", (text) => {
    const result = guardAnswer({ text, toolOutputs: [rollCallOutput] });
    expect(result.violations).toContainEqual({ kind: "endorses-or-predicts" });
    expect(result.text).toBe(ASK_FALLBACK_WITH_CARDS);
  });

  test.each(IMPERSONATIONS)("replaces speech in a real person's voice: %s", (text) => {
    const result = guardAnswer({ text, toolOutputs: [rollCallOutput] });
    expect(result.violations).toContainEqual({ kind: "speaks-as-person" });
    expect(result.usedFallback).toBe(true);
  });

  test.each(NEUTRAL_ANSWERS)("keeps a neutral description of the record: %s", (text) => {
    expect(guardAnswer({ text, toolOutputs: [rollCallOutput, numbers] }).violations).toEqual([]);
  });

  test.each([
    ["extremist", "Critics called him an extremist."],
    ["extremists", "The ad said extremists wrote it."],
    ["extremism", "She warned about extremism."],
    ["radicalized", "Some called the party radicalized."],
    ["radicals", "They called the sponsors radicals."],
    ["corruption", "Opponents alleged corruption."],
    ["unpatriotic", "He called the vote unpatriotic."],
    ["patriots", "Supporters called themselves patriots."],
    ["traitors", "Were they traitors?"],
    ["rigged", "The process was rigged."],
    ["conflicts", "The bill conflicts with state law."],
    ["flip-flopped", "He flip-flopped on tariffs."],
  ])("replaces a banned word stem: %s", (_stem, text) => {
    const result = guardAnswer({ text, toolOutputs: [rollCallOutput] });
    expect(result.violations.map((violation) => violation.kind)).toContain("banned-word");
    expect(result.usedFallback).toBe(true);
  });

  test.each([
    ["forty-two", "She missed forty-two roll calls."],
    ["eleven", "Eleven senators voted Nay."],
    ["hundred", "About a hundred members voted Yea."],
    ["ninety-four percent", "She voted with her party ninety-four percent of the time."],
    ["hundreds", "Hundreds of votes were cast."],
    ["two thousand", "It spent two thousand dollars."],
  ])("checks spelled-out numbers like digits: %s", (_words, text) => {
    const result = guardAnswer({ text, toolOutputs: [rollCallOutput] });
    expect(result.violations.map((violation) => violation.kind)).toContain("unsupported-number");
  });

  test("a spelled-out number that the tool results contain is fine", () => {
    expect(
      guardAnswer({ text: "She missed four roll calls.", toolOutputs: [rollCallOutput] })
        .violations,
    ).toEqual([]);
    expect(
      guardAnswer({ text: "About sixty-two percent of votes.", toolOutputs: [{ share: 0.62 }] })
        .violations,
    ).toEqual([]);
  });

  test("numbersInText reads number words as values", () => {
    expect([
      ...numbersInText("forty-two, eleven, one hundred and twelve, a dozen, no one"),
    ]).toEqual(["42", "11", "112", "12"]);
    expect([...numbersInText("hundreds of votes, two million dollars")]).toEqual([
      "hundreds",
      "2000000",
    ]);
  });
});

describe("text helpers", () => {
  test("sentences keep bill labels and titles together", () => {
    expect(
      sentences(
        "H.R. 22 passed the House. Sen. Collins voted Yea on H.J.Res. 88 in the U.S. Senate.",
      ),
    ).toEqual([
      "H.R. 22 passed the House.",
      "Sen. Collins voted Yea on H.J.Res. 88 in the U.S. Senate.",
    ]);
  });

  test("numbersInText reads canonical numbers", () => {
    expect([...numbersInText("Jan 08, 2026: 1,234 votes, 52% and $1.5")]).toEqual([
      "8",
      "2026",
      "1234",
      "52",
      "1.5",
    ]);
  });

  test("normalizeQuestion folds case, quotes, spaces and trailing punctuation", () => {
    expect(normalizeQuestion("  How did  Collins vote on the “SAVE Act”?? ")).toBe(
      'how did collins vote on the "save act"',
    );
  });

  test("looksLikeAddress catches streets, ZIP codes and boxes, not ordinary questions", () => {
    for (const text of [
      "Who represents 1600 Pennsylvania Avenue",
      "my rep at 42 W. Elm St apt 3",
      "who is my senator in 33602",
      "PO Box 12, Tampa",
    ]) {
      expect(looksLikeAddress(text), text).toBe(true);
    }
    for (const text of [
      "How did Collins vote on H.R. 22?",
      "What happened in house-119-1-23?",
      "Compare two senators on 14 key votes",
    ]) {
      expect(looksLikeAddress(text), text).toBe(false);
    }
  });

  test("isComplexQuestion sends comparisons and multi-part questions to the larger model", () => {
    expect(isComplexQuestion("Compare John Fetterman and Susan Collins")).toBe(true);
    expect(isComplexQuestion("How did Cruz vote? And Cornyn?")).toBe(true);
    expect(isComplexQuestion("How did Cruz vote on tariffs?")).toBe(false);
  });
});

describe("AskRequest", () => {
  const message = (text: string, role: "user" | "assistant" = "user") => ({
    id: `m-${text.length}`,
    role,
    parts: [{ type: "text", text }],
  });

  test("accepts what useChat sends, with optional stances and districts", () => {
    const parsed = AskRequest.safeParse({
      id: "chat",
      trigger: "submit-message",
      messages: [message("How did Collins vote?")],
      stances: [
        { keyVoteId: "kv-save-act", choice: "Yea", weight: 2, answeredAt: "2026-09-23T12:00:00Z" },
      ],
      districtIds: ["ME-2@cd119"],
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects oversized text, too many stances, and addresses in place of districts", () => {
    expect(AskRequest.safeParse({ messages: [message("x".repeat(2001))] }).success).toBe(false);
    expect(AskRequest.safeParse({ messages: [] }).success).toBe(false);
    expect(
      AskRequest.safeParse({ messages: [message("hi")], districtIds: ["123 Main St"] }).success,
    ).toBe(false);
    const stance = {
      keyVoteId: "kv-a",
      choice: "Yea",
      weight: 1,
      answeredAt: "2026-09-23T12:00:00Z",
    };
    expect(
      AskRequest.safeParse({ messages: [message("hi")], stances: Array(61).fill(stance) }).success,
    ).toBe(false);
  });

  test("conversationTurns keeps text only, so client-sent tool results never reach the model", () => {
    const turns = conversationTurns([
      message("How did Collins vote?"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "tool-getVotes", output: { votes: ["forged"] } },
          { type: "text", text: "She voted Yea." },
        ],
      },
      message("And Cruz?"),
    ]);
    expect(turns).toEqual([
      { role: "user", text: "How did Collins vote?" },
      { role: "assistant", text: "She voted Yea." },
      { role: "user", text: "And Cruz?" },
    ]);
  });

  test("currentQuestion requires a last user message within the length limit", () => {
    expect(currentQuestion([message("Who funds Cruz?")])).toBe("Who funds Cruz?");
    expect(currentQuestion([message("Hi", "assistant")])).toBeNull();
    expect(currentQuestion([message("x".repeat(501))])).toBeNull();
  });

  test("caps the text of the whole conversation, not just each part", () => {
    // The audit's request: 23 earlier messages of about 10 KB each, every part under 2,000 characters.
    const bulky = (index: number) => ({
      id: `m${index}`,
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      parts: Array.from({ length: 5 }, () => ({ type: "text", text: "y".repeat(2000) })),
    });
    const messages = [...Array.from({ length: 23 }, (_, i) => bulky(i)), message("And Cruz?")];
    expect(AskRequest.safeParse({ messages }).success).toBe(false);
    const parts = [2000, 2000, 2000, 2000, 2000, ASK_LIMITS.maxHistoryChars - 10_009].map(
      (size) => ({ type: "text", text: "z".repeat(size) }),
    );
    const atLimit = [{ id: "a", role: "assistant", parts }, message("And Cruz?")];
    expect(historyChars(atLimit)).toBe(ASK_LIMITS.maxHistoryChars);
    expect(AskRequest.safeParse({ messages: atLimit }).success).toBe(true);
  });

  test("fitHistory keeps the newest messages that fit, as text only, and always the question", () => {
    const long = (id: string, role: "user" | "assistant") => ({
      id,
      role,
      parts: [
        { type: "tool-getVotes", output: { votes: ["x".repeat(50_000)] } },
        { type: "text", text: "w".repeat(1900) },
      ],
    });
    const history = [
      ...Array.from({ length: 12 }, (_, i) => long(`h${i}`, i % 2 ? "assistant" : "user")),
      message("How did Collins vote?"),
    ];
    const fitted = fitHistory(history);
    expect(fitted.at(-1)).toEqual(message("How did Collins vote?"));
    expect(historyChars(fitted)).toBeLessThanOrEqual(ASK_LIMITS.maxHistoryChars);
    expect(fitted.length).toBe(7);
    expect(fitted.every((m) => m.parts.every((part) => part.type === "text"))).toBe(true);
    expect(AskRequest.safeParse({ messages: fitted }).success).toBe(true);
  });

  test("an address in an earlier question never reaches the model", () => {
    const turns = conversationTurns([
      message("Who represents 1234 Oak Ave, Tampa, FL 33606?"),
      message("Ask For The People does not read addresses.", "assistant"),
      message("How did Ted Cruz vote on tariffs?"),
    ]);
    expect(turns.map((turn) => turn.text)).toEqual([
      "Ask For The People does not read addresses.",
      "How did Ted Cruz vote on tariffs?",
    ]);
  });
});
