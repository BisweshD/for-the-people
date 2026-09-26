import { STATE_CODES } from "@for-the-people/core/client";
import { parseAsString, parseAsStringLiteral } from "nuqs/server";

/** URL state for /explore (shared by the page and its client view). */
export const exploreParams = {
  issue: parseAsString,
  chamber: parseAsStringLiteral(["house", "senate"] as const),
  state: parseAsStringLiteral(STATE_CODES),
  party: parseAsStringLiteral(["D", "R", "I"] as const),
};
