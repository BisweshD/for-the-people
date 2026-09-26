import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as z from "zod";

/**
 * The only way ingestion talks to the network. Every response is stored on disk,
 * keyed by URL (with secrets stripped), so runs are reproducible and resumable.
 */

const ALLOWED_HOSTS = new Set([
  "clerk.house.gov",
  "www.senate.gov",
  "api.congress.gov",
  "www.govinfo.gov",
  "api.open.fec.gov",
  "www.fec.gov",
  "raw.githubusercontent.com",
  "geocoding.geo.census.gov",
  "www2.census.gov",
  "tigerweb.geo.census.gov",
  "api.geocod.io",
]);

const SECRET_PARAMS = ["api_key", "key"];

/** Minimum spacing between requests per host, in milliseconds. */
const HOST_SPACING_MS: Record<string, number> = {
  "clerk.house.gov": 250,
  "www.senate.gov": 400,
  "api.congress.gov": 750,
  "www.govinfo.gov": 250,
  "api.open.fec.gov": 3700,
  "www.fec.gov": 1000,
  "raw.githubusercontent.com": 50,
  "geocoding.geo.census.gov": 500,
  "www2.census.gov": 500,
  "tigerweb.geo.census.gov": 500,
};

export const USER_AGENT = "ForThePeople/0.1 (nonpartisan civic data)";

const metaSchema = z.object({
  url: z.string(),
  status: z.number().int(),
  retrievedAt: z.string(),
  contentHash: z.string(),
  contentType: z.string().nullable(),
});

export type RawMeta = z.infer<typeof metaSchema>;

export interface RawResponse extends RawMeta {
  body: Buffer;
  fromCache: boolean;
}

export interface FetchRawOptions {
  cacheDir: string;
  /** Reuse a cached copy younger than this. Infinity means "never refetch". */
  maxAgeMs?: number;
  /** Treat these statuses as a valid, cacheable answer (for example 404 = "does not exist yet"). */
  acceptStatuses?: number[];
  /** Refetch a cached non-200 answer older than this (default 12 hours). */
  negativeMaxAgeMs?: number;
  retries?: number;
}

/** The URL with secret query parameters removed; safe to log and store. */
export function publicUrl(url: string): string {
  const parsed = new URL(url);
  for (const name of SECRET_PARAMS) parsed.searchParams.delete(name);
  return parsed.toString();
}

export function cachePathFor(cacheDir: string, url: string): string {
  const parsed = new URL(publicUrl(url));
  const safePath = parsed.pathname.replace(/[^A-Za-z0-9._/-]/g, "_").replace(/\/$/, "/index");
  const query = parsed.search
    ? `__${createHash("sha256").update(parsed.search).digest("hex").slice(0, 16)}`
    : "";
  return join(cacheDir, parsed.host, `${safePath}${query}`);
}

export function sha256(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

const lastRequestAt = new Map<string, number>();

async function waitForHostSlot(host: string): Promise<void> {
  const spacing = HOST_SPACING_MS[host] ?? 1000;
  const now = Date.now();
  const earliest = (lastRequestAt.get(host) ?? 0) + spacing;
  lastRequestAt.set(host, Math.max(now, earliest));
  if (earliest > now) await sleep(earliest - now);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The longest a server's Retry-After can hold a job. */
export const MAX_RETRY_AFTER_MS = 120_000;

/** How long to wait before a retry: the server's Retry-After up to two minutes, else jittered backoff. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const base = Math.min(60_000, 1000 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

async function readCached(path: string): Promise<{ meta: RawMeta; body: Buffer } | null> {
  try {
    const [metaText, body] = await Promise.all([
      readFile(`${path}.meta.json`, "utf8"),
      readFile(path),
    ]);
    return { meta: metaSchema.parse(JSON.parse(metaText)), body };
  } catch {
    return null;
  }
}

/** A request (or a redirect) to a host outside the allowlist. Never retried. */
export class DisallowedHostError extends Error {}

/** Throws unless the URL is https on an allowlisted host. Request-time lookups (geocoding) check this too. */
export function assertAllowedUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.host)) {
    throw new DisallowedHostError(
      `Refusing to fetch from a host that is not allowlisted: ${parsed.host}`,
    );
  }
  return parsed;
}

/** Redirects followed for one request, each checked against the allowlist. */
const MAX_REDIRECTS = 5;

/**
 * fetch() for allowlisted hosts only. Redirects are followed by hand and every hop is checked again,
 * so an allowlisted host (or an open redirect on one) cannot send the request anywhere else.
 */
export async function fetchAllowed(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  let parsed = assertAllowedUrl(current);
  for (let hop = 0; ; hop++) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel();
    if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects from ${publicUrl(url)}`);
    current = new URL(location, parsed).toString();
    parsed = assertAllowedUrl(current);
  }
}

export async function fetchRaw(url: string, options: FetchRawOptions): Promise<RawResponse> {
  const parsed = assertAllowedUrl(url);
  const path = cachePathFor(options.cacheDir, url);
  const maxAgeMs = options.maxAgeMs ?? Number.POSITIVE_INFINITY;
  const accept = new Set([200, ...(options.acceptStatuses ?? [])]);

  const negativeMaxAgeMs = options.negativeMaxAgeMs ?? 12 * 60 * 60 * 1000;
  const cached = await readCached(path);
  const cacheAge = cached ? Date.now() - Date.parse(cached.meta.retrievedAt) : Number.POSITIVE_INFINITY;
  const cacheLimit = cached?.meta.status === 200 ? maxAgeMs : negativeMaxAgeMs;
  if (cached && cacheAge < cacheLimit) {
    return { ...cached.meta, body: cached.body, fromCache: true };
  }

  const retries = options.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    await waitForHostSlot(parsed.host);
    let response: Response;
    try {
      response = await fetchAllowed(url, {
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (error instanceof DisallowedHostError || attempt >= retries) throw error;
      await sleep(backoffMs(attempt, null));
      continue;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < retries) {
      await sleep(backoffMs(attempt, response.headers.get("retry-after")));
      continue;
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!accept.has(response.status)) {
      throw new Error(`GET ${publicUrl(url)} failed with status ${response.status}`);
    }
    const meta: RawMeta = {
      url: publicUrl(url),
      status: response.status,
      retrievedAt: new Date().toISOString(),
      contentHash: sha256(body),
      contentType: response.headers.get("content-type"),
    };
    await mkdir(dirname(path), { recursive: true });
    await Promise.all([
      writeFile(path, body),
      writeFile(`${path}.meta.json`, JSON.stringify(meta, null, 2)),
    ]);
    return { ...meta, body, fromCache: false };
  }
}
