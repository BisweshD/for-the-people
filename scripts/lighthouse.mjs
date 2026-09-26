// Lighthouse: mobile performance >= 90, accessibility >= 95, CLS <= 0.05 per route.
//
// Runs Lighthouse's Node API against one Chrome with a fixed profile folder under .cache. Lighthouse CI
// launches and deletes a temporary profile per URL, and on Windows that deletion fails while Chrome
// still holds the folder, losing the run. Thresholds and routes match lighthouserc.cjs.
//
// Each route runs three times and is judged on its median run by performance score, as Lighthouse CI
// recommends: a single run swings several points with the host's load (the bill page measured 84 to 93
// on identical builds), while the median is stable. Accessibility and CLS must hold on every run.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const base = process.env.LHCI_BASE_URL ?? "http://localhost:3200";
const routes = ["/", "/swipe", "/people/A000370", "/bills/119-hr-1", "/ballot"];
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : undefined);
const outDir = join(process.cwd(), ".lighthouseci");
const profile = join(process.cwd(), ".cache", "lighthouse-profile");
await mkdir(outDir, { recursive: true });
await mkdir(profile, { recursive: true });

const chrome = await chromeLauncher.launch({
  chromePath,
  userDataDir: profile,
  chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"],
});
const RUNS = 3;
let failed = false;
try {
  for (const route of routes) {
    const runs = [];
    for (let run = 0; run < RUNS; run++) runs.push(await measure(route));
    runs.sort(
      (a, b) =>
        (a.lhr.categories.performance.score ?? 0) - (b.lhr.categories.performance.score ?? 0),
    );
    const result = runs[Math.floor(runs.length / 2)];
    const scores = runs.map((each) =>
      Math.round((each.lhr.categories.performance.score ?? 0) * 100),
    );
    const { categories, audits } = result.lhr;
    const performance = categories.performance.score ?? 0;
    // Accessibility and layout shift do not swing with load, so they must hold on every run.
    const accessibility = Math.min(
      ...runs.map((each) => each.lhr.categories.accessibility.score ?? 0),
    );
    const cls = Math.max(
      ...runs.map((each) => each.lhr.audits["cumulative-layout-shift"].numericValue ?? 1),
    );
    const ok = performance >= 0.9 && accessibility >= 0.95 && cls <= 0.05;
    failed ||= !ok;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${route.padEnd(20)} performance ${Math.round(performance * 100)} (runs ${scores.join(", ")})  accessibility ${Math.round(accessibility * 100)}  CLS ${cls.toFixed(3)}  LCP ${Math.round(audits["largest-contentful-paint"].numericValue ?? 0)} ms  TBT ${Math.round(audits["total-blocking-time"].numericValue ?? 0)} ms`,
    );
    const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "_");
    await writeFile(join(outDir, `${name}.json`), result.report);
  }
} finally {
  try {
    chrome.kill();
  } catch {
    // Windows sometimes refuses to release the profile immediately; the folder is reused next run.
  }
}
if (failed) {
  console.error("At least one route misses a Lighthouse threshold.");
  process.exit(1);
}

async function measure(route) {
  return lighthouse(`${base}${route}`, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    formFactor: "mobile",
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      disabled: false,
    },
    onlyCategories: ["performance", "accessibility"],
  });
}
