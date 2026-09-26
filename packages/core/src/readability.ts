/**
 * Reading level for plain-language copy (the swipe cards are written for an average American, about an
 * 8th-grade reader). Flesch-Kincaid grade with a vowel-group syllable count: a rough measure, but a
 * stable one, so a test can hold copy to a ceiling and catch a sentence that has grown dense.
 */

/** Bill and place abbreviations read as one word and never end a sentence. */
const ABBREVIATIONS = [
  /\bH\.\s?Con\.\s?Res\.\s?\d+/g,
  /\bS\.\s?Con\.\s?Res\.\s?\d+/g,
  /\bH\.\s?J\.\s?Res\.\s?\d+/g,
  /\bS\.\s?J\.\s?Res\.\s?\d+/g,
  /\bH\.\s?Res\.\s?\d+/g,
  /\bS\.\s?Res\.\s?\d+/g,
  /\bH\.\s?R\.\s?\d+/g,
  /\bS\.\s?\d+/g,
];

function normalize(text: string): string {
  let out = text;
  for (const pattern of ABBREVIATIONS) out = out.replace(pattern, "bill");
  return out
    .replace(/\bU\.S\./g, "US")
    .replace(/\$?\d+(?:[.,]\d+)*%?/g, "number")
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./g, "$1");
}

export function readingSentences(text: string): string[] {
  return normalize(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[a-z]/i.test(sentence));
}

export function readingWords(text: string): string[] {
  return normalize(text).match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) ?? [];
}

export function readingSyllables(word: string): number {
  const lower = word.toLowerCase();
  if (lower.length <= 3) return 1;
  const trimmed = lower.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

export interface Readability {
  grade: number;
  words: number;
  sentences: number;
  longestSentence: number;
}

export function readability(text: string): Readability {
  const parts = readingSentences(text);
  const all = readingWords(text);
  const syllableCount = all.reduce((sum, word) => sum + readingSyllables(word), 0);
  const sentenceCount = Math.max(1, parts.length);
  const wordCount = Math.max(1, all.length);
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;
  return {
    grade: Math.round(grade * 10) / 10,
    words: all.length,
    sentences: parts.length,
    longestSentence: Math.max(0, ...parts.map((sentence) => readingWords(sentence).length)),
  };
}
