import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectProvenance, test, waitForHydration } from "./fixtures";

/** ⌘K palette, share cards, OG images, and Friend Compare (module e). */

const KEY_VOTES = [
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
];
const CHOICES = [
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
];

/** A device that has answered 12 cards (11 with a side), set before any page script runs. */
async function seedAnswers(page: Page) {
  await page.addInitScript(
    ({ ids, choices }) => {
      if (window.localStorage.getItem("for-the-people.voter")) return;
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "matched",
          stances: ids.map((keyVoteId, i) => ({
            keyVoteId,
            choice: choices[i],
            weight: (i % 3) + 1,
            answeredAt: `2026-09-23T15:${String(i).padStart(2, "0")}:00.000Z`,
          })),
          location: null,
          ballotPlan: null,
          following: [],
        }),
      );
    },
    { ids: KEY_VOTES, choices: CHOICES },
  );
}

/** Opens the palette the way each device would: ⌘K / Ctrl+K on desktop, the search button on phones. */
async function openPalette(page: Page) {
  // The shortcut listener attaches during hydration; pressing before that does nothing.
  await waitForHydration(page);
  const width = page.viewportSize()?.width ?? 1440;
  if (width < 768) {
    await page.getByRole("button", { name: "Search a name, bill, or address" }).click();
  } else {
    await page.keyboard.press("ControlOrMeta+k");
  }
  const dialog = page.getByRole("dialog", { name: "Search For The People" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("⌘K palette", () => {
  test("finds a person by name and goes to their profile", async ({ page }) => {
    await page.goto("/");
    const dialog = await openPalette(page);
    await page.keyboard.type("Pelosi");
    await expect(dialog.getByRole("option", { name: /^Nancy Pelosi/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /^Nancy Pelosi/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Enter");
    await page.waitForURL("**/people/P000197");
    await expect(page.getByRole("heading", { level: 1, name: "Nancy Pelosi" })).toBeVisible();
  });

  test("the active option is announced: its id exists, and the result count is spoken", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openPalette(page);
    const input = dialog.getByRole("combobox");
    const activeIsSelected = () =>
      input.evaluate((element) => {
        const id = element.getAttribute("aria-activedescendant");
        const target = id ? document.getElementById(id) : null;
        return target?.getAttribute("aria-selected") === "true";
      });
    await expect.poll(activeIsSelected).toBe(true);
    await page.keyboard.type("Sanders");
    await expect(dialog.getByRole("option", { name: /Sanders/ }).first()).toBeVisible();
    await expect.poll(activeIsSelected).toBe(true);
    await expect(dialog.getByRole("status")).toHaveText(/^\d+ results?$/);
    await page.keyboard.press("ArrowDown");
    await expect.poll(activeIsSelected).toBe(true);
    await expectAccessible(page);
  });

  test("finds a bill and a district", async ({ page }) => {
    await page.goto("/");
    const dialog = await openPalette(page);
    await page.keyboard.type("SAVE Act");
    await expect(dialog.getByRole("option").first()).toContainText("H.R. 22");
    await page.getByRole("combobox").fill("CA-12");
    await expect(dialog.getByRole("option").first()).toContainText("CA-12");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/people\/[A-Z]\d{6}$/);
  });

  test("routes anything else to Ask", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await page.keyboard.type("how did my senators vote on tariffs");
    await expect(page.getByRole("option", { name: /Ask: how did my senators/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/ask");
    expect(new URL(page.url()).searchParams.get("q")).toBe("how did my senators vote on tariffs");
  });

  test("offers My Ballot, never Ask, for an address, and keeps it out of every URL", async ({
    page,
  }) => {
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    await page.goto("/");
    const dialog = await openPalette(page);
    await page.keyboard.type("1234 Oak Ave Tampa FL 33606");
    const ballot = dialog.getByRole("option", { name: "Find your 2026 ballot" });
    await expect(ballot).toBeVisible();
    await expect(dialog.getByRole("option", { name: /^Ask:/ })).toHaveCount(0);
    await ballot.click();
    await page.waitForURL((url) => url.pathname === "/ballot");
    expect(new URL(page.url()).search).toBe("");
    expect(urls.filter((url) => /Oak|33606/.test(decodeURIComponent(url)))).toEqual([]);
  });

  test("clears answers only after a confirmation, with the keyboard alone", async ({ page }) => {
    await seedAnswers(page);
    await page.goto("/matches");
    await openPalette(page);
    await page.keyboard.type("clear my");
    await expect(page.getByRole("option", { name: /Clear my answers/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/removes your 12 answers/)).toBeVisible();
    await expect(page.getByRole("option", { name: "Yes, clear my answers" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Cleared your answers")).toBeVisible();
    const stances = await page.evaluate(
      () => JSON.parse(window.localStorage.getItem("for-the-people.voter") ?? "{}").stances,
    );
    expect(stances).toEqual([]);
  });

  test("compare finds the friend link and the Vote Duel, each by its own name", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openPalette(page);
    await page.keyboard.type("compare");
    await expect(dialog.getByRole("option", { name: "Compare with a friend" })).toBeVisible();
    const duel = dialog.getByRole("option", { name: "Vote Duel" });
    await expect(duel).toBeVisible();
    await duel.click();
    await page.waitForURL((url) => url.pathname === "/duel");
    await expect(page.getByRole("heading", { level: 1, name: "Vote Duel" })).toBeVisible();
  });

  test("Escape closes it and the palette passes axe", async ({ page }) => {
    await page.goto("/");
    const dialog = await openPalette(page);
    await page.keyboard.type("Warren");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("Friend Compare", () => {
  test("a link made on one device opens on another without the answers reaching the server", async ({
    page,
    browser,
  }) => {
    await seedAnswers(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copied: string }).copied = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/matches");
    await page.getByRole("button", { name: "Compare with a friend", exact: true }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    const link = await page.evaluate(() => (window as unknown as { copied: string }).copied);
    const url = new URL(link);
    expect(url.pathname).toBe("/compare");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#s=1\./);

    const friendDevice = await browser.newContext();
    const friend = await friendDevice.newPage();
    const requested: string[] = [];
    friend.on("request", (request) => requested.push(request.url()));
    await friend.goto(link);
    await expect(friend.getByRole("heading", { level: 1, name: "You and a friend" })).toBeVisible();
    await expect(friend.getByText(/^Your friend answered 11 of \d+ key votes\.$/)).toBeVisible();
    await expect(friend.getByText("Friend: Yea").first()).toBeVisible();
    await expect(friend.getByRole("link", { name: "Answer key votes" })).toBeVisible();
    const encoded = url.hash.slice("#s=".length);
    expect(requested.filter((request) => request.includes(encoded))).toEqual([]);
    await friendDevice.close();
  });

  test("compares answers by card and issue, and lists members who match both", async ({ page }) => {
    await seedAnswers(page);
    await page.goto(
      "/compare#s=1.aca-extensionN2.obbbaY3.iran-war-powersN1.laken-rileyY2.canada-tariffsY1.save-actY3.federal-worker-unionsN2.california-ev-waiverY1.ukraine-aidN2.born-aliveY3.genius-actY2.girls-sportsY1.halt-fentanylY2.rescissionsY1",
    );
    await expect(
      page.getByText(/You agree on \d+ of 11 key votes you both answered/),
    ).toBeVisible();
    await expect(page.getByText("Split").first()).toBeVisible();
    await expect(page.getByText("Agree", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Members who match you both" })).toBeVisible();
    await expectAccessible(page);
    expect(await expectProvenance(page)).toBeGreaterThan(0);
  });

  test("with no link, previews the voter's own answers beside an empty Friend column", async ({
    page,
  }) => {
    await seedAnswers(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copied: string }).copied = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/compare");
    await expect(
      page.getByRole("heading", { level: 1, name: "Compare with a friend" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Your 11 Yea or Nay answers" }),
    ).toBeVisible();
    const preview = page.getByRole("list", { name: "Your answers" });
    await expect(preview.getByRole("listitem")).toHaveCount(4);
    await expect(preview.getByText(/^You: (Yea|Nay)$/).first()).toBeAttached();
    await expect(
      page.getByText(/^And 7 more\. Your 1 skipped vote stays off the link\./),
    ).toBeVisible();
    // The friend's unknown answer is the word "Waiting", never an empty oval (empty means "not marked").
    await expect(preview.getByText("Friend: Waiting")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Send to a friend" })).toBeVisible();
    await expect(page.getByText(/The link holds your 11 Yea or Nay answers\./)).toBeVisible();

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    const link = await page.evaluate(() => (window as unknown as { copied: string }).copied);
    expect(new URL(link).hash).toMatch(/^#s=1\./);
    // The toast fades in over 0.4s; axe judges the toast as a reader sees it, once it has arrived.
    await page
      .locator("[data-sonner-toast]")
      .first()
      .evaluate((toast) =>
        Promise.all(toast.getAnimations({ subtree: true }).map((a) => a.finished)),
      );
    await expectAccessible(page);
  });

  test("rejects a damaged link", async ({ page }) => {
    await page.goto("/compare#s=1.obbbaY9");
    await expect(page.getByText(/missing its answers or was cut off/)).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("Share cards and OG images", () => {
  test("match cards offer a share menu whose image link carries only public ids and counts", async ({
    page,
  }) => {
    await seedAnswers(page);
    // The match reveal fades cards in; axe must see them settled, as a reduced-motion user does.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    });
    await page.goto("/matches");
    await expectAccessible(page);
    await expectProvenance(page);
    // These answers tie two members for the top spot. A tie has no single top match to share, and
    // list rows carry no share button, so sharing happens from the closest member's profile.
    await expect(page.getByText("Tied for your closest match")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Share your match with / })).toHaveCount(0);
    await page
      .getByRole("region", { name: "Closest to you in Congress" })
      .getByRole("link", { name: /Pelosi/ })
      .click();
    await page.waitForURL("**/people/**");
    await waitForHydration(page);
    const share = page.getByRole("button", { name: /^Share your match with / }).first();
    await share.click();
    const download = page.getByRole("link", { name: "Download image" });
    await expect(download).toBeVisible();
    const href = (await download.getAttribute("href")) ?? "";
    const params = new URL(href, "http://localhost").searchParams;
    expect(href.startsWith("/api/share/match?")).toBe(true);
    expect([...params.keys()].sort()).toEqual(["agreements", "n", "personId", "score"]);
    await expectAccessible(page);
    await expectProvenance(page);
  });

  const images = [
    "/opengraph-image",
    "/people/P000197/opengraph-image",
    "/bills/119-hr-1/opengraph-image",
    "/api/share/match?personId=P000197&score=0.78&n=9&agreements=7",
    "/api/share/match?personId=P000197&score=0.78&n=9&agreements=7&format=story",
    "/api/share/duel?a=P000197&b=J000299",
    "/api/share/ballot?electionId=2026-11-03-general&races=3&decided=2&format=story",
  ];
  for (const path of images) {
    test(`${path} returns a PNG`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect((await response.body()).subarray(1, 4).toString()).toBe("PNG");
    });
  }

  test("share routes refuse anything but public ids and counts", async ({ request }) => {
    const bad = [
      "/api/share/match?personId=P000197&score=0.78&n=9&agreements=7&stances=1.obbbaY2",
      "/api/share/match?personId=P000197&score=0.78&n=9&agreements=10",
      "/api/share/stances?a=P000197",
      "/api/share/duel?a=P000197&b=P000197",
      "/api/share/ballot?electionId=2026-11-03-general&races=3&decided=2&format=gif",
    ];
    for (const path of bad) expect((await request.get(path)).status(), path).toBe(400);
    // The error names what the visitor has, a link; "card" is not user-facing copy.
    const invalid = await request.get("/api/share/stances?a=P000197");
    expect(await invalid.json()).toEqual({ error: "Not a valid share link" });
  });

  test("profiles point their OG image at the profile card", async ({ page }) => {
    await page.goto("/people/P000197");
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
      "content",
      /\/people\/P000197\/opengraph-image/,
    );
  });
});
