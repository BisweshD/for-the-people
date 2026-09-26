/**
 * What a match percent is, said once per page beside that page's one "How scores work" link, in words a
 * reader needs no math for. Counts beside a percent stay plain ("7 of 8 votes"): the count is raw, and
 * only the percent is weighted (w = 1 to 3) and pulled toward 50% (the k = 2 prior in packages/core).
 */
export const SCORE_NOTE =
  "Votes you care more about count more. When you share only a few votes, scores stay near 50%, so a lucky streak does not look like a perfect match.";

/**
 * The question a reader asks when "Agrees on 7 of 8" sits beside "Match score 83%": the plain share is
 * 88%. Null when the plain share and the score show the same whole percent, so nothing needs explaining.
 */
export function whyNotLabel(match: {
  agreements: number;
  n: number;
  score: number | null;
}): string | null {
  if (match.score === null || match.n === 0) return null;
  const plain = Math.round((match.agreements / match.n) * 100);
  return plain === Math.round(match.score * 100) ? null : `Why not ${plain}%?`;
}
