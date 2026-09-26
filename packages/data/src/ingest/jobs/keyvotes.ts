import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { IssueArea, KeyVote, RollCallRef } from "@for-the-people/core";
import * as z from "zod";
import {
  approveKeyVote,
  proposeKeyVote,
  publishKeyVote,
  upsertIssueArea,
  verifyKeyVote,
} from "../../actions/curation";
import { workspaceRoot } from "../../db/client";
import type { IngestContext } from "../context";

/** Schema of data/key-votes.json, the curated file maintainers edit through pull requests. */
export const KeyVoteFileRef = RollCallRef.omit({ verification: true }).extend({
  expected: z.object({
    date: z.iso.date().nullable(),
    yea: z.number().int().nullable(),
    nay: z.number().int().nullable(),
  }),
});

export const KeyVoteFileCard = KeyVote.omit({ rollCallRefs: true, status: true }).extend({
  rollCallRefs: z.array(KeyVoteFileRef).min(1),
  status: z.enum(["draft", "retired"]),
});

export const KeyVoteFile = z.object({
  schema: z.literal("for-the-people.keyVotes"),
  version: z.literal(1),
  congress: z.number().int(),
  issueAreas: z.array(IssueArea),
  keyVotes: z.array(KeyVoteFileCard),
});
export type KeyVoteFile = z.infer<typeof KeyVoteFile>;

export const keyVotesPath = (): string => join(workspaceRoot(), "data", "key-votes.json");

export async function readKeyVoteFile(path = keyVotesPath()): Promise<KeyVoteFile> {
  return KeyVoteFile.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function ingestKeyVotes(context: IngestContext): Promise<void> {
  const file = await readKeyVoteFile();
  for (const issueArea of file.issueAreas) await context.act(upsertIssueArea, issueArea);

  for (const card of file.keyVotes) {
    const proposal: KeyVote = {
      ...card,
      rollCallRefs: card.rollCallRefs.map(({ expected: _expected, ...ref }) => ({
        ...ref,
        verification: { status: "unverified", checkedAt: null, notes: null },
      })),
    };
    const proposed = await context.act(proposeKeyVote, proposal);
    if (!proposed.ok || proposed.value === "retired") continue;

    const verified = await context.act(verifyKeyVote, {
      keyVoteId: card.id,
      expectations: card.rollCallRefs.map((ref) => ({
        rollCallId: ref.rollCallId,
        ...ref.expected,
      })),
    });
    if (!verified.ok) continue;
    if (verified.value === "draft") {
      context.note(
        `${card.id} stays in draft: at least one roll call did not verify against the official record.`,
      );
      continue;
    }
    if (card.reviewers.length >= 2) {
      const approved = await context.act(approveKeyVote, {
        keyVoteId: card.id,
        reviewers: card.reviewers,
      });
      if (approved.ok && approved.value === "reviewed")
        await context.act(publishKeyVote, { keyVoteId: card.id });
      else if (approved.ok && approved.value !== "published") {
        context.note(
          `${card.id} is ${approved.value}: it needs approval from two reviewers with different leanings.`,
        );
      }
    } else {
      context.note(`${card.id} is verified but has no reviewers yet.`);
    }
    context.count(`keyVotes.${card.id}`);
  }
}
