/**
 * Neutral voice. These words never appear in UI copy, card copy, or AI output.
 * Each pattern matches the word's stem, so every inflection is caught ("extremist", "radicalized",
 * "unpatriotic"). tools/eslint-plugin-for-the-people keeps the same list for UI strings.
 */
export const BANNED_WORD_PATTERNS: ReadonlyArray<{ word: string; pattern: RegExp }> = [
  { word: "conflict", pattern: /\bconflict\w*/gi },
  { word: "corrupt", pattern: /\b(?:un)?corrupt\w*/gi },
  { word: "flip-flop", pattern: /\bflip[\s-]?flop\w*/gi },
  { word: "extreme", pattern: /\bextrem(?:e|es|ely|ist|ists|ism|isms|ity|ities)\b/gi },
  { word: "radical", pattern: /\bradical\w*/gi },
  { word: "patriot", pattern: /\b(?:un)?patriot\w*/gi },
  { word: "traitor", pattern: /\btraitor\w*/gi },
  { word: "rigged", pattern: /\brigg(?:ed|ing|er|ers)\b/gi },
];

export interface BannedWordHit {
  word: string;
  match: string;
  index: number;
}

export function findBannedWords(text: string): BannedWordHit[] {
  const hits: BannedWordHit[] = [];
  for (const { word, pattern } of BANNED_WORD_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      hits.push({ word, match: match[0], index: match.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Verbs that pick a side in an election or a vote. */
const PICK = String.raw`(?:vote|back|support|elect|re-?elect|choose|pick|go with|side with|reject|oppose|defeat|replace|unseat|trust)`;
/** Outcomes a prediction names. */
const OUTCOME = String.raw`(?:win|wins|lose|loses|pass|fail|beat|defeat|prevail|flip|sweep|clinch|be re-?elected|be defeated|become law|(?:hold|keep|retain|take|win|lose|flip|control) (?:on to |onto )?(?:the |their |his |her |its |a |control of the )?(?:seat|majority|house|senate|chamber|state|race|election|district))`;
/** Words that turn a sentence into a forecast of that outcome. */
const FORECAST = String.raw`(?:will|'ll|’ll|is going to|are going to|gonna|likely to|unlikely to|expected to|favou?red to|poised to|set to|projected to|predicted to|forecast to|on track to|certain to|sure to|bound to|in position to|positioned to|slated to)`;
/** Words that rank a person or an option. */
const RANK = String.raw`(?:better|best|stronger|strongest|weaker|weakest|worse|worst|smarter|wiser|safer|safest|superior|inferior|preferable|ideal|obvious|clear|right|wrong|smart|only real)`;
const CHOICE = String.raw`(?:choice|candidate|pick|option|senator|representative|member|bet|leader|person for the job|vote)`;

/**
 * Words that endorse or predict. Ask For The People never says them about a
 * candidate, a member, or a vote. The list is wide on purpose: a false alarm only swaps the model's
 * sentences for a neutral fallback, while a miss puts an endorsement under the For The People name.
 */
export const ENDORSEMENT_PATTERNS: readonly RegExp[] = [
  // Telling someone how to vote: "you should vote for", "voters should back", "Vote for Jon Ossoff."
  new RegExp(
    String.raw`\b(?:should|must|ought to|need to|have to)\s+(?:really\s+|definitely\s+|probably\s+|seriously\s+)?${PICK}\b`,
    "i",
  ),
  /(?:^|[.!?:;]\s+|["“(]\s*)(?:please\s+|just\s+)?(?:vote|go vote)\s+(?:for|against)\b/i,
  /(?:^|[.!?:;]\s+)(?:Support|Back|Elect|Re-?elect|Reelect|Choose|Pick|Reject|Defeat|Unseat|Replace)\s+(?:Sen\.|Senator|Rep\.|Representative|[A-Z][a-z]+\s+[A-Z])/,
  /(?:,|\bthen|\bso)\s+(?:vote|back|support|elect|re-?elect|choose|pick)\s+(?:for\s+|against\s+)?[A-Z]/,
  /\b(?:consider|try|keep|start|think about)\s+(?:voting|backing|supporting|electing|re-?electing|choosing|picking)\b/i,
  new RegExp(
    String.raw`\b(?:I|we)(?:'d|’d| would| will|'ll|’ll)?\s+(?:personally\s+|strongly\s+)?(?:recommend|endorse|suggest|urge|prefer|favou?r|pick|choose|${PICK})\b`,
    "i",
  ),
  /\bmy (?:vote|pick|choice|recommendation|endorsement) (?:is|goes|would)\b/i,
  // Ranking a person or option: "the better choice", "the best candidate", "Ossoff is the better senator".
  new RegExp(String.raw`\b${RANK}\s+${CHOICE}\b`, "i"),
  /\b(?:is|are|was|seems|looks)\s+(?:clearly\s+|far\s+|much\s+|simply\s+|obviously\s+)?(?:better|worse|superior|inferior|preferable|more qualified|less qualified|more trustworthy|less trustworthy)\b/i,
  /\bdeserves?\s+(?:your|a|the|another|to be|to win|re-?election|support|votes?|reelection)\b/i,
  /\b(?:worth|earned) (?:your|a) (?:vote|support)\b/i,
  // Predicting an outcome: "will likely win", "expected to win", "favored to", "will hold the Senate".
  new RegExp(String.raw`\b${FORECAST}\s+(?:\w+\s+){0,3}?${OUTCOME}\b`, "i"),
  /\bwould (?:win|lose|beat|defeat|prevail|be re-?elected|be defeated)\b/i,
  /\b(?:favou?red|favou?rite|poised|projected|predicted|expected|likely|unlikely|certain) to (?:win|lose|pass|fail|prevail|flip)\b/i,
  /\b(?:front-?runner|shoo-?in|toss-?up|safe seat|sure thing|in the lead|leads? in the polls?|ahead in the polls?|polls? (?:show|suggest|indicate|have|put|favou?r)|polling (?:shows|suggests|has)|odds (?:of|are|that|favou?r)|a lock (?:for|to)|(?:has|have|holds?) the (?:edge|advantage|upper hand))\b/i,
  /\bexpect(?:ed)?\s+(?:\w+\s+){1,3}?to (?:win|lose|pass|fail|prevail)\b/i,
  /\b(?:chances?|likelihood|probability) (?:of|that|to|for|are|is)\b/i,
  /\bI (?:predict|expect|forecast|bet|think (?:she|he|they|it) will)\b/i,
];

export function endorsesOrPredicts(text: string): boolean {
  return ENDORSEMENT_PATTERNS.some((pattern) => pattern.test(text));
}

/** Titles a member of Congress or a candidate goes by. */
const TITLE = String.raw`(?:Sen\.|Senator|Rep\.|Representative|Congressman|Congresswoman|Speaker|Leader|Majority Leader|Minority Leader|Delegate|Del\.|Governor|Gov\.|President)`;
/** A proper name of two or more capitalized words ("Ted Cruz", "Alexandria Ocasio-Cortez"). */
const NAME = String.raw`[A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)+`;

/**
 * Speaking as a real person: role-play, invented first-person statements, and invented quotes
 *. Ask For The People describes the record; it never
 * speaks for anyone on it.
 */
export const IMPERSONATION_PATTERNS: readonly RegExp[] = [
  // "I'm Ted Cruz", "My name is Senator Susan Collins" (Ask's own name is allowed).
  new RegExp(
    String.raw`\b(?:I am|I'm|I’m|[Mm]y name is)\s+(?!Ask For The People\b)(?:${TITLE}\s+)?${NAME}`,
  ),
  new RegExp(
    String.raw`\b(?:I am|I'm|I’m)\s+(?:a |the )?(?:${TITLE}|senator|representative|congressman|congresswoman|member of Congress)\b`,
    "i",
  ),
  // "As Senator Cruz, I voted", "As Ted Cruz, I", "As a senator, my vote"
  new RegExp(
    String.raw`\b[Aa]s\s+(?:(?:an? |the )?(?:${TITLE}|senator|representative|member of Congress)(?:\s+${NAME}|\s+[A-Z][\w'’.-]+)?|${NAME}),?\s+(?:I|I'm|I’m|my|we|our)\b`,
  ),
  /\b(?:speaking as|in my own words as|in the voice of|in (?:his|her|their) (?:own )?voice|in character as|pretending to be|pretend(?:ing)? I am|playing the role of|role-?playing as|if I were (?:Senator|Rep\.|Representative|[A-Z]))\b/i,
  // Imagined speech: "Collins would say", "he might argue", "she would tell you"
  /\b(?:would|might|could|will|may)\s+(?:probably\s+|likely\s+)?(?:say|argue|tell (?:you|voters|them)|respond|reply|answer that|explain that|defend (?:it|this|that|the vote) by)\b/i,
  // Quotes put in someone's mouth: `said, "..."`, `"...," said Cruz`, and quotes in the first person.
  /\b(?:said|says|stated|declared|argued|told (?:voters|reporters|them|you)|responded|replied|would say|might say)\s*[,:]?\s*["“]/i,
  /["“][^"”]{2,}["”],?\s+(?:said|says|argued|declared|stated|replied|responded)\b/i,
  /["“][^"”]*\b(?:I|I'm|I’m|I've|I’ve|I'd|I’d|my|we|our|me)\b[^"”]*["”]/,
];

export function impersonatesPerson(text: string): boolean {
  return IMPERSONATION_PATTERNS.some((pattern) => pattern.test(text));
}
