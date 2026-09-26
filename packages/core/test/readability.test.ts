import { describe, expect, test } from "vitest";
import { readability, readingSentences, readingSyllables, readingWords } from "../src/readability";

describe("readability", () => {
  test("counts syllables by vowel groups, with silent endings dropped", () => {
    expect(readingSyllables("vote")).toBe(1);
    expect(readingSyllables("Congress")).toBe(2);
    expect(readingSyllables("representative")).toBe(5);
    expect(readingSyllables("the")).toBe(1);
  });

  test("bill numbers, dates and U.S. never end a sentence", () => {
    expect(
      readingSentences(
        "The House passed H.R. 1834 on Jan. 8, 2026. The U.S. Senate has not voted.",
      ),
    ).toHaveLength(2);
    expect(readingSentences("It passed 216-213. It became law on July 24, 2025.")).toHaveLength(2);
  });

  test("numbers count as one word", () => {
    expect(readingWords("It cancels about $9 billion, or 1.5% of it.")).toHaveLength(9);
  });

  test("plain copy grades lower than dense copy", () => {
    const plain = readability("The bill ends the emergency. The Senate has not voted on it.");
    const dense = readability(
      "Notwithstanding any other provision of law, the Secretary shall designate the country for temporary protected status pursuant to statutory authority.",
    );
    expect(plain.grade).toBeLessThan(6);
    expect(dense.grade).toBeGreaterThan(14);
    expect(dense.longestSentence).toBe(20);
  });
});
