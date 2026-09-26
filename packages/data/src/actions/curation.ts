import {
  ApproveKeyVoteInput,
  isDivisive,
  keyVotePublishViolations,
  keyVoteShapeViolations,
  ProposeKeyVoteInput,
  PublishKeyVoteInput,
  RetireKeyVoteInput,
  UpsertIssueAreaInput,
  VerifyKeyVoteInput,
  type KeyVote,
  type KeyVoteStatus,
  type Reviewer,
  type RollCallRef,
} from "@for-the-people/core";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import * as m from "../db/mappers";
import * as t from "../db/schema";
import { type ActionSpec, canonical, reject } from "./runner";

/**
 * Curation actions. Cards are proposed from data/key-votes.json (edited only through pull requests),
 * checked automatically against the official roll calls, approved by two reviewers of different
 * leanings, and only then published.
 */

async function loadKeyVote(tx: Db, id: string): Promise<KeyVote> {
  const [row] = await tx.select().from(t.keyVotes).where(eq(t.keyVotes.id, id));
  if (!row) return reject({ code: "not_found", message: `No key vote ${id}.` });
  return m.keyVoteFromRow(row);
}

async function saveKeyVote(tx: Db, keyVote: KeyVote): Promise<void> {
  const row = m.keyVoteToRow(keyVote);
  await tx.insert(t.keyVotes).values(row).onConflictDoUpdate({ target: t.keyVotes.id, set: row });
}

const refKey = (refs: readonly RollCallRef[]) =>
  canonical(
    refs.map(({ rollCallId, yeaSupportsMeasure, decisive }) => ({
      rollCallId,
      yeaSupportsMeasure,
      decisive,
    })),
  );

export const upsertIssueArea: ActionSpec<typeof UpsertIssueAreaInput, string> = {
  name: "UpsertIssueArea",
  input: UpsertIssueAreaInput,
  async run(tx, issueArea) {
    const [existing] = await tx
      .select()
      .from(t.issueAreas)
      .where(eq(t.issueAreas.id, issueArea.id));
    if (existing && canonical(m.issueAreaFromRow(existing)) === canonical(issueArea)) {
      return { kind: "unchanged", result: issueArea.id };
    }
    const row = m.issueAreaToRow(issueArea);
    await tx
      .insert(t.issueAreas)
      .values(row)
      .onConflictDoUpdate({ target: t.issueAreas.id, set: row });
    return {
      kind: "written",
      result: issueArea.id,
      target: { kind: "issueArea", id: issueArea.id },
      sourceIds: [],
      summary: { label: issueArea.label },
    };
  },
};

/** Upserts a card's content. Changing the card text or its roll calls sends it back to draft. */
export const proposeKeyVote: ActionSpec<typeof ProposeKeyVoteInput, KeyVoteStatus> = {
  name: "ProposeKeyVote",
  input: ProposeKeyVoteInput,
  async run(tx, proposed) {
    const shape = keyVoteShapeViolations(proposed);
    if (shape.length > 0) reject({ code: "invariant", message: shape.join("; ") });
    const [issue] = await tx
      .select({ id: t.issueAreas.id })
      .from(t.issueAreas)
      .where(eq(t.issueAreas.id, proposed.issueArea));
    if (!issue) reject({ code: "not_found", message: `Unknown issue area ${proposed.issueArea}.` });

    const [row] = await tx.select().from(t.keyVotes).where(eq(t.keyVotes.id, proposed.id));
    const existing = row ? m.keyVoteFromRow(row) : null;
    const sameContent =
      existing &&
      canonical({
        ...existing.card,
        order: existing.order,
        issueArea: existing.issueArea,
        measures: existing.measures,
        yeaLean: existing.yeaLean,
        selectionReason: existing.selectionReason,
      }) ===
        canonical({
          ...proposed.card,
          order: proposed.order,
          issueArea: proposed.issueArea,
          measures: proposed.measures,
          yeaLean: proposed.yeaLean,
          selectionReason: proposed.selectionReason,
        }) &&
      refKey(existing.rollCallRefs) === refKey(proposed.rollCallRefs);
    const retiring = proposed.status === "retired";
    if (sameContent && !retiring && existing.status !== "retired")
      return { kind: "unchanged", result: existing.status };
    if (sameContent && retiring && existing.status === "retired")
      return { kind: "unchanged", result: "retired" };

    const next: KeyVote = {
      ...proposed,
      status: retiring ? "retired" : "draft",
      reviewers: sameContent && existing ? existing.reviewers : [],
      rollCallRefs: proposed.rollCallRefs.map((ref) => ({
        ...ref,
        verification: { status: "unverified", checkedAt: null, notes: null },
      })),
    };
    await saveKeyVote(tx, next);
    return {
      kind: "written",
      result: next.status,
      target: { kind: "keyVote", id: next.id },
      sourceIds: [],
      summary: { status: next.status, created: !existing, rollCalls: next.rollCallRefs.length },
    };
  },
};

/** Checks every roll call against the official record we ingested: it exists, is on the card's measure, and matches the curator's date and tallies. */
export const verifyKeyVote: ActionSpec<typeof VerifyKeyVoteInput, KeyVoteStatus> = {
  name: "VerifyKeyVote",
  input: VerifyKeyVoteInput,
  async run(tx, { keyVoteId, expectations }, ctx) {
    const keyVote = await loadKeyVote(tx, keyVoteId);
    if (keyVote.status === "retired") return { kind: "unchanged", result: "retired" };
    const ids = keyVote.rollCallRefs.map((ref) => ref.rollCallId);
    const rows =
      ids.length > 0 ? await tx.select().from(t.rollCalls).where(inArray(t.rollCalls.id, ids)) : [];
    const official = new Map(rows.map((row) => [row.id, m.rollCallFromRow(row)]));

    const refs = keyVote.rollCallRefs.map((ref): RollCallRef => {
      const rollCall = official.get(ref.rollCallId);
      const expected = expectations.find(
        (expectation) => expectation.rollCallId === ref.rollCallId,
      );
      const problems: string[] = [];
      if (!rollCall) problems.push("not in the official record we ingested");
      else {
        if (!rollCall.measureId || !keyVote.measures.includes(rollCall.measureId)) {
          problems.push(
            `is on ${rollCall.measureId ?? "no measure"}, not on ${keyVote.measures.join(" or ")}`,
          );
        }
        // Curators record members' totals; a Vice President's tie-breaking vote is kept separately.
        const { yea, nay } = rollCall.totals;
        if (expected?.date && expected.date !== rollCall.date)
          problems.push(`date is ${rollCall.date}, expected ${expected.date}`);
        if (expected?.yea != null && expected.yea !== yea)
          problems.push(`Yea count is ${yea}, expected ${expected.yea}`);
        if (expected?.nay != null && expected.nay !== nay)
          problems.push(`Nay count is ${nay}, expected ${expected.nay}`);
        if (!isDivisive(rollCall.totals))
          problems.push("the smaller side has under 15% of votes cast");
      }
      const notes = rollCall
        ? `${rollCall.question}: ${rollCall.result}, ${rollCall.totals.yea}-${rollCall.totals.nay}${rollCall.tieBreaker ? ` (Vice President voted ${rollCall.tieBreaker.vote})` : ""} on ${rollCall.date}.`
        : null;
      return {
        ...ref,
        verification: {
          status: problems.length === 0 ? "verified" : rollCall ? "mismatch" : "unverified",
          checkedAt: ctx.now.toISOString(),
          notes:
            problems.length === 0
              ? notes
              : `${notes ?? ""} Problems: ${problems.join("; ")}.`.trim(),
        },
      };
    });

    const allVerified =
      refs.length > 0 && refs.every((ref) => ref.verification.status === "verified");
    const status: KeyVoteStatus = allVerified
      ? keyVote.status === "draft"
        ? "verified"
        : keyVote.status
      : "draft";
    const stripTime = (list: readonly RollCallRef[]) =>
      list.map((ref) => ({ ...ref, verification: { ...ref.verification, checkedAt: null } }));
    if (
      status === keyVote.status &&
      canonical(stripTime(refs)) === canonical(stripTime(keyVote.rollCallRefs))
    ) {
      return { kind: "unchanged", result: status };
    }
    await saveKeyVote(tx, { ...keyVote, rollCallRefs: refs, status });
    const sourceIds = rows.map((row) => row.sourceId);
    return {
      kind: "written",
      result: status,
      target: { kind: "keyVote", id: keyVoteId },
      sourceIds,
      summary: {
        status,
        verified: refs.filter((ref) => ref.verification.status === "verified").length,
        total: refs.length,
      },
    };
  },
};

const approvalsOk = (reviewers: readonly Reviewer[]) => {
  const approvals = reviewers.filter((reviewer) => reviewer.verdict === "approved");
  // A reviewer with no stated leaning adds a review but not a second viewpoint.
  const leanings = approvals
    .map((reviewer) => reviewer.leaning)
    .filter((leaning) => leaning !== "unstated");
  return new Set(leanings).size >= 2;
};

/** Records reviewers; a verified card becomes reviewed when two reviewers of different leanings approved it. */
export const approveKeyVote: ActionSpec<typeof ApproveKeyVoteInput, KeyVoteStatus> = {
  name: "ApproveKeyVote",
  input: ApproveKeyVoteInput,
  async run(tx, { keyVoteId, reviewers }) {
    const keyVote = await loadKeyVote(tx, keyVoteId);
    let status = keyVote.status;
    if (status === "verified" && approvalsOk(reviewers)) status = "reviewed";
    // Losing an approval (a reviewer asked for changes) takes a card back out of circulation.
    if ((status === "reviewed" || status === "published") && !approvalsOk(reviewers))
      status = "verified";
    if (status === keyVote.status && canonical(reviewers) === canonical(keyVote.reviewers))
      return { kind: "unchanged", result: status };
    await saveKeyVote(tx, { ...keyVote, reviewers, status });
    return {
      kind: "written",
      result: status,
      target: { kind: "keyVote", id: keyVoteId },
      sourceIds: [],
      summary: {
        status,
        reviewers: reviewers
          .map((reviewer) => `${reviewer.id} (${reviewer.kind}):${reviewer.verdict}`)
          .join(", "),
      },
    };
  },
};

/** Publishes only when every invariant holds: verified roll calls with polarity and two approvals. */
export const publishKeyVote: ActionSpec<typeof PublishKeyVoteInput, KeyVoteStatus> = {
  name: "PublishKeyVote",
  input: PublishKeyVoteInput,
  async run(tx, { keyVoteId }) {
    const keyVote = await loadKeyVote(tx, keyVoteId);
    if (keyVote.status === "published") return { kind: "unchanged", result: "published" };
    if (keyVote.status !== "reviewed")
      reject({
        code: "invariant",
        message: `${keyVoteId} is ${keyVote.status}; only reviewed cards publish.`,
      });
    const violations = keyVotePublishViolations(keyVote);
    if (violations.length > 0) reject({ code: "invariant", message: violations.join("; ") });
    await saveKeyVote(tx, { ...keyVote, status: "published" });
    return {
      kind: "written",
      result: "published",
      target: { kind: "keyVote", id: keyVoteId },
      sourceIds: [],
      summary: { status: "published" },
    };
  },
};

export const retireKeyVote: ActionSpec<typeof RetireKeyVoteInput, KeyVoteStatus> = {
  name: "RetireKeyVote",
  input: RetireKeyVoteInput,
  async run(tx, { keyVoteId, why }) {
    const keyVote = await loadKeyVote(tx, keyVoteId);
    if (keyVote.status === "retired") return { kind: "unchanged", result: "retired" };
    await saveKeyVote(tx, { ...keyVote, status: "retired" });
    return {
      kind: "written",
      result: "retired",
      target: { kind: "keyVote", id: keyVoteId },
      sourceIds: [],
      summary: { why },
    };
  },
};
