import { randomUUID } from "node:crypto";
import {
  ANONYMOUS_PUBLIC_ACTOR,
  PUBLIC_ACTIONS,
  type ActionContext,
  type ActionError,
  type ActionName,
  type ActionResult,
} from "@for-the-people/core";
import type { z } from "zod";
import type { Db } from "../db/client";
import { eventLog } from "../db/schema";

/**
 * Every write goes through runAction: check the actor may run the action, validate with the action's
 * Zod schema, run the write inside one transaction, and append exactly one event_log row. A no-op
 * (input equals stored state) writes nothing.
 */

const PUBLIC = new Set<ActionName>(PUBLIC_ACTIONS);

/**
 * Why this actor may not run this action, or null when it may. The public runs only public actions, always as the one anonymous actor; ingestion, curation
 * and system actions never come from the public, and public actions never come from anyone else.
 */
export function refusal(action: ActionName, actor: ActionContext["actor"]): ActionError | null {
  if (actor.kind === "public") {
    if (!PUBLIC.has(action))
      return { code: "forbidden", message: `${action} cannot be run by the public` };
    if (actor.id !== ANONYMOUS_PUBLIC_ACTOR.id)
      return { code: "forbidden", message: `${action} records the public only as anonymous` };
    return null;
  }
  return PUBLIC.has(action)
    ? { code: "forbidden", message: `${action} comes only from the public` }
    : null;
}

export type Summary = Record<string, string | number | boolean | null>;

export type ActionOutcome<R> =
  | {
      kind: "written";
      result: R;
      target: { kind: string; id: string };
      sourceIds: string[];
      summary: Summary;
    }
  | { kind: "unchanged"; result: R };

export interface ActionSpec<S extends z.ZodType, R> {
  name: ActionName;
  input: S;
  run(tx: Db, value: z.output<S>, ctx: ActionContext): Promise<ActionOutcome<R>>;
}

/** Thrown inside `run` to reject the action and roll back anything it wrote. */
export class ActionRejection extends Error {
  constructor(readonly error: ActionError) {
    super(error.message);
  }
}

export const reject = (error: ActionError): never => {
  throw new ActionRejection(error);
};

export const eventId = (now: Date): string =>
  `evt_${now.getTime().toString(36)}_${randomUUID().slice(0, 8)}`;

export async function runAction<S extends z.ZodType, R>(
  db: Db,
  spec: ActionSpec<S, R>,
  raw: unknown,
  ctx: ActionContext,
): Promise<ActionResult<R>> {
  const refused = refusal(spec.name, ctx.actor);
  if (refused) return { ok: false, error: refused };
  const parsed = spec.input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid",
        message: `${spec.name}: input failed validation`,
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        ),
      },
    };
  }
  try {
    return await db.transaction(async (tx) => {
      const outcome = await spec.run(tx as unknown as Db, parsed.data, ctx);
      if (outcome.kind === "unchanged") return { ok: true, value: outcome.result, eventId: null };
      const id = eventId(ctx.now);
      await tx.insert(eventLog).values({
        id,
        action: spec.name,
        actorKind: ctx.actor.kind,
        actorId: ctx.actor.id,
        targetKind: outcome.target.kind,
        targetId: outcome.target.id,
        at: ctx.now.toISOString(),
        reason: ctx.reason,
        sourceIds: outcome.sourceIds,
        summary: outcome.summary,
      });
      return { ok: true, value: outcome.result, eventId: id };
    });
  } catch (error) {
    if (error instanceof ActionRejection) return { ok: false, error: error.error };
    throw error;
  }
}

/** Stable JSON for change detection: object keys sorted, arrays kept in order. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

/** Splits rows so one INSERT stays well under Postgres's 65,535 bind-parameter limit. */
export function chunk<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size)
    chunks.push(rows.slice(index, index + size));
  return chunks;
}
