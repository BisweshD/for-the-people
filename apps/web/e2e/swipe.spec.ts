import type { Page } from "@playwright/test";
import {
  answer,
  expect,
  expectAccessible,
  expectProvenance,
  shownText,
  test,
  waitForHydration,
} from "./fixtures";

test.describe("land, swipe 12, see matches, open a receipt", () => {
  test("a first-time visitor completes the core journey", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("See how Congress voted");
    const hero = page.getByRole("region", { name: "Try the first vote" });
    await expect(hero.getByRole("heading", { level: 2 })).toBeVisible();
    await waitForHydration(page);

    await answer(page, "Yea");
    await page.waitForURL("**/swipe");
    await waitForHydration(page);

    const choices: Array<"Yea" | "Nay" | "Skip"> = [
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
    for (const [index, choice] of choices.entries()) {
      const before = await page.getByText(/^\d+ of \d+ answered$/).textContent();
      await answer(page, choice);
      await expect(page.getByText(/^\d+ of \d+ answered$/)).not.toHaveText(before ?? "");
      if (index === 3) {
        // The fifth Yea or Nay answer pauses once, in place of the next vote, to offer the matches.
        const pause = page.getByRole("region", {
          name: "You’ve answered enough to see who votes like you",
        });
        await expect(pause).toBeVisible();
        await expect(pause.getByRole("link", { name: "See my matches" })).toHaveAttribute(
          "href",
          "/matches",
        );
        await expect(page.getByRole("button", { name: "Yea", exact: true })).toHaveCount(0);
        await pause.getByRole("button", { name: /^Keep going, \d+ left$/ }).click();
        await expect(pause).toHaveCount(0);
      }
      if (index === 1 && test.info().project.name !== "desktop") {
        // From the third Yea or Nay answer, phones get a one-line path to Matches above the answers.
        await expect(
          page.getByRole("link", { name: /^(Closest so far|Tied for closest) .*Agrees on/ }),
        ).toHaveAttribute("href", "/matches");
      }
    }
    await expect(page.getByText(/^12 of \d+ answered$/)).toBeVisible();

    await page.goto("/matches");
    await expect(page.getByRole("heading", { name: "Your matches" })).toBeVisible();
    await expect(page.getByText(/Based on your 11 Yea or Nay answers/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Closest to you in Congress" })).toBeVisible();
    // Every match leads with its plain count ("Agrees on 7 of 8"; read as "agrees with you on").
    await expect(page.getByText(/agrees with you on \d+ of \d+ votes/i).first()).toBeVisible();
    // A percent sits beside a plain count; what the percent weighs is said once, beside one link.
    const note =
      "Votes you care more about count more. When you share only a few votes, scores stay near 50%, so a lucky streak does not look like a perfect match.";
    await expect(page.getByText(note)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "How scores work" })).toHaveCount(1);
    const row = page.locator("#main li a[href^='/people/']").filter({ hasText: /\d+%/ }).first();
    await expect(row).toContainText(/\d+%/);
    // The plain count leads and the score follows it (round 10: the count is the headline).
    expect(await shownText(row)).toMatch(/Agrees on \d+ of \d+ Match score \d+%$/);
    if (test.info().project.name === "desktop") {
      // The weights rail: four weights, a hairline, and a row for the rest, never a fade.
      const rail = page.getByRole("complementary", { name: "Adjust what matters" });
      await expect(rail.getByRole("radiogroup")).toHaveCount(4);
      const more = rail.getByRole("button", { name: "7 more votes" });
      await expect(more).toHaveAttribute("aria-expanded", "false");
      expect(
        await rail.evaluate((node) =>
          [...node.querySelectorAll<HTMLElement>("*")].some(
            (element) => getComputedStyle(element).maskImage !== "none",
          ),
        ),
      ).toBe(false);
      await more.click();
      await expect(rail.getByRole("radiogroup")).toHaveCount(11);
      await expect(rail.getByRole("button", { name: "Show fewer votes" })).toBeVisible();
    }

    await page.goto("/swipe");
    await waitForHydration(page);
    // The receipt sits in the ballot on phones and in the answer tray from tablets up; role queries
    // skip the hidden copy, so this finds whichever one the voter sees.
    await page
      .getByRole("main")
      .getByRole("button", { name: /Receipt:/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Receipt" })).toBeVisible();
    await expect(sheet.getByText("Verified from the official record")).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: /View the official record/ }).first(),
    ).toHaveAttribute("href", /^https:\/\/(clerk\.house\.gov|www\.senate\.gov)\//);
  });

  test("the deck works with the keyboard alone", async ({ page }) => {
    await page.goto("/swipe");
    await waitForHydration(page);
    await page.locator("[data-deck-ready]").waitFor({ state: "attached" });
    await expect(page.getByText(/^0 of \d+ answered$/)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/^1 of \d+ answered$/)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/^2 of \d+ answered$/)).toBeVisible();
    // Digit shortcuts act only while focus is inside the deck (WCAG 2.1.4).
    const matters = page.getByRole("switch", { name: /^This one matters a lot to me/ });
    await expect(matters).toHaveAttribute("aria-checked", "false");
    await matters.focus();
    await page.keyboard.press("3");
    await expect(matters).toHaveAttribute("aria-checked", "true");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText(/^3 of \d+ answered$/)).toBeVisible();
    await page.getByRole("button", { name: "Undo last answer" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^2 of \d+ answered$/)).toBeVisible();
  });

  test("home and swipe pass axe and every fact has a receipt", async ({ page }) => {
    for (const path of ["/", "/swipe"]) {
      await page.goto(path);
      await expectAccessible(page);
      await expectProvenance(page);
    }
  });
});

/** A device with these answers saved before any page script runs (weight 2, "Some"). */
async function seedAnswers(page: Page, choices: Array<"Yea" | "Nay" | "Skip">) {
  const ids = [
    "kv-aca-extension",
    "kv-obbba",
    "kv-iran-war-powers",
    "kv-laken-riley",
    "kv-canada-tariffs",
    "kv-save-act",
    "kv-federal-worker-unions",
  ];
  await page.addInitScript(
    (stances) =>
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "swiping",
          stances,
          location: null,
          ballotPlan: null,
          following: [],
        }),
      ),
    choices.map((choice, i) => ({
      keyVoteId: ids[i],
      choice,
      weight: 2,
      answeredAt: `2026-09-23T15:0${i}:00.000Z`,
    })),
  );
}

test.describe("a returning voter's path to their matches", () => {
  test("Home shows the closest match and the count with skips", async ({ page }) => {
    await seedAnswers(page, ["Yea", "Nay", "Yea", "Yea", "Nay", "Skip"]);
    await page.goto("/");
    await waitForHydration(page);
    const hero = page.getByRole("region", { name: "Try the first vote" });
    await expect(hero.getByText("6 of 20 answered (1 skipped).")).toBeVisible();
    await expect(hero.getByRole("link", { name: "Go to all 20 votes" })).toHaveAttribute(
      "href",
      "/swipe",
    );
    const closest = hero.getByRole("link", {
      name: /^(Your closest match|Tied for closest) .*Agrees on/,
    });
    await expect(closest).toHaveAttribute("href", "/matches");
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("the fifth Yea or Nay answer pauses once, and the pause passes axe", async ({ page }) => {
    await seedAnswers(page, ["Yea", "Nay", "Yea", "Skip", "Nay"]);
    await page.goto("/swipe");
    await waitForHydration(page);
    await answer(page, "Yea");
    const pause = page.getByRole("region", {
      name: "You’ve answered enough to see who votes like you",
    });
    await expect(pause).toBeVisible();
    // Focus moves from the answer button that went away to the pause's heading.
    await expect(pause.getByRole("heading", { level: 2 })).toBeFocused();
    await expect(pause.getByRole("button", { name: "Keep going, 14 left" })).toBeVisible();
    await expectAccessible(page);
    await expectProvenance(page);
    await pause.getByRole("button", { name: "Keep going, 14 left" }).click();
    await expect(page.getByRole("button", { name: "Yea", exact: true })).toBeVisible();
    // Once per visit: undo the fifth answer and give it again, and the next vote follows at once.
    await page.getByRole("button", { name: "Undo last answer" }).click();
    await expect(page.getByText(/^5 of \d+ answered$/)).toBeVisible();
    await answer(page, "Yea");
    await expect(page.getByText(/^6 of \d+ answered$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Nay", exact: true })).toBeVisible();
    await expect(pause).toHaveCount(0);
  });
});
