import type { MeasureType, RollCall } from "@for-the-people/core/client";

/**
 * Plain-words outcomes for measures and roll calls, derived from the official record: the measure's type,
 * whether it became law, its recorded votes, and its latest action. Procedural follow-ups such as
 * "Motion to reconsider laid on the table" never decide the outcome.
 */

/** Questions that decide a measure's fate in one chamber (passage, concurrence, agreeing to it). */
const PASSAGE =
  /^On (Passage|the Passage|Passage of the Bill|Motion to Suspend the Rules and (Pass|Agree)|Motion to Concur|the Motion to Concur|the Joint Resolution|the Concurrent Resolution|the Resolution|Agreeing to the Resolution|the Conference Report|Agreeing to the Conference Report)/i;

export const isPassageVote = (rollCall: Pick<RollCall, "question">): boolean =>
  PASSAGE.test(rollCall.question);

/** The chamber's own words for a question that failed, and for one that carried. */
export const FAILED = /fail|defeat|reject|not agreed|not passed/i;
export const SUCCEEDED = /pass|agreed to/i;

export type OutcomeVote = Pick<RollCall, "chamber" | "question" | "result" | "date" | "number">;

export interface MeasureOutcome {
  label: string;
  /** "law" and "adopted" read as done; "failed" and "pending" do not. */
  tone: "law" | "adopted" | "passed" | "failed" | "pending";
  /** One sentence for resolutions, which never go to the President. */
  note: string | null;
}

type Chamber = "house" | "senate";
type Stage = "agreed" | "failed" | null;

/** The latest passage vote in a chamber decides that chamber's stage. */
function stageFromVotes(votes: readonly OutcomeVote[], chamber: Chamber): Stage {
  const latest = votes
    .filter((vote) => vote.chamber === chamber && isPassageVote(vote))
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
    .at(-1);
  if (!latest) return null;
  if (FAILED.test(latest.result)) return "failed";
  return SUCCEEDED.test(latest.result) ? "agreed" : null;
}

/** What the latest official action says about each chamber, when a voice vote left no roll call. */
function stageFromAction(action: string, origin: Chamber): Partial<Record<Chamber, Stage>> {
  if (/agreed to in Senate|passed Senate|Message on Senate action sent to the House/i.test(action))
    return { senate: "agreed" };
  if (/agreed to in House|passed House|Message on House action received in Senate/i.test(action))
    return { house: "agreed" };
  // A measure that reached the other chamber passed the one it started in.
  if (
    origin === "house" &&
    /^(Received in the Senate|Read twice|Read the second time|Placed on Senate Legislative Calendar)/i.test(
      action,
    )
  )
    return { house: "agreed" };
  if (origin === "senate" && /^(Held at the desk|Received in the House)/i.test(action))
    return { senate: "agreed" };
  if (/Failed of passage in Senate|not agreed to in Senate/i.test(action))
    return { senate: "failed" };
  if (/Failed of passage in House|not agreed to in House/i.test(action)) return { house: "failed" };
  return {};
}

const CHAMBER_NAME: Record<Chamber, string> = { house: "House", senate: "Senate" };

/**
 * A vote to override a veto: the House prints "Passage, Objections of the President To The Contrary
 * Notwithstanding", the Senate "On Overriding the Veto". Either one proves the bill passed both chambers
 * and was vetoed. The Senate records a failed override as "Veto Sustained".
 */
const OVERRIDE = /Objections of the President|On Overriding the Veto/i;
const OVERRIDE_FAILED = /fail|sustained|reject|not agreed|not passed/i;
const OVERRIDE_SUCCEEDED = /overridden|pass|agreed to/i;

function vetoOutcome(votes: readonly OutcomeVote[]): MeasureOutcome | null {
  const overrides = votes
    .filter((vote) => OVERRIDE.test(vote.question))
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  if (overrides.length === 0) return null;
  const failed = overrides.find((vote) => OVERRIDE_FAILED.test(vote.result));
  if (failed)
    return {
      label: `Vetoed; override failed in the ${CHAMBER_NAME[failed.chamber]}`,
      tone: "failed",
      note: null,
    };
  const overrode = new Set(
    overrides.filter((vote) => OVERRIDE_SUCCEEDED.test(vote.result)).map((vote) => vote.chamber),
  );
  if (overrode.has("house") && overrode.has("senate"))
    return { label: "Vetoed; override succeeded", tone: "law", note: null };
  const [chamber] = overrode;
  return chamber
    ? {
        label: `Vetoed; the ${CHAMBER_NAME[chamber]} voted to override`,
        tone: "pending",
        note: null,
      }
    : { label: "Vetoed", tone: "failed", note: null };
}

/**
 * A latest action that stops a measure short of a final vote: a rejected motion to proceed or to
 * discharge, cloture not invoked, a tabled or fallen motion, or indefinite postponement. A pending motion
 * to reconsider such a vote keeps the measure open.
 */
const STOPPED = /\b(rejected|not invoked|failed|tabled|fell)\b|^Indefinitely postponed/i;
const REOPENED = /\bto reconsider the vote\b/i;

/** Both chambers passed it, but a conference or an exchange of amendments shows the texts differ. */
const DIFFERENT_VERSIONS = /\bconference\b|amendments? between the houses/i;

export function measureOutcome(
  measure: { type: MeasureType; becameLaw: boolean; latestAction: string },
  votes: readonly OutcomeVote[],
): MeasureOutcome {
  if (measure.becameLaw) return { label: "Became law", tone: "law", note: null };
  const veto = vetoOutcome(votes);
  if (veto) return veto;
  const origin: Chamber = measure.type.startsWith("h") ? "house" : "senate";
  const fromAction = stageFromAction(measure.latestAction, origin);
  const stage = (chamber: Chamber): Stage =>
    stageFromVotes(votes, chamber) ?? fromAction[chamber] ?? null;
  const house = stage("house");
  const senate = stage("senate");

  if (measure.type === "hres" || measure.type === "sres") {
    const chamber = measure.type === "hres" ? "house" : "senate";
    const note = `A simple resolution is decided by the ${CHAMBER_NAME[chamber]} alone and does not become law.`;
    const own = chamber === "house" ? house : senate;
    if (own === "agreed")
      return {
        label: chamber === "house" ? "Adopted by the House" : "Agreed to by the Senate",
        tone: "adopted",
        note,
      };
    if (own === "failed") return { label: "Not adopted", tone: "failed", note };
    const tabled = votes.some(
      (vote) => /^On (the )?Motion to Table/i.test(vote.question) && SUCCEEDED.test(vote.result),
    );
    return tabled
      ? { label: "Tabled", tone: "failed", note }
      : { label: "No final vote yet", tone: "pending", note };
  }

  if (measure.type === "hconres" || measure.type === "sconres") {
    const note =
      "A concurrent resolution must pass both the House and Senate. It does not go to the President and does not become law.";
    if (house === "agreed" && senate === "agreed")
      return { label: "Agreed to by both chambers", tone: "adopted", note };
    if (house === "failed" || senate === "failed")
      return {
        label: `Not agreed to by the ${CHAMBER_NAME[house === "failed" ? "house" : "senate"]}`,
        tone: "failed",
        note,
      };
    if (house === "agreed") return { label: "Agreed to by the House", tone: "passed", note };
    if (senate === "agreed") return { label: "Agreed to by the Senate", tone: "passed", note };
    return { label: "No final vote yet", tone: "pending", note };
  }

  if (/Vetoed/i.test(measure.latestAction) && house === "agreed" && senate === "agreed")
    return { label: "Vetoed", tone: "failed", note: null };
  if (house === "agreed" && senate === "agreed")
    return {
      label: DIFFERENT_VERSIONS.test(measure.latestAction)
        ? "Passed both chambers in different versions"
        : "Passed both chambers",
      tone: "passed",
      note: null,
    };
  if (house === "failed") return { label: "Failed in the House", tone: "failed", note: null };
  if (senate === "failed") return { label: "Failed in the Senate", tone: "failed", note: null };
  if (house === "agreed") return { label: "Passed the House", tone: "passed", note: null };
  if (senate === "agreed") return { label: "Passed the Senate", tone: "passed", note: null };
  const stopped = STOPPED.test(measure.latestAction) && !REOPENED.test(measure.latestAction);
  return { label: stopped ? "Not passed" : "No final vote yet", tone: "pending", note: null };
}

/** The vote needed to win, when it is more than a simple majority. */
export function thresholdText(rollCall: {
  chamber: RollCall["chamber"];
  requires?: string | null;
}): string | null {
  if (rollCall.requires === "2/3") return "Needed two-thirds of those voting";
  if (rollCall.requires === "3/5")
    return rollCall.chamber === "senate"
      ? "Needed three-fifths of all senators (60 when every seat is filled)"
      : "Needed three-fifths of those voting";
  return null;
}

/**
 * The result as the chamber printed it, except a quorum call, which the Clerk prints as "Passed" with no
 * Yea or Nay: it reads as how many members answered.
 */
export function resultText(rollCall: Pick<RollCall, "question" | "result" | "totals">): string {
  if (/^(Call of the House|Quorum Call)$/i.test(rollCall.question.trim()))
    return `Quorum present, ${rollCall.totals.present.toLocaleString("en-US")} answered`;
  return rollCall.result;
}

/**
 * Plain words for the chamber's procedural questions, from a fixed list written by hand (never
 * generated). Order matters: the first match wins. A question that names no action ("On the Motion")
 * is glossed from the roll call's description instead (MOTION_TITLE_GLOSS), or not at all.
 */
const QUESTION_GLOSS: Array<[RegExp, string]> = [
  [/Objections of the President/i, "A vote to override the President's veto"],
  [
    /^On Motion to Suspend the Rules and Concur/i,
    "A vote to accept the Senate's changes under a fast-track process that needs a two-thirds vote",
  ],
  [
    /^On Motion to Suspend the Rules and Pass/i,
    "A vote to pass the bill under a fast-track process that needs a two-thirds vote",
  ],
  [
    /^On Motion to Suspend the Rules and Agree/i,
    "A vote to adopt the measure under a fast-track process that needs a two-thirds vote",
  ],
  [
    /^On (the )?Motion to Concur in the Senate Amendment/i,
    "A vote to accept the Senate's changes to the bill",
  ],
  [
    /^On Cloture on the Motion to Proceed/i,
    "A vote to end debate on whether to take up the measure",
  ],
  [/^On the Cloture Motion$/i, "A vote to end debate and move toward a final vote"],
  [/^On the Nomination$/i, "A vote to confirm the nominee"],
  [/^On (the )?Passage( of the Bill)?$/i, "A vote to pass the bill"],
  [/^On (the )?(Agreeing to the )?Amendment/i, "A vote to change the bill's text"],
  [/^On (Agreeing to )?the Resolution/i, "A vote to adopt the resolution"],
  [/^On the (Joint|Concurrent) Resolution$/i, "A vote to pass the resolution"],
  [/^On the Motion to Proceed$/i, "A vote to begin considering the measure"],
  [/^On (the )?Motion to Recommit/i, "A vote to send the bill back to committee"],
  [/^On (the )?Motion to (Commit|Refer)/i, "A vote to send the bill to a committee"],
  [
    /^On Ordering the Previous Question$/i,
    "A vote to end debate on the rule (the terms for debating a bill) and vote on it",
  ],
  [/^On (the )?Motion to Table/i, "A vote to set the question aside"],
  [/^On (the )?Motion to Discharge/i, "A vote to take the measure out of committee"],
  [/^On (the )?Motion to Reconsider/i, "A vote to reconsider an earlier vote"],
  [/^On (the )?Motion to Adjourn/i, "A vote to adjourn"],
  [/^On Motion to Instruct Conferees/i, "A vote to instruct the chamber's negotiators"],
  [/^On Consideration of the Resolution/i, "A vote to take up the resolution"],
  [/^On the Point of Order$/i, "A vote on a procedural objection"],
  [/^On the Decision of the Chair$/i, "A vote on whether to uphold the presiding officer's ruling"],
  [/^(Call of the House|Quorum Call)$/i, "A quorum call: members answer to show they are present"],
];

/** When the question is only "On the Motion", the roll call's description names the motion. */
const MOTION_TITLE_GLOSS: Array<[RegExp, string]> = [
  [
    /Motion to (Commit|Recommit)\b.*with Instructions/i,
    "A vote to send the bill back to committee with changes",
  ],
  [/Motion to (Commit|Recommit|Refer)\b/i, "A vote to send the bill to a committee"],
  [/Motion to Waive/i, "A vote to set aside a budget rule"],
  [/Motion to Table/i, "A vote to set the question aside"],
  [/Motion to Proceed/i, "A vote to begin considering the measure"],
  [/Motion to Discharge/i, "A vote to take the measure out of committee"],
];

/**
 * A plain-words line for a roll call's question, or null when neither the question nor, for a bare
 * "On the Motion", the roll call's description names an action.
 */
export function questionGloss(question: string, title?: string | null): string | null {
  const text = question.trim();
  const direct = QUESTION_GLOSS.find(([pattern]) => pattern.test(text))?.[1];
  if (direct) return direct;
  if (!title || !/^On the Motion$/i.test(text)) return null;
  return MOTION_TITLE_GLOSS.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}

const CONFIRMATION = /^Confirmation:?\s+(\S.*)$/i;

/** "the bill's text" first, so the possessive reads "the text of H.R. 1". */
const MEASURE_WORDS: Array<[RegExp, (name: string) => string]> = [
  [/\bthe bill's text\b/, (name) => `the text of ${name}`],
  [/\bthe (bill|measure|resolution)\b/, (name) => name],
];

/**
 * A roll call named in plain words: its question's fixed gloss, with "the bill" replaced by the measure's
 * name ("A vote to accept the Senate's changes to the One Big Beautiful Bill Act"). A short name reads with
 * "the"; a bill number ("H.J.Res. 88") does not. Null when the question has no gloss.
 */
export function plainVoteTitle(
  rollCall: { question: string; title?: string | null },
  measureName?: string | null,
): string | null {
  // A nomination names the nominee in the Senate's own description: "Confirmation: Jane Doe, of Ohio, ...".
  const nominee = /^On the Nomination$/i.test(rollCall.question.trim())
    ? CONFIRMATION.exec(rollCall.title ?? "")?.[1]
    : undefined;
  if (nominee) return `A vote to confirm ${nominee}`;
  const gloss = questionGloss(rollCall.question, rollCall.title);
  if (!gloss || !measureName) return gloss;
  const name = /^(H|S)\.[A-Za-z.]*\s?\d/.test(measureName) ? measureName : `the ${measureName}`;
  for (const [pattern, replace] of MEASURE_WORDS)
    if (pattern.test(gloss)) return gloss.replace(pattern, replace(name));
  return gloss;
}

/** Longer than this, a "popular" or short title is a sentence, not a name. */
const NAME_LENGTH = 80;

/** The name people know a measure by: the shorter of its popular and short titles, when either is short. */
export function measureShortName(titles: {
  short: string | null;
  popular: string | null;
}): string | null {
  return (
    [titles.popular, titles.short]
      .filter((title): title is string => title !== null && title.length <= NAME_LENGTH)
      .toSorted((a, b) => a.length - b.length)[0] ?? null
  );
}

const AMENDMENT = /^(A joint resolution )?proposing an amendment to the Constitution/i;
const REVIEW_ACT = /congressional disapproval under chapter 8 of title 5/i;
/** The agency named in a Congressional Review Act title: "...of the rule submitted by the X relating to...". */
const REVIEW_ACT_AGENCY = /of the rule (?:submitted|issued) by (?:the )?(.+?) relating to\b/i;
const LIKE_A_BILL =
  "Like a bill, it must pass the House and Senate. It becomes law when the President signs it, or when Congress overrides a veto.";

/**
 * One plain sentence on what kind of measure a joint resolution is, from its type and the opening of its
 * official title only (never generated). Bills need no line, and simple and concurrent resolutions already
 * carry one in their outcome note, so those return null.
 */
export function measureKindNote(measure: {
  type: MeasureType;
  label: string;
  officialTitle: string;
}): string | null {
  if (measure.type !== "hjres" && measure.type !== "sjres") return null;
  if (AMENDMENT.test(measure.officialTitle))
    return `${measure.label} is a joint resolution that proposes a change to the Constitution. It needs two-thirds of both the House and Senate, then approval by three-fourths of the states. It does not go to the President.`;
  if (REVIEW_ACT.test(measure.officialTitle)) {
    const agency = REVIEW_ACT_AGENCY.exec(measure.officialTitle)?.[1];
    const rule = agency ? `a rule from the ${agency}` : "a rule issued by a federal agency";
    return `${measure.label} is a joint resolution under the Congressional Review Act. It would cancel ${rule}. ${LIKE_A_BILL}`;
  }
  return `${measure.label} is a joint resolution. ${LIKE_A_BILL}`;
}

const RULE =
  /^Providing for (?:consideration|disposition) of (the Senate amendments? to )?(?:the )?(?:bill|joint resolution|concurrent resolution|resolution)s? \(([^)]+)\)/i;

/** A short title for lists: the measure's short title, "Rule for H.R. 9576" for a special rule, or a clipped title. */
export function shortMeasureTitle(titles: { display: string; short: string | null }): string {
  if (titles.short) return titles.short;
  const rule = RULE.exec(titles.display);
  if (rule) {
    const others = (titles.display.match(/\((?:H\.|S\.)[^)]*\)/g) ?? []).length > 1;
    const target = rule[1] ? `the Senate amendment to ${rule[2]}` : rule[2];
    return `Rule for considering ${target}${others ? " and other measures" : ""}`;
  }
  if (titles.display.length <= 90) return titles.display;
  const clipped = titles.display.slice(0, 88);
  return `${clipped.slice(0, clipped.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}
