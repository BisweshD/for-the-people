// Screenshots every given route at 390x844, 834x1194, and 1440x900 in light and dark themes
//. Usage: node scripts/screens.mjs --base http://localhost:3100 / /swipe /matches
//
// Options:
//   --answers 12                      seed that many stances (a fixed Yea/Nay/Skip pattern)
//   --location TX-37@cd119,TX-10@cd120 seed a saved location (the state is read from the first district)
//   --state FL                        seed a saved home state only (district not confirmed)
//   --ask "How has Ted Cruz voted?"   on /ask, also capture the page after asking this question
//   --out verification/screens        where the PNGs go
// Pages taller than MAX_IMAGE_HEIGHT image pixels are saved in numbered segments, so every file stays
// under the 16,384 px limit that image viewers and reviewers enforce.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const base = option("--base") ?? "http://localhost:3100";
const out = option("--out") ?? "verification/screens";
const answers = Number(option("--answers") ?? 0);
const districts = option("--location")?.split(",").filter(Boolean) ?? [];
const question = option("--ask");
const routes = args.filter(
  (arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"),
);
const state = option("--state") ?? null;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "834", width: 834, height: 1194 },
  { name: "1440", width: 1440, height: 900 },
];
const THEMES = ["light", "dark"];
const MAX_IMAGE_HEIGHT = 16_000;
const channel = process.env.PW_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);

const slug = (route) =>
  route === "/" ? "home" : route.replace(/^\//, "").replace(/[/?#=&]+/g, "_");

/** A realistic device state: stances answered with a fixed pattern, so match screens have data. */
function seedVoter(count) {
  const ids = [
    "kv-aca-extension",
    "kv-obbba",
    "kv-iran-war-powers",
    "kv-laken-riley",
    "kv-canada-tariffs",
    "kv-save-act",
    "kv-federal-worker-unions",
    "kv-california-ev-waiver",
    "kv-ukraine-aid",
    "kv-born-alive",
    "kv-genius-act",
    "kv-girls-sports",
    "kv-halt-fentanyl",
    "kv-rescissions",
  ];
  const choices = [
    "Yea",
    "Nay",
    "Yea",
    "Yea",
    "Nay",
    "Skip",
    "Yea",
    "Nay",
    "Yea",
    "Nay",
    "Yea",
    "Yea",
    "Nay",
    "Yea",
  ];
  return {
    localId: "11111111-1111-4111-8111-111111111111",
    schemaVersion: 1,
    preferences: { theme: "system" },
    consent: { analytics: false },
    journey: count > 0 ? "matched" : "new",
    stances: ids.slice(0, count).map((keyVoteId, i) => ({
      keyVoteId,
      choice: choices[i],
      weight: (i % 3) + 1,
      answeredAt: `2026-09-23T15:${String(i).padStart(2, "0")}:00.000Z`,
    })),
    location:
      districts.length > 0
        ? {
            state: districts[0].slice(0, 2),
            districts,
            ballotDistrictConfirmed: true,
            setAt: "2026-09-23T15:30:00.000Z",
            method: "census-geocoder",
          }
        : state
          ? {
              state,
              districts: [],
              ballotDistrictConfirmed: false,
              setAt: "2026-09-23T15:00:00.000Z",
              method: "manual",
            }
          : null,
    ballotPlan: null,
    following: [],
  };
}

/**
 * Saves the whole page, split into segments when one image would be too tall. A full-page image paints
 * fixed and sticky elements (the tab bar, answer trays, the Ask composer) wherever the viewport happened
 * to be, covering the content under them; for these captures they are put back in the page's flow, so
 * every row can be reviewed. The viewport captures (scripts outside this file) show them as a phone does.
 */
async function capture(page, file, scale) {
  // Lazy images below the fold load only when scrolled near; walk the page once so the capture shows
  // every portrait, then wait for them and return to the top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const settled = (image) =>
      new Promise((resolve) => {
        if (image.complete) return resolve();
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    const images = Promise.all([...document.images].map(settled));
    // Never hang on one image: five seconds is plenty on a local production server.
    await Promise.race([images, new Promise((resolve) => setTimeout(resolve, 5000))]);
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => {
    for (const element of document.body.querySelectorAll("*")) {
      const { position } = window.getComputedStyle(element);
      if (position !== "fixed" && position !== "sticky") continue;
      // Keep the inline values to restore; clear the insets too, or each element shifts by its own
      // top or bottom offset once it is back in the flow.
      element.dataset.screensPosition = JSON.stringify({
        position: element.style.position,
        inset: element.style.inset,
        transform: element.style.transform,
        translate: element.style.translate,
      });
      element.style.position = "relative";
      element.style.inset = "auto";
      // A centred floating pill (translate -50%) would otherwise slide half off the page.
      element.style.transform = "none";
      element.style.translate = "none";
    }
  });
  try {
    await captureFlat(page, file, scale);
  } finally {
    // Put them back, so a later step on the same page (the Ask answer) sees the real layout.
    await page.evaluate(() => {
      for (const element of document.body.querySelectorAll("[data-screens-position]")) {
        const saved = JSON.parse(element.dataset.screensPosition);
        element.style.position = saved.position;
        element.style.inset = saved.inset;
        element.style.transform = saved.transform;
        element.style.translate = saved.translate;
        delete element.dataset.screensPosition;
      }
    });
  }
}

async function captureFlat(page, file, scale) {
  const { width, height } = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
  }));
  const segment = Math.floor(MAX_IMAGE_HEIGHT / scale);
  if (height <= segment) {
    await page.screenshot({ path: `${file}.png`, fullPage: true });
    console.log(`${file}.png`);
    return;
  }
  for (let y = 0, part = 1; y < height; y += segment, part += 1) {
    const path = `${file}-part${part}.png`;
    await page.screenshot({
      path,
      fullPage: true,
      clip: { x: 0, y, width, height: Math.min(segment, height - y) },
    });
    console.log(path);
  }
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel });
try {
  for (const route of routes) {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const scale = viewport.width < 800 ? 2 : 1;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: scale,
          colorScheme: theme,
          reducedMotion: "reduce",
          locale: "en-US",
          timezoneId: "America/New_York",
        });
        const voter = seedVoter(answers);
        await context.addInitScript((value) => {
          window.localStorage.setItem("for-the-people.voter", JSON.stringify(value));
        }, voter);
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date("2026-09-23T16:00:00Z"));
        await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(400);
        // Scroll through once so lazy images below the fold load before the full-page capture.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(200);
        const file = join(out, `${slug(route)}-${viewport.name}-${theme}`);
        await capture(page, file, scale);

        if (question && route.startsWith("/ask")) {
          await page.getByLabel("Your question").fill(question);
          await page.keyboard.press("Enter");
          await page.getByRole("status").filter({ hasText: "For The People answered" }).waitFor();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(400);
          // What the voter sees (the question scrolled to the top), then the whole conversation.
          await page.screenshot({ path: `${file}-answered.png` });
          console.log(`${file}-answered.png`);
          await page.evaluate(() => window.scrollTo(0, 0));
          await capture(page, `${file}-answered-full`, scale);
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
