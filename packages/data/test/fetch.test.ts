import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { openMemoryDb, type OpenDb } from "../src/db/client";
import { CensusGeocoder, GeocodioGeocoder } from "../src/geocode";
import { backoffMs, fetchAllowed, fetchRaw, MAX_RETRY_AFTER_MS } from "../src/ingest/fetch";
import { GEOCODIO_DAILY_LOOKUPS, geocoderWithinBudget } from "../src/runtime/geocode-budget";

/** Outbound requests stay on allowlisted hosts through every redirect. */

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

describe("fetchAllowed", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("follows a redirect to another allowlisted host", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://clerk.house.gov/")
        ? redirect("https://www.senate.gov/moved.xml", 301)
        : new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchAllowed("https://clerk.house.gov/evs/2025/roll001.xml");
    expect(await response.text()).toBe("ok");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://clerk.house.gov/evs/2025/roll001.xml",
      "https://www.senate.gov/moved.xml",
    ]);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
      expect(init.redirect).toBe("manual");
  });

  test("refuses a redirect off the allowlist, and relative redirects stay on the host", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/start") ? redirect("https://evil.example/steal") : new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAllowed("https://www.govinfo.gov/start")).rejects.toThrow(/not allowlisted/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/a") ? redirect("/b") : new Response(url))),
    );
    const response = await fetchAllowed("https://www.govinfo.gov/a");
    expect(await response.text()).toBe("https://www.govinfo.gov/b");
  });

  test("refuses a downgrade to http and endless redirect loops", async () => {
    vi.stubGlobal("fetch", async () => redirect("http://www.senate.gov/plain"));
    await expect(fetchAllowed("https://www.senate.gov/x")).rejects.toThrow(/not allowlisted/);
    vi.stubGlobal("fetch", async () => redirect("https://www.senate.gov/loop"));
    await expect(fetchAllowed("https://www.senate.gov/loop")).rejects.toThrow(/Too many redirects/);
  });

  test("fetchRaw does not retry a disallowed redirect", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "for-the-people-fetch-"));
    const fetchMock = vi.fn(async () => redirect("https://evil.example/"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchRaw("https://raw.githubusercontent.com/unitedstates/x.json", { cacheDir, retries: 3 }),
    ).rejects.toThrow(/not allowlisted/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await rm(cacheDir, { recursive: true, force: true });
  });

  test("the geocoders give up on a redirect off the allowlist", async () => {
    const fetchMock = vi.fn(async () => redirect("https://evil.example/collect"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new CensusGeocoder().lookup("1100 Congress Ave, Austin, TX 78701")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await new GeocodioGeocoder("k").lookup("1100 Congress Ave, Austin, TX 78701")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    for (const [url] of fetchMock.mock.calls as unknown as Array<[string]>)
      expect(new URL(url).host).not.toBe("evil.example");
  });
});

describe("the Geocodio daily budget", () => {
  let open: OpenDb;
  beforeAll(async () => {
    open = await openMemoryDb({ migrate: true });
  });
  afterAll(async () => {
    await open.close();
  });

  test("uses Census without a key, and never counts those lookups", async () => {
    expect((await geocoderWithinBudget(open.db, {})).method).toBe("census-geocoder");
  });

  test("switches every caller to Census once today's paid lookups are spent", async () => {
    const env = { GEOCODIO_API_KEY: "k" };
    const day = new Date("2026-10-01T09:00:00Z");
    for (let i = 0; i < GEOCODIO_DAILY_LOOKUPS; i++)
      expect((await geocoderWithinBudget(open.db, env, day)).method).toBe("geocodio");
    expect((await geocoderWithinBudget(open.db, env, day)).method).toBe("census-geocoder");
    const nextDay = new Date("2026-10-02T00:00:05Z");
    expect((await geocoderWithinBudget(open.db, env, nextDay)).method).toBe("geocodio");
  });
});

describe("backoffMs (round-1 L6)", () => {
  test("honours a short Retry-After", () => {
    expect(backoffMs(0, "5")).toBe(5000);
  });

  test("never waits longer than two minutes, whatever the server asks", () => {
    expect(MAX_RETRY_AFTER_MS).toBe(120_000);
    expect(backoffMs(0, "86400")).toBe(MAX_RETRY_AFTER_MS);
    expect(backoffMs(0, "1e12")).toBe(MAX_RETRY_AFTER_MS);
  });

  test("falls back to jittered exponential backoff without a usable Retry-After", () => {
    for (const header of [null, "soon", "-3", "0"]) {
      const wait = backoffMs(2, header);
      expect(wait).toBeGreaterThanOrEqual(2000);
      expect(wait).toBeLessThanOrEqual(4000);
    }
  });
});
