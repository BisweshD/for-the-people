/**
 * The browser entry: everything client components need from core, with no Zod dependency
 *. Schemas stay on the server; the browser checks its own data with the
 * guards in voter-guard.ts and share-link.ts. test/client-entry.test.ts keeps Zod out of this graph,
 * and ESLint requires components and lib code to import runtime values from here.
 */

export {
  CHAMBERS,
  DEFAULT_WEIGHT,
  PARTY_CODES,
  PARTY_NAMES,
  STATE_CODES,
  VOTER_SCHEMA_VERSION,
  WEIGHT_LABELS,
  isMeasureId,
  isPersonId,
  isRollCallId,
  isStateCode,
  parseDistrictId,
  parseRollCallId,
  personIdFromSlug,
  personIdToSlug,
} from "./base";
export { ASK_LIMITS, fitHistory, looksLikeAddress } from "./ask-input";
export { LOW_CONFIDENCE_N, MATCH_PRIOR_K } from "./match";
export { computeMatch, matchScoreBounds } from "./score";
export { isLocation, isVoter } from "./voter-guard";
export {
  FRIEND_COMPARE_PARAM,
  SHARE_KINDS,
  SHARE_LIMITS,
  decodeFriendCompare,
  encodeFriendCompare,
  friendCompareFragment,
  friendCompareFromHash,
  friendCompareFromStances,
  isFriendCompare,
  isShareCard,
  shareCardToSearchParams,
} from "./share-link";

export type * from "./ids";
export type * from "./civic";
export type * from "./voter";
export type * from "./match";
export type * from "./score";
export type { ShareKind } from "./share-link";
