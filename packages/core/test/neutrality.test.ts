import { describe, expect, test } from "vitest";
// @ts-expect-error The ESLint plugin is plain JavaScript without type declarations.
import { BANNED_WORDS } from "../../../tools/eslint-plugin-for-the-people/index.js";
import { BANNED_WORD_PATTERNS, findBannedWords } from "../src/neutrality";

/** The banned-word list that the Ask guard, the card checks and ESLint share. */

describe("banned words", () => {
  test.each([
    "extreme",
    "extremes",
    "extremely",
    "extremist",
    "extremists",
    "extremism",
    "radical",
    "radicals",
    "radically",
    "radicalism",
    "radicalized",
    "corrupt",
    "corrupted",
    "corruption",
    "incorruptible corruptly",
    "patriot",
    "patriots",
    "patriotic",
    "patriotism",
    "unpatriotic",
    "traitor",
    "traitors",
    "traitorous",
    "rigged",
    "rigging",
    "conflict",
    "conflicts",
    "conflicted",
    "conflicting",
    "flip-flop",
    "flip-flops",
    "flip-flopped",
    "flipflopping",
    "flip flopper",
  ])("catches %s", (word) => {
    expect(findBannedWords(`They said ${word} here.`).length).toBeGreaterThan(0);
  });

  test.each(["trigger", "extraordinary", "radius", "triggered", "rig count", "flip the page"])(
    "leaves %s alone",
    (text) => {
      expect(findBannedWords(text)).toEqual([]);
    },
  );

  test("the ESLint rule uses the same stems", () => {
    expect(
      BANNED_WORDS.map(({ word, pattern }: { word: string; pattern: RegExp }) => [
        word,
        pattern.source,
      ]),
    ).toEqual(BANNED_WORD_PATTERNS.map(({ word, pattern }) => [word, pattern.source]));
  });
});
