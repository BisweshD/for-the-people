// First-load JS budget: every route must load at most 180 KB of gzipped JavaScript.
//
// Measures, against a production server, the scripts a phone downloads before the page is interactive:
// every script requested from navigation until React has hydrated (Providers stamps
// data-hydrated-at on <html> with performance.now()), including any lazy chunk rendered during
// hydration. Request start times come from the page's own Resource Timing entries, so there is no
// race between the page and this script. Two things are
// excluded, and both are reported so nothing hides: the legacy `nomodule` polyfill, which modern
// browsers never download, and route prefetches that Next.js starts after hydration for links on the
// page, which belong to the pages they lead to.
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const BUDGET = 180 * 1024;
const base = process.env.BUNDLE_BASE_URL ?? "http://localhost:3200";
const routes =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        "/",
        "/swipe",
        "/matches",
        "/people/A000370",
        "/bills/119-hr-1",
        "/votes/house-119-1-102",
        "/ballot",
        "/ask",
        "/explore",
        "/duel?a=C001035&b=M001153",
        "/methodology",
        "/you",
      ];
const channel = process.env.PW_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);

const browser = await chromium.launch({ channel });
let failed = false;
try {
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const sizes = new Map();
    page.on("response", async (response) => {
      if (response.request().resourceType() !== "script") return;
      try {
        sizes.set(response.url(), gzipSync(await response.body(), { level: 9 }).length);
      } catch {
        // Aborted or opaque responses carry no body.
      }
    });
    await page.goto(`${base}${route}`, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    await page.waitForLoadState("networkidle");
    const { hydratedAt, entries } = await page.evaluate(() => ({
      hydratedAt: Number(document.documentElement.dataset.hydratedAt),
      entries: performance
        .getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .map((entry) => ({ url: entry.name, start: entry.startTime })),
    }));
    const beforeHydration = entries.filter((entry) => entry.start <= hydratedAt);
    const later = entries.filter((entry) => entry.start > hydratedAt);
    const sum = (list) => list.reduce((total, entry) => total + (sizes.get(entry.url) ?? 0), 0);
    const total = sum(beforeHydration);
    const deferred = sum(later);

    const over = total > BUDGET;
    failed ||= over;
    console.log(
      `${over ? "FAIL" : "ok  "} ${route.padEnd(28)} ${(total / 1024).toFixed(1).padStart(6)} KB in ${String(beforeHydration.length).padStart(2)} files` +
        `  (+${(deferred / 1024).toFixed(1)} KB loaded after hydration)`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
if (failed) {
  console.error(`At least one route loads more than ${BUDGET / 1024} KB of gzipped JavaScript.`);
  process.exit(1);
}
