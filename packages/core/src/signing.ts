import * as z from "zod";

/**
 * Signed cache revalidation: ingestion jobs tell the web app which cache tags changed. The body carries a
 * timestamp; the signature is HMAC-SHA256 over the raw body with a shared secret (REVALIDATE_SECRET).
 */

export const RevalidateRequest = z.object({
  tags: z.array(z.string().min(1).max(120)).min(1).max(200),
  at: z.iso.datetime({ offset: true }),
});
export type RevalidateRequest = z.infer<typeof RevalidateRequest>;

export const REVALIDATE_MAX_AGE_MS = 5 * 60 * 1000;
export const SIGNATURE_HEADER = "x-for-the-people-signature";
/** Shortest REVALIDATE_SECRET accepted: 32 characters, so the HMAC key cannot be guessed. */
export const REVALIDATE_MIN_SECRET_LENGTH = 32;

/** The configured secret when it is long enough to use, else null (revalidation stays off). */
export const revalidateSecret = (configured: string | undefined): string | null =>
  configured && configured.length >= REVALIDATE_MIN_SECRET_LENGTH ? configured : null;

const encoder = new TextEncoder();

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const signBody = (secret: string, body: string): Promise<string> => hmac(secret, body);

/** Constant-time comparison of two hex signatures. */
function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export async function verifySignedBody(
  secret: string,
  body: string,
  signature: string | null,
  now = Date.now(),
): Promise<{ ok: true; request: RevalidateRequest } | { ok: false; reason: string }> {
  if (!signature) return { ok: false, reason: "missing signature" };
  if (!equalHex(await hmac(secret, body), signature.toLowerCase()))
    return { ok: false, reason: "bad signature" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: "body is not JSON" };
  }
  const request = RevalidateRequest.safeParse(parsed);
  if (!request.success) return { ok: false, reason: "invalid body" };
  const age = now - Date.parse(request.data.at);
  if (age < -60_000 || age > REVALIDATE_MAX_AGE_MS) return { ok: false, reason: "stale request" };
  return { ok: true, request: request.data };
}
