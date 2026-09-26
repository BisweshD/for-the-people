import { randomUUID } from "node:crypto";
import { SubmitCorrectionInput } from "@for-the-people/core";
import * as t from "../db/schema";
import type { ActionSpec } from "./runner";

/**
 * Public actions: the only writes a visitor can cause. The caller rate-limits first (by a salted IP hash
 * kept only in the expiring rate_limits table) and runs the action as ANONYMOUS_PUBLIC_ACTOR, which
 * runAction requires; no IP address, hash of one, name, or contact detail is stored with a report.
 */

export const correctionId = (now: Date): string =>
  `cor_${now.getTime().toString(36)}_${randomUUID().slice(0, 8)}`;

/** Files a correction report as "submitted". Maintainers triage it; the report text is stored as written. */
export const submitCorrection: ActionSpec<typeof SubmitCorrectionInput, string> = {
  name: "SubmitCorrection",
  input: SubmitCorrectionInput,
  async run(tx, { target, report }, ctx) {
    const id = correctionId(ctx.now);
    await tx.insert(t.corrections).values({
      id,
      targetKind: target.kind,
      targetId: target.id,
      targetField: target.field,
      report: report.trim(),
      status: "submitted",
      resolution: null,
      submittedAt: ctx.now.toISOString(),
    });
    return {
      kind: "written",
      result: id,
      target: { kind: "correction", id },
      sourceIds: [],
      summary: { targetKind: target.kind, targetId: target.id, field: target.field },
    };
  },
};
