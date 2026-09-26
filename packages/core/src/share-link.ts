import { ELECTION_ID_PATTERN, KEY_VOTE_ID_PATTERN, isPersonId } from "./base";
import type { FriendCompare, ShareCard, Stance } from "./voter";

/**
 * Wire formats for sharing.
 *
 * A ShareCard travels in a query string, so it carries only public ids and counts. A FriendCompare
 * travels in the URL fragment (`#s=...`), which browsers never send to a server, so it may carry
 * stances. This module has no Zod dependency so the browser can use it; the query-string decoder,
 * which runs on the server, is in share.ts. test/share.test.ts holds both to the core schemas.
 */

// ShareCard <-> query string

export type ShareKind = ShareCard["kind"];
export const SHARE_KINDS = ["match", "duel", "ballot"] as const satisfies readonly ShareKind[];

/** Upper bounds that keep generated images sane: a deck has at most 64 cards, a ballot far fewer races. */
export const SHARE_LIMITS = { keyVotes: 64, races: 40 } as const;

const isCount = (value: unknown, min = 0) =>
  Number.isSafeInteger(value) && (value as number) >= min;

/** The same rules as the ShareCard schema in voter.ts. */
export function isShareCard(card: unknown): card is ShareCard {
  if (typeof card !== "object" || card === null) return false;
  const value = card as Record<string, unknown>;
  switch (value.kind) {
    case "match":
      return (
        isPersonId(value.personId) &&
        typeof value.score === "number" &&
        value.score >= 0 &&
        value.score <= 1 &&
        isCount(value.n, 1) &&
        isCount(value.agreements)
      );
    case "duel":
      return isPersonId(value.a) && isPersonId(value.b);
    case "ballot":
      return (
        typeof value.electionId === "string" &&
        ELECTION_ID_PATTERN.test(value.electionId) &&
        isCount(value.races) &&
        isCount(value.decided)
      );
    default:
      return false;
  }
}

/** The same rules as the FriendCompare schema in voter.ts. */
export function isFriendCompare(value: unknown): value is FriendCompare {
  if (typeof value !== "object" || value === null) return false;
  const { v, stances } = value as Record<string, unknown>;
  return (
    v === 1 &&
    Array.isArray(stances) &&
    stances.length <= 64 &&
    stances.every(
      (stance) =>
        typeof stance === "object" &&
        stance !== null &&
        typeof stance.keyVoteId === "string" &&
        KEY_VOTE_ID_PATTERN.test(stance.keyVoteId) &&
        (stance.choice === "Yea" || stance.choice === "Nay") &&
        (stance.weight === 1 || stance.weight === 2 || stance.weight === 3),
    )
  );
}

function assertValid<T>(value: T, guard: (value: unknown) => boolean, what: string): T {
  if (!guard(value)) throw new Error(`Invalid ${what}`);
  return value;
}

/** The query string for a share card. The kind travels in the path, not here. */
export function shareCardToSearchParams(card: ShareCard): URLSearchParams {
  const valid = assertValid(card, isShareCard, "share card");
  switch (valid.kind) {
    case "match":
      return new URLSearchParams({
        personId: valid.personId,
        score: String(Math.round(valid.score * 1000) / 1000),
        n: String(valid.n),
        agreements: String(valid.agreements),
      });
    case "duel":
      return new URLSearchParams({ a: valid.a, b: valid.b });
    case "ballot":
      return new URLSearchParams({
        electionId: valid.electionId,
        races: String(valid.races),
        decided: String(valid.decided),
      });
  }
}

// FriendCompare <-> URL fragment

/** The fragment parameter that holds a FriendCompare: `/compare#s=...`. */
export const FRIEND_COMPARE_PARAM = "s";

const KEY_VOTE_PREFIX = "kv-";
/** One entry: the key vote id without its `kv-` prefix, then Y or N, then the weight (1 to 3). */
const ENTRY = /^([a-z0-9]+(?:-[a-z0-9]+)*)([YN])([123])$/;

/** The stances worth sharing: Yea or Nay only, one per key vote (the latest answer wins). */
export function friendCompareFromStances(stances: readonly Stance[]): FriendCompare {
  const latest = new Map<string, Stance>();
  for (const stance of stances) {
    const current = latest.get(stance.keyVoteId);
    if (!current || Date.parse(stance.answeredAt) >= Date.parse(current.answeredAt))
      latest.set(stance.keyVoteId, stance);
  }
  const decided = [...latest.values()]
    .filter((stance) => stance.choice !== "Skip")
    .map((stance) => ({
      keyVoteId: stance.keyVoteId,
      choice: stance.choice as "Yea" | "Nay",
      weight: stance.weight,
    }));
  return assertValid({ v: 1 as const, stances: decided }, isFriendCompare, "friend compare");
}

/** Packs a FriendCompare as `1.aca-extensionY2.obbbaN3`: short, readable, and URL-safe without escaping. */
export function encodeFriendCompare(value: FriendCompare): string {
  const valid = assertValid(value, isFriendCompare, "friend compare");
  const entries = valid.stances.map((stance) => {
    if (!stance.keyVoteId.startsWith(KEY_VOTE_PREFIX))
      throw new Error(`Unexpected key vote id: ${stance.keyVoteId}`);
    return `${stance.keyVoteId.slice(KEY_VOTE_PREFIX.length)}${stance.choice === "Yea" ? "Y" : "N"}${stance.weight}`;
  });
  return [String(valid.v), ...entries].join(".");
}

/** Unpacks `encodeFriendCompare` output. Null for any other version, a malformed or repeated entry, or no stances. */
export function decodeFriendCompare(encoded: string): FriendCompare | null {
  const [version, ...entries] = encoded.split(".");
  if (version !== "1" || entries.length === 0) return null;
  const seen = new Set<string>();
  const stances = [];
  for (const entry of entries) {
    const match = ENTRY.exec(entry);
    if (!match) return null;
    const [, id, choice, weight] = match;
    const keyVoteId = `${KEY_VOTE_PREFIX}${id}`;
    if (seen.has(keyVoteId)) return null;
    seen.add(keyVoteId);
    stances.push({ keyVoteId, choice: choice === "Y" ? "Yea" : "Nay", weight: Number(weight) });
  }
  const value = { v: 1 as const, stances };
  return isFriendCompare(value) ? value : null;
}

/** The fragment (without "#") for a compare link. */
export const friendCompareFragment = (value: FriendCompare): string =>
  `${FRIEND_COMPARE_PARAM}=${encodeFriendCompare(value)}`;

/** Reads a FriendCompare from `location.hash` ("#s=..." or "s=..."). Null when absent or malformed. */
export function friendCompareFromHash(hash: string): FriendCompare | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const values = params.getAll(FRIEND_COMPARE_PARAM);
  if (values.length !== 1) return null;
  return decodeFriendCompare(values[0]!);
}
