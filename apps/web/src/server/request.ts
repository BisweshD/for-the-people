/**
 * Request checks shared by every public POST route (Ask, address lookup, corrections): who the caller
 * is for rate limits, and whether the request came from this site as JSON.
 */

/** The last non-empty entry of a comma-separated header: the one the nearest proxy wrote. */
function lastEntry(value: string | null): string | null {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-1) ?? null;
}

/**
 * The caller's address for rate limits, from the headers a proxy sets: Vercel's own
 * x-vercel-forwarded-for, then x-real-ip, then the last X-Forwarded-For entry, which the nearest proxy
 * appended. The first X-Forwarded-For entry is whatever the client sent, so it is never used. A
 * self-hosted deployment must sit behind a proxy that overwrites these headers.
 */
export function clientIp(request: Request): string {
  return (
    lastEntry(request.headers.get("x-vercel-forwarded-for")) ??
    lastEntry(request.headers.get("x-real-ip")) ??
    lastEntry(request.headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

/**
 * A request body as UTF-8 text, or null when it is larger than maxBytes. A declared Content-Length over
 * the limit is refused before anything is read, and the stream is cancelled as soon as it passes the
 * limit, so an oversized body is never buffered whole.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const problem = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/** The hosts this request was addressed to, as the browser and any proxy saw them. */
function ownHosts(request: Request): Set<string> {
  const hosts = new Set([new URL(request.url).host]);
  for (const header of ["host", "x-forwarded-host"]) {
    const host = lastEntry(request.headers.get(header));
    if (host) hosts.add(host.toLowerCase());
  }
  return hosts;
}

/**
 * Refuses a POST that another site could have sent from a visitor's browser. A JSON content type
 * forces a CORS preflight, which fails cross-origin; the Origin header (or Sec-Fetch-Site when a
 * browser leaves Origin out) catches the rest. Returns the refusal, or null when the request may go on.
 */
export function rejectCrossSite(request: Request): Response | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(contentType))
    return problem(415, "Send the request as JSON.");
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let host: string | null = null;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      host = null;
    }
    if (!host || !ownHosts(request).has(host))
      return problem(403, "Cross-site requests are not accepted.");
  } else if (request.headers.get("sec-fetch-site") === "cross-site") {
    return problem(403, "Cross-site requests are not accepted.");
  }
  return null;
}
