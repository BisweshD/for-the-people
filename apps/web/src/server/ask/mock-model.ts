import type {
  JSONValue,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { StateCode } from "@for-the-people/core";
import { parseMeasureReference } from "@for-the-people/data/read/ask";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { formatDate, STATE_NAMES } from "@/lib/format";
import { otherChamberNote } from "./tools";

/**
 * The demo model used when no ANTHROPIC_API_KEY is configured. It is not Claude: it reads the question
 * with fixed rules, calls the same real tools the real model would, and writes templated sentences
 * from the tools' real results. It never invents a fact; with no result it says "No record yet."
 */

export const MOCK_MODEL_ID = "for-the-people-demo-templates";

type ToolCall = { toolName: string; input: Record<string, unknown> };
type ToolResult = { toolName: string; value: Record<string, unknown> };

export type Intent =
  | { kind: "refuse"; reason: "endorse" | "predict" | "impersonate" }
  | { kind: "method"; topic: "match" | "party-unity" | "missed-votes" | "compare" }
  | { kind: "my-representatives" }
  | { kind: "roll-call"; rollCallId: string }
  | { kind: "compare"; names: [string, string] }
  | { kind: "money"; name: string }
  | { kind: "person-votes"; name: string; topic: string | null }
  | { kind: "person"; name: string }
  | { kind: "state-members"; state: StateCode; chamber: "house" | "senate" | null }
  | { kind: "measure"; text: string }
  | { kind: "key-votes"; topic: string | null }
  | { kind: "unknown" };

/** Requests to speak as a real person: role-play, invented speeches and quotes, staged debates. */
const IMPERSONATE_PATTERNS = [
  /\b(pretend|role-?play|act as if|act like|speak as|speaking as|answer as|respond as|reply as|talk as|write as|in the voice of|impersonat|imitat)/,
  /\bin (his|her|their) (own )?(words|voice)\b/,
  /\b(you are|you're|as if you were|if you were) (now )?(senator|sen\.|rep\.|representative|congressman|congresswoman)\b/,
  /\b(write|draft|give me|compose|script|generate|make up)\b.*\b(speech|statement|quote|debate|monologue|dialogue|tweet|op-ed|letter|rebuttal|press release)\b/,
  /\bdebate between\b/,
  /\bwhat would .+ (say|tell|argue|respond|reply)\b/,
];

const ENDORSE_PATTERNS = [
  /\bshould i (vote|support|back|pick|choose)\b/,
  /\bwho (should|do you think i should|would you) (vote|pick|choose|support)\b/,
  /\b(who|which)\b.*\b(to vote for|should win|deserves?)\b/,
  /\bwho(?: is|'s) (the )?(best|better|worse|worst|right)\b/,
  /\b(is|are) (better|worse)\b/,
  /\b(best|better|worst|worse) (candidate|choice|senator|representative|member|option|party)\b/,
  /\b(endorse|recommend)\b/,
  /\bis .+ a good (senator|representative|candidate|member|choice)\b/,
  /\bshould .+ be (re-?elected|voted out|replaced)\b/,
];

const PREDICT_PATTERNS = [
  /\bpredict/,
  /\bforecast/,
  /\bwho(?: will|'ll|'s going to| is going to) win\b/,
  /\bwill .+ (win|lose|pass|fail|be re-?elected|keep (his|her|their) seat)\b/,
  /\b(going|likely) to (win|lose|pass|fail)\b/,
  /\b(odds|chances?) (of|that|for)\b/,
];

const TOPIC_BY_METHOD: Array<[RegExp, "match" | "party-unity" | "missed-votes" | "compare"]> = [
  [/\bmiss(ed|es|ing)?\b|\babsen|attendance/, "missed-votes"],
  [/\bparty[- ]line|\bwith (their|his|her) party|party unity/, "party-unity"],
  [/\bcompar/, "compare"],
  [/\bmatch|score/, "match"],
];

const NOT_A_NAME = new Set(
  (
    "how what who whom whose which when where why did does do is are was were has have had can could " +
    "would should will tell show give list compare find the a an and or of on in to for with about " +
    "senator sen rep representative congressman congresswoman member members congress house senate " +
    "u.s us united states america american act bill law resolution vote votes voted voting yea nay " +
    "i my me we our you your people ask please explain what's who's key issue issues party republican " +
    "democrat democrats republicans independent money fec donors pac pacs " +
    "ukraine russia iran israel canada mexico china california texas florida"
  ).split(" "),
);

const STATE_BY_NAME = new Map(
  Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code as StateCode]),
);

const cleanName = (text: string): string =>
  text
    .replace(/'s\b/g, "")
    .replace(/\b(senator|sen\.?|rep\.?|representative|congressman|congresswoman)\s+/gi, "")
    .replace(/[?.!,]+$/g, "")
    .trim();

/** Capitalized word runs that look like a person's name, not a bill, place, or question word. */
function nameCandidates(question: string): string[] {
  const runs =
    question.match(
      /\b(?:[A-Z][a-zA-Z'’.-]*(?:\s+(?:de|del|la|van|von|Mc|Mac)?\s*[A-Z][a-zA-Z'’.-]*){0,3})/g,
    ) ?? [];
  const names: string[] = [];
  for (const run of runs) {
    const index = question.indexOf(run);
    const after = question.slice(index + run.length);
    if (/^\s+(Act|Bill|Resolution|Amendment)\b/.test(after) || /\b(Act|Bill)$/.test(run)) continue;
    // Bill labels such as "H.R." and "H.J.Res." are not names.
    if (/^[HS]\./.test(run)) continue;
    const words = cleanName(run)
      .split(/\s+/)
      .filter((word) => word && !NOT_A_NAME.has(word.toLowerCase().replace(/[.'’]/g, "")));
    if (words.length === 0) continue;
    const name = words.join(" ");
    if (name.length >= 3 && !STATE_BY_NAME.has(name.toLowerCase())) names.push(name);
  }
  return names;
}

const LOWERCASE_NAME =
  /\b(?:did|does|has|have|is|was|about|for|on)\s+(?:senator\s+|sen\.?\s+|rep\.?\s+|representative\s+)?([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?)(?:'s)?\s+(?:vote|voted|voting|votes|record|stand)\b/i;

function personName(question: string): string | null {
  const candidates = nameCandidates(question);
  if (candidates[0]) return candidates[0];
  const lower = LOWERCASE_NAME.exec(question)?.[1];
  if (!lower) return null;
  const words = lower.split(/\s+/).filter((word) => !NOT_A_NAME.has(word.toLowerCase()));
  return words.length > 0 ? words.join(" ") : null;
}

function topicAfter(question: string): string | null {
  const match = /\b(?:on|about|regarding|for)\s+(?:the\s+)?(.+?)[?.!]*$/i.exec(question);
  const topic = match?.[1]?.trim();
  return topic && topic.length >= 2 ? topic : null;
}

function stateIn(question: string): StateCode | null {
  const lower = question.toLowerCase();
  const byName = [...STATE_BY_NAME.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([name]) => new RegExp(`\\b${name}\\b`).test(lower));
  return byName ? byName[1] : null;
}

/** Reads a question with fixed rules. Exported so tests and evals can check the routing. */
export function classifyQuestion(question: string): Intent {
  const lower = question.toLowerCase();
  if (IMPERSONATE_PATTERNS.some((pattern) => pattern.test(lower)))
    return { kind: "refuse", reason: "impersonate" };
  if (ENDORSE_PATTERNS.some((pattern) => pattern.test(lower)))
    return { kind: "refuse", reason: "endorse" };
  if (PREDICT_PATTERNS.some((pattern) => pattern.test(lower)))
    return { kind: "refuse", reason: "predict" };

  const asksMethod =
    /\bmethodolog|\bhow (do|does|did) (you|for the people|ask for the people|the site|this app)\b|\bhow (is|are) .+ (calculated|computed|counted|scored)|\bhow (does|do) (the )?(match|score)|\bwhat does .+ (mean|count)\b/.test(
      lower,
    );
  if (asksMethod) {
    const topic = TOPIC_BY_METHOD.find(([pattern]) => pattern.test(lower))?.[1] ?? "match";
    return { kind: "method", topic };
  }

  if (
    /\bmy (rep|reps|representative|representatives|senators?|members?|congress(wo)?man|district)\b|\bwho represents me\b/.test(
      lower,
    )
  )
    return { kind: "my-representatives" };

  const rollCallId = /\b(house|senate)-\d{2,3}-[12]-\d+\b/i.exec(question)?.[0];
  if (rollCallId) return { kind: "roll-call", rollCallId: rollCallId.toLowerCase() };

  const names = nameCandidates(question);
  if (/\b(compare|versus|vs\.?|differ|same way|agree)\b/.test(lower) && names.length >= 2)
    return { kind: "compare", names: [names[0]!, names[1]!] };

  const name = personName(question);
  if (
    name &&
    /\b(fund|funds|funded|funding|money|donor|donors|raise|raised|raising|pac|pacs|finance|cash)\b/.test(
      lower,
    )
  )
    return { kind: "money", name };

  if (name && /\bmiss(ed|es|ing)?\b|\bparty\b|\brecord\b|\battendance\b/.test(lower))
    return { kind: "person", name };

  if (name && /\bvot(e|ed|es|ing)\b|\bstand\b|\bsupport(ed)?\b|\boppose(d)?\b/.test(lower)) {
    const topic = topicAfter(question);
    return { kind: "person-votes", name, topic: topic && !topic.includes(name) ? topic : null };
  }

  const state = stateIn(question);
  if (state && /\b(senators?|representatives?|members?|delegation|who represents)\b/.test(lower)) {
    const chamber = /\bsenat/.test(lower)
      ? "senate"
      : /\b(house|representatives?)\b/.test(lower)
        ? "house"
        : null;
    return { kind: "state-members", state, chamber };
  }

  if (name && /\b(who is|who's|tell me about|about|profile)\b/.test(lower))
    return { kind: "person", name };

  const reference = parseMeasureReference(question);
  const actTitle = /\b((?:[A-Z][\w'.-]*\s+){0,6}(?:Act|Bill|Resolution))\b/.exec(question)?.[1];
  if (reference || actTitle) return { kind: "measure", text: actTitle ?? question };

  if (/\b(key votes?|bills?|votes?|cards?|swipe)\b/.test(lower)) {
    return { kind: "key-votes", topic: topicAfter(question) };
  }
  return { kind: "unknown" };
}

const lastUserText = (prompt: LanguageModelV3Prompt): { text: string; index: number } => {
  for (let index = prompt.length - 1; index >= 0; index--) {
    const message = prompt[index]!;
    if (message.role === "user") {
      const text = message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(" ");
      return { text, index };
    }
  }
  return { text: "", index: -1 };
};

function resultsSince(prompt: LanguageModelV3Prompt, from: number): ToolResult[] {
  const results: ToolResult[] = [];
  for (const message of prompt.slice(from + 1)) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      const value: JSONValue =
        part.output.type === "json" ? part.output.value : { error: "tool failed" };
      results.push({ toolName: part.toolName, value: (value ?? {}) as Record<string, unknown> });
    }
  }
  return results;
}

type Person = { id: string; name: string; office: string };
const people = (result: ToolResult | undefined): Person[] =>
  ((result?.value.people as Person[] | undefined) ?? []).filter(Boolean);

const find = (results: ToolResult[], toolName: string) =>
  results.filter((result) => result.toolName === toolName);

const joinNames = (names: string[]): string =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;

type Step = { calls: ToolCall[] } | { text: string };

const REFUSE_ENDORSE =
  "I can't recommend candidates or tell you how to vote. To see who votes like you, answer the key votes on the Swipe page and check your matches.";
const REFUSE_PREDICT =
  "I can't predict elections or other outcomes. I can show how members voted on the record, and the Swipe page shows who votes like you.";
const REFUSE_IMPERSONATE =
  "I can't speak for any member of Congress or write words they did not say. I can show how members voted on the official record, and each vote links to its receipt.";
const UNKNOWN =
  "I can answer questions about how members of Congress voted, what bills did, and how For The People counts. Try asking about a member, a bill, or an issue.";

const notFound = (name: string) =>
  `No record yet. I could not find a member of Congress named ${name}.`;

type Side = { vote: string; rollCall: string; date: string } | string;

/**
 * How getVotes marks a key vote held only in the other chamber: "House vote only: senators do not vote
 * on House roll calls". Written as such, never as "did not vote", which means a Not Voting position.
 */
const HELD_ELSEWHERE = /^(House|Senate) vote only: (.+)$/;

const describeSide = (name: string, keyVote: string, side: Side): string => {
  if (typeof side === "string") {
    const elsewhere = HELD_ELSEWHERE.exec(side);
    return elsewhere
      ? `${keyVote} has only a ${elsewhere[1]} roll call; ${elsewhere[2]}.`
      : `${name} has no recorded vote on ${keyVote}.`;
  }
  const where = `in ${side.rollCall} on ${formatDate(side.date)}`;
  if (side.vote === "Did not vote") return `${name} did not vote on ${keyVote} ${where}.`;
  return `${name} voted ${side.vote} on ${keyVote} ${where}.`;
};

/** getVotes' counts, as the model reads them. */
type VoteCounts = {
  keyVotes: number;
  /** Present only when fewer key votes are listed than counted. */
  listedBelow?: number;
  heldInTheirChamber: number;
  theirChamber: string;
  votedYea: number;
  votedNay: number;
  votedPresent: number;
  didNotVote: number;
  noRecordedVote: number;
  heldOnlyInOtherChamber: number;
  otherChamber: string;
};

type MatchWithVoter = string | { percent: string; agreements: number; sharedVotes: number };

/** "a", "a and b", "a, b and c". */
const joinAnd = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * "Ted Cruz voted Yea on 8 and Nay on 5 of the 13 key votes held in the Senate; the other 7 have only
 * a House roll call." Every number is one of getVotes' counts, which cover every key vote it chose. A
 * key vote held only in the other chamber is named as such, never as a missed vote. When a limit
 * listed fewer, the answer says how many are listed.
 */
function summarizeVotes(name: string, counts: VoteCounts, issue: string | null): string {
  const about = issue ? ` on ${issue.toLowerCase()}` : "";
  const other = counts.heldOnlyInOtherChamber;
  const held = counts.heldInTheirChamber;
  const listed =
    counts.listedBelow === undefined
      ? ""
      : ` The list below shows ${counts.listedBelow} of these ${counts.keyVotes} key votes.`;
  const scope =
    other > 0
      ? `of the ${held} key ${held === 1 ? "vote" : "votes"}${about} held in the ${counts.theirChamber}`
      : `of ${counts.keyVotes} key votes${about}`;
  const sides = [
    counts.votedYea > 0 ? `Yea on ${counts.votedYea}` : null,
    counts.votedNay > 0 ? `Nay on ${counts.votedNay}` : null,
    counts.votedPresent > 0 ? `Present on ${counts.votedPresent}` : null,
  ].filter((item): item is string => item !== null);
  const rest = [
    counts.didNotVote > 0 ? `did not vote on ${counts.didNotVote}` : null,
    counts.noRecordedVote > 0 ? `has no recorded vote on ${counts.noRecordedVote}` : null,
  ].filter((item): item is string => item !== null);
  if (held === 0)
    return `All ${counts.keyVotes} key votes${about} have only a ${counts.otherChamber} roll call; ${otherChamberNote(counts.otherChamber === "House" ? "house" : "senate")}.${listed}`;
  // "voted Yea on 6 and Nay on 3 of 10 key votes, did not vote on 1"; with no side taken, the rest
  // carries the scope: "did not vote on 2 of the 2 key votes held in the Senate".
  const body =
    sides.length > 0
      ? joinAnd([`voted ${joinAnd(sides)} ${scope}`, ...rest])
      : `${joinAnd(rest)} ${scope}`;
  const elsewhere =
    other > 0
      ? `; the other ${other} ${other === 1 ? "has" : "have"} only a ${counts.otherChamber} roll call`
      : "";
  return `${name} ${body}${elsewhere}.${listed}`;
}

function describeMatch(name: string, match: MatchWithVoter): string {
  if (typeof match === "string") return `${name} and you have no key votes in common yet.`;
  return `They agree with you on ${match.agreements} of ${match.sharedVotes} key votes where you both took a side.`;
}

type RollCallSummary = {
  chamber: string;
  number: number;
  date: string;
  result: string;
  yea: number;
  nay: number;
  question: string;
};

const describeRollCall = (rollCall: RollCallSummary): string =>
  `In ${rollCall.chamber} roll call ${rollCall.number} on ${formatDate(rollCall.date)}, the result was ${rollCall.result.toLowerCase()}, ${rollCall.yea} Yea to ${rollCall.nay} Nay.`;

/** Decides the next step: which tools to call, or the final templated sentences. */
export function planStep(intent: Intent, results: ToolResult[]): Step {
  switch (intent.kind) {
    case "refuse":
      return {
        text:
          intent.reason === "endorse"
            ? REFUSE_ENDORSE
            : intent.reason === "predict"
              ? REFUSE_PREDICT
              : REFUSE_IMPERSONATE,
      };
    case "unknown":
      return { text: UNKNOWN };
    case "method": {
      const method = find(results, "explainMethod")[0];
      if (!method)
        return { calls: [{ toolName: "explainMethod", input: { topic: intent.topic } }] };
      const summary = String(method.value.method);
      return {
        text: `${String(method.value.title)}: ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
      };
    }
    case "my-representatives": {
      const found = find(results, "myRepresentatives")[0];
      // The tool reads the voter's districts from the request; the model never sees them.
      if (!found) return { calls: [{ toolName: "myRepresentatives", input: {} }] };
      if (found.value.status === "no-location")
        return {
          text: "Add your address on the Ballot page, and I can show your members of Congress.",
        };
      const names = people(found).map((person) => person.name);
      if (names.length === 0) return { text: "No record yet of members for your district." };
      return {
        text: `Your members of Congress are ${joinNames(names)}. Each result shows their office and party.`,
      };
    }
    case "roll-call": {
      const found = find(results, "getRollCall")[0];
      if (!found)
        return { calls: [{ toolName: "getRollCall", input: { rollCallId: intent.rollCallId } }] };
      const rollCall = found.value.rollCall as RollCallSummary | null;
      if (!rollCall) return { text: "No record yet of a roll call with that number." };
      return {
        text: `${rollCall.chamber} roll call ${rollCall.number}, on ${formatDate(rollCall.date)}, was a vote on "${rollCall.question}". The result was ${rollCall.result.toLowerCase()}, ${rollCall.yea} Yea to ${rollCall.nay} Nay.`,
      };
    }
    case "compare": {
      const lookups = find(results, "findPeople");
      if (lookups.length < 2)
        return {
          calls: intent.names.map((name) => ({
            toolName: "findPeople",
            input: { name, includeFormer: true },
          })),
        };
      const [a, b] = lookups.map((lookup) => people(lookup)[0]);
      if (!a) return { text: notFound(intent.names[0]) };
      if (!b) return { text: notFound(intent.names[1]) };
      const compared = find(results, "compare")[0];
      if (!compared) return { calls: [{ toolName: "compare", input: { aId: a.id, bId: b.id } }] };
      const shared = Number(compared.value.keyVotesBothVotedOn);
      const same = Number(compared.value.sameSide);
      if (shared === 0)
        return {
          text: `No record yet of key votes where both ${a.name} and ${b.name} voted Yea or Nay.`,
        };
      return {
        text: `${a.name} and ${b.name} both voted Yea or Nay on ${shared} key votes and took the same side on ${same} of them. Each vote below links to its receipt.`,
      };
    }
    case "money":
    case "person":
    case "person-votes": {
      const lookup = find(results, "findPeople")[0];
      if (!lookup)
        return {
          calls: [{ toolName: "findPeople", input: { name: intent.name, includeFormer: true } }],
        };
      const person = people(lookup)[0];
      if (!person) return { text: notFound(intent.name) };
      if (intent.kind === "money") {
        if (!find(results, "getMoney")[0])
          return { calls: [{ toolName: "getMoney", input: { personId: person.id, cycle: 2026 } }] };
        return {
          text: `No record yet. Campaign finance totals for ${person.name} are not loaded yet.`,
        };
      }
      if (intent.kind === "person") {
        const profile = find(results, "getPerson")[0];
        if (!profile) return { calls: [{ toolName: "getPerson", input: { personId: person.id } }] };
        const record = profile.value.record as
          | {
              votedWithMostOfTheirParty: string;
              partyLineVotesCounted: number;
              missedVotes: number;
              rollCallsWhileServing: number;
            }
          | string;
        // "U.S. Senator, Texas" reads as a label; the sentence wants "a U.S. Senator from Texas".
        const office = person.office
          .replace(/^U\.S\. Senator, (.+)$/, "a U.S. Senator from $1")
          .replace(/^U\.S\. Representative, (.+)$/, "the U.S. Representative for $1")
          .replace(/^(Delegate|Resident Commissioner), (.+)$/, "the $1 for $2");
        const intro = `${person.name} is ${office}.`;
        if (typeof record === "string")
          return { text: `${intro} No record yet of their roll call votes.` };
        return {
          text: `${intro} They voted with most of their party on ${record.votedWithMostOfTheirParty} of ${record.partyLineVotesCounted} votes where most Democrats and most Republicans voted opposite ways, and missed ${record.missedVotes} of ${record.rollCallsWhileServing} roll calls.`,
        };
      }
      const votes = find(results, "getVotes")[0];
      if (!votes)
        return {
          calls: [
            {
              toolName: "getVotes",
              input: { personId: person.id, ...(intent.topic ? { issue: intent.topic } : {}) },
            },
          ],
        };
      const list = (votes.value.votes as Array<{ keyVote: string; memberVote: Side }>) ?? [];
      const first = list[0];
      if (!first)
        return { text: `No record yet of ${person.name} voting on a key vote about that.` };
      const counts = votes.value.counts as VoteCounts;
      // One or two key votes are the answer themselves; more are summarized by their counts.
      if (counts.keyVotes <= 2)
        return {
          text: list
            .map((vote) => describeSide(person.name, vote.keyVote, vote.memberVote))
            .join(" "),
        };
      const issue = String(votes.value.issue);
      const summary = summarizeVotes(person.name, counts, issue === "all issues" ? null : issue);
      const match = (votes.value.person as { matchWithVoter?: MatchWithVoter } | null)
        ?.matchWithVoter;
      return { text: match ? `${summary} ${describeMatch(person.name, match)}` : summary };
    }
    case "state-members": {
      const lookup = find(results, "findPeople")[0];
      if (!lookup)
        return {
          calls: [
            {
              toolName: "findPeople",
              input: {
                state: intent.state,
                ...(intent.chamber ? { chamber: intent.chamber } : {}),
                limit: 10,
              },
            },
          ],
        };
      const names = people(lookup).map((person) => person.name);
      if (names.length === 0)
        return { text: `No record yet of members from ${STATE_NAMES[intent.state]}.` };
      const shown =
        names.length > 4 ? `${names.slice(0, 3).join(", ")}, and others` : joinNames(names);
      return {
        text: `Members from ${STATE_NAMES[intent.state]} include ${shown}. Each result shows their office and party.`,
      };
    }
    case "measure": {
      const found = find(results, "getMeasure")[0];
      if (!found) return { calls: [{ toolName: "getMeasure", input: { measure: intent.text } }] };
      const measures =
        (found.value.measures as Array<{
          label: string;
          title: string;
          becameLaw: boolean;
          latestActionDate: string;
          rollCalls: RollCallSummary[];
        }>) ?? [];
      const measure = measures[0];
      if (!measure) return { text: "No record yet of a bill by that name in this Congress." };
      const status = measure.becameLaw
        ? `${measure.label}, ${measure.title}, became law.`
        : `${measure.label}, ${measure.title}, had its latest action on ${formatDate(measure.latestActionDate)}.`;
      const lastVote = measure.rollCalls.at(-1);
      return {
        text: lastVote
          ? `${status} ${describeRollCall(lastVote)}`
          : `${status} No recorded vote yet.`,
      };
    }
    case "key-votes": {
      const found = find(results, "getKeyVotes")[0];
      if (!found)
        return {
          calls: [{ toolName: "getKeyVotes", input: intent.topic ? { issue: intent.topic } : {} }],
        };
      const keyVotes = (found.value.keyVotes as Array<{ title: string }>) ?? [];
      if (keyVotes.length === 0) return { text: "No record yet of a key vote on that issue." };
      const issue = String(found.value.issue);
      return {
        text: `These are For The People's key votes on ${issue}, each checked against the official roll call. They include ${joinNames(keyVotes.slice(0, 2).map((keyVote) => keyVote.title))}.`,
      };
    }
  }
}

const ZERO_USAGE = (input: number, output: number): LanguageModelV3Usage => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

function hashOf(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function chunksFor(prompt: LanguageModelV3Prompt): LanguageModelV3StreamPart[] {
  const { text: question, index } = lastUserText(prompt);
  const results = resultsSince(prompt, index);
  const step = planStep(classifyQuestion(question), results);
  const inputTokens = Math.ceil(JSON.stringify(prompt).length / 4);
  if ("calls" in step) {
    const stepNumber = prompt
      .slice(index + 1)
      .filter((message) => message.role === "assistant").length;
    const parts: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
    step.calls.forEach((call, callIndex) => {
      const id = `demo_${hashOf(question)}_${stepNumber}_${callIndex}`;
      const input = JSON.stringify(call.input);
      parts.push(
        { type: "tool-input-start", id, toolName: call.toolName },
        { type: "tool-input-delta", id, delta: input },
        { type: "tool-input-end", id },
        { type: "tool-call", toolCallId: id, toolName: call.toolName, input },
      );
    });
    parts.push({
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_use" },
      usage: ZERO_USAGE(inputTokens, 20 * step.calls.length),
    });
    return parts;
  }
  const words = step.text.split(/(?<= )/);
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text" },
    ...words.map((delta): LanguageModelV3StreamPart => ({ type: "text-delta", id: "text", delta })),
    { type: "text-end", id: "text" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "end_turn" },
      usage: ZERO_USAGE(inputTokens, Math.ceil(step.text.length / 4)),
    },
  ];
}

/** A fresh mock per request: it keeps a log of its calls, which should not outlive the request. */
export function createMockAskModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "for-the-people",
    modelId: MOCK_MODEL_ID,
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({ chunks: chunksFor(prompt) }),
    }),
  });
}
