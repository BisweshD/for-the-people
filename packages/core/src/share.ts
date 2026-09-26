import { matchScoreBounds } from "./score";
import { SHARE_KINDS, SHARE_LIMITS, type ShareKind } from "./share-link";
import { ShareCard } from "./voter";

export * from "./share-link";

/** Query-string decoding for share cards. It runs on the server (the image route), so it may use Zod. */

const SHARE_FIELDS: Record<ShareKind, readonly string[]> = {
  match: ["personId", "score", "n", "agreements"],
  duel: ["a", "b"],
  ballot: ["electionId", "races", "decided"],
};

const NUMBER = /^\d{1,6}(\.\d{1,6})?$/;
const toNumber = (value: string | null): number =>
  value && NUMBER.test(value) ? Number(value) : NaN;

/** Share links round the score to three decimals (share-link.ts), so a true score may sit this far off. */
const SCORE_ROUNDING = 0.0005;

/**
 * A match card's score must be one the published formula can produce for its counts, so nobody can
 * mint an For The People card that says "100% match" on 0 of 64 votes.
 */
function scoreFitsCounts(score: number, agreements: number, n: number): boolean {
  const bounds = matchScoreBounds(agreements, n);
  return (
    bounds !== null && score >= bounds.min - SCORE_ROUNDING && score <= bounds.max + SCORE_ROUNDING
  );
}

/**
 * Reads a share card from a query string. Returns null for an unknown kind, a missing, repeated, or
 * unexpected parameter, or values that fail the ShareCard schema or its counting rules.
 */
export function shareCardFromSearchParams(kind: string, params: URLSearchParams): ShareCard | null {
  if (!(SHARE_KINDS as readonly string[]).includes(kind)) return null;
  const fields = SHARE_FIELDS[kind as ShareKind];
  const keys = [...params.keys()];
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) return null;
  if (new Set(keys).size !== keys.length) return null;
  const get = (key: string) => params.get(key);
  const candidate =
    kind === "match"
      ? {
          kind,
          personId: get("personId"),
          score: toNumber(get("score")),
          n: toNumber(get("n")),
          agreements: toNumber(get("agreements")),
        }
      : kind === "duel"
        ? { kind, a: get("a"), b: get("b") }
        : {
            kind,
            electionId: get("electionId"),
            races: toNumber(get("races")),
            decided: toNumber(get("decided")),
          };
  const parsed = ShareCard.safeParse(candidate);
  if (!parsed.success) return null;
  const card = parsed.data;
  if (card.kind === "match" && (card.agreements > card.n || card.n > SHARE_LIMITS.keyVotes))
    return null;
  if (card.kind === "match" && !scoreFitsCounts(card.score, card.agreements, card.n)) return null;
  if (card.kind === "duel" && card.a === card.b) return null;
  if (card.kind === "ballot" && (card.decided > card.races || card.races > SHARE_LIMITS.races))
    return null;
  return card;
}
