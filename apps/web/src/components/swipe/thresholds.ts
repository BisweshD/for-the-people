/**
 * Answer counts that change the voting journey. A plain module, so server pages can read them too
 * (a value exported from a "use client" module reaches the server as a reference, not the number).
 */

/** Yea or Nay answers before any ranking shows (the Swipe rail and the phone strip). */
export const MIN_RANKED = 3;

/**
 * Yea or Nay answers at which Swipe pauses once to offer the matches, and from which Home shows a
 * returning voter's closest match.
 */
export const MILESTONE_ANSWERS = 5;
