import type { RollCall } from "@for-the-people/core/client";
import { FAILED, SUCCEEDED, resultText, thresholdText } from "./outcomes";

/**
 * A roll call's result in page words and the numbers behind its result bar, from its totals and recorded
 * requirement only. Kept apart from lib/outcomes.ts so pages that only name votes (Vote Duel) do not load it.
 */

/** Every requirement the chamber recorded, a simple majority included, for the roll call page's result. */
export function requirementText(rollCall: {
  chamber: RollCall["chamber"];
  requires?: string | null;
}): string | null {
  if (rollCall.requires === "1/2") return "Needed a simple majority of those voting";
  return thresholdText(rollCall);
}

/**
 * The result for page copy, in sentence case ("Motion rejected", not "Motion Rejected"). Receipts keep
 * resultText, the clerk's own words.
 */
export function resultLabel(rollCall: Pick<RollCall, "question" | "result" | "totals">): string {
  const text = resultText(rollCall);
  return text.charAt(0) + text.slice(1).toLowerCase();
}

/** Whether the chamber's own result words say the question carried ("Passed", "Agreed to") or not. */
export function resultTone(result: string): "passed" | "failed" | null {
  if (FAILED.test(result)) return "failed";
  return SUCCEEDED.test(result) ? "passed" : null;
}

export interface VoteMargin {
  /** Yea votes the question needed to carry, when the chamber recorded its requirement. */
  needed: number | null;
  /** Votes the result bar spans: Yea plus Nay, or the votes needed when that is more. */
  scale: number;
  /** "Passed by 4 votes", "Cloture motion rejected: 51 Yea, 60 needed", or "Passed, 50 to 50". */
  label: string;
}

/**
 * The Yea votes a requirement asks for. A simple majority or two-thirds counts those voting Yea or Nay;
 * three-fifths in the Senate counts every senator sworn in, which is every name on the roll call.
 */
function votesNeeded(rollCall: {
  chamber: RollCall["chamber"];
  requires?: string | null;
  totals: RollCall["totals"];
}): number | null {
  const { yea, nay, present, notVoting } = rollCall.totals;
  const voting = yea + nay;
  if (rollCall.requires === "1/2") return Math.floor(voting / 2) + 1;
  if (rollCall.requires === "2/3") return Math.ceil((2 * voting) / 3);
  if (rollCall.requires === "3/5")
    return rollCall.chamber === "senate"
      ? Math.ceil((3 * (voting + present + notVoting)) / 5)
      : Math.ceil((3 * voting) / 5);
  return null;
}

/**
 * The result bar's numbers for a roll call, computed only from its totals and recorded requirement. The
 * margin is stated only when the count agrees with the chamber's own result; otherwise, and for a tie
 * the Vice President broke, the label is the result and the count. Null when no one voted Yea or Nay.
 */
export function voteMargin(
  rollCall: Pick<RollCall, "chamber" | "question" | "result" | "totals" | "tieBreaker"> & {
    requires?: string | null;
  },
): VoteMargin | null {
  const { yea, nay } = rollCall.totals;
  if (yea + nay === 0 || /^(Call of the House|Quorum Call)$/i.test(rollCall.question.trim()))
    return null;
  const result = resultLabel(rollCall);
  const needed = votesNeeded(rollCall);
  const scale = Math.max(yea + nay, needed ?? 0);
  const plain = `${result}, ${yea.toLocaleString("en-US")} to ${nay.toLocaleString("en-US")}`;
  const tone = resultTone(rollCall.result);
  if (needed === null || rollCall.tieBreaker || tone !== (yea >= needed ? "passed" : "failed"))
    return { needed, scale, label: plain };
  if (rollCall.requires === "1/2") {
    const margin = Math.abs(yea - nay);
    return { needed, scale, label: `${result} by ${margin} ${margin === 1 ? "vote" : "votes"}` };
  }
  return {
    needed,
    scale,
    label: `${result}: ${yea.toLocaleString("en-US")} Yea, ${needed.toLocaleString("en-US")} needed`,
  };
}
