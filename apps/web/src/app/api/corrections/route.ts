import { ANONYMOUS_PUBLIC_ACTOR, SubmitCorrectionInput } from "@for-the-people/core";
import { getDb } from "@for-the-people/data";
import { submitCorrection } from "@for-the-people/data/actions/public";
import { runAction } from "@for-the-people/data/actions/runner";
import { checkRateLimit, saltedHash } from "@for-the-people/data/runtime/rate-limit";
import { clientIp, readBodyText, rejectCrossSite } from "@/server/request";

/**
 * SubmitCorrection: validates the report, rate-limits by a salted hash of the
 * caller's IP, and files it through the logged action as the anonymous public actor. The IP is never
 * stored or logged, and its salted hash lives only in the expiring rate_limits table, so a stored
 * report cannot be tied to who sent it (the form promises this).
 */

/** A report of 2,000 characters, even with every character escaped in JSON, fits well inside this. */
const MAX_BODY_BYTES = 16_384;

const LIMITS = [
  { windowSeconds: 10 * 60, max: 5 },
  { windowSeconds: 24 * 60 * 60, max: 20 },
];

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  const raw = await readBodyText(request, MAX_BODY_BYTES);
  if (raw === null) return Response.json({ error: "That report is too long." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Send the report as JSON.", issues: ["(root): not JSON"] },
      { status: 400 },
    );
  }
  const parsed = SubmitCorrectionInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Some fields need another look.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const db = await getDb();
  const hash = saltedHash(clientIp(request));
  const limit = await checkRateLimit(db, `corrections:${hash}`, LIMITS);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many reports from this connection. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await runAction(db, submitCorrection, parsed.data, {
    actor: ANONYMOUS_PUBLIC_ACTOR,
    reason: "Correction report from the public form",
    now: new Date(),
  });
  if (!result.ok) {
    return Response.json({ error: result.error.message }, { status: 400 });
  }
  return Response.json({ ok: true, id: result.value }, { status: 201 });
}
