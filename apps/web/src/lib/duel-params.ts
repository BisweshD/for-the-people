import { createLoader, parseAsString } from "nuqs/server";

/** URL state for /duel: `?a=<slug>&b=<slug>` (shared by the page and its client view). */
export const duelParams = { a: parseAsString, b: parseAsString };

export const loadDuelParams = createLoader(duelParams);
