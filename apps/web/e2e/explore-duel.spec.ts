import type { Page } from "@playwright/test";
import {
  expect,
  expectAccessible,
  expectProvenance,
  shownText,
  test,
  waitForHydration,
} from "./fixtures";

/** Explore (issue rail, filters in the URL, map) and Vote Duel (two current senators, receipts). */

const COLLINS = "C001035";
const MURKOWSKI = "M001153";
const SANDERS = "S000033";
const PELOSI = "P000197";

/**
 * Puts answers (and, when given, saved districts) on the device the way the app stores them. Each
 * answer counts "Some" (weight 2) unless it names its own weight.
 */
async function seedStances(
  page: Page,
  stances: Array<[string, "Yea" | "Nay"] | [string, "Yea" | "Nay", 1 | 2 | 3]>,
  districts: string[] = [],
) {
  await page.addInitScript(
    ({ entries, districts }) => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "matched",
          stances: entries.map(([keyVoteId, choice, weight], index) => ({
            keyVoteId,
            choice,
            weight: weight ?? 2,
            answeredAt: `2026-09-23T15:${String(index).padStart(2, "0")}:00.000Z`,
          })),
          location:
            districts.length > 0
              ? {
                  state: districts[0]!.slice(0, 2),
                  districts,
                  ballotDistrictConfirmed: true,
                  setAt: "2026-09-23T15:30:00.000Z",
                  method: "census-geocoder",
                }
              : null,
          ballotPlan: null,
          following: [],
        }),
      );
    },
    { entries: stances, districts },
  );
}

/** Answers that every current member of Congress can share: the first 11 key votes of the deck. */
const ELEVEN: Array<[string, "Yea" | "Nay"]> = [
  ["kv-aca-extension", "Yea"],
  ["kv-obbba", "Nay"],
  ["kv-iran-war-powers", "Yea"],
  ["kv-laken-riley", "Yea"],
  ["kv-canada-tariffs", "Nay"],
  ["kv-federal-worker-unions", "Yea"],
  ["kv-california-ev-waiver", "Nay"],
  ["kv-ukraine-aid", "Yea"],
  ["kv-born-alive", "Nay"],
  ["kv-genius-act", "Yea"],
  ["kv-girls-sports", "Yea"],
];

test.describe("your members first", () => {
  test("Matches leads with the voter's House member and senators, count first", async ({
    page,
  }) => {
    await seedStances(page, ELEVEN, ["TX-37@cd119", "TX-10@cd120"]);
    await page.goto("/matches");
    const yours = page.getByRole("region", { name: "Your members of Congress" });
    const rows = yours.getByRole("link");
    await expect(rows).toHaveCount(3);
    // The House member first, then both senators; each row leads with its plain count.
    await expect(rows.nth(0)).toContainText("Doggett");
    await expect(rows.nth(0)).toContainText(/Agrees with you on \d+ of \d+ votes?\./);
    await expect(rows.nth(0)).toContainText(/Match score \d+%/);
    await expect(yours.getByRole("textbox")).toHaveCount(0);
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("without a saved location, Matches offers the ballot's address form in place", async ({
    page,
  }) => {
    await seedStances(page, ELEVEN);
    await page.goto("/matches");
    const yours = page.getByRole("region", { name: "Your members of Congress" });
    await expect(yours.getByRole("textbox", { name: "Your home address" })).toBeVisible();
    await expect(yours.getByRole("button", { name: "Pick my district instead" })).toBeVisible();
  });

  test("a tie is marked by a label and a rule, and only its first mixed tie carries a note", async ({
    page,
  }) => {
    // Weights of 1 to 3 in turn, so ties can mix counts ("8 of 10" beside "4 of 5").
    await seedStances(
      page,
      ELEVEN.map(([id, choice], index) => [id, choice, ((index % 3) + 1) as 1 | 2 | 3]),
    );
    await page.goto("/matches");
    const closest = page.getByRole("region", { name: "Closest to you in Congress" });
    await expect(closest.getByText(/^Tied at \d+%$/).first()).toBeVisible();
    // Each tie is a labelled list; a tie whose rows show different counts is a mixed tie.
    const ties = closest.locator("ul[aria-labelledby^='tie-']");
    const counts = await ties.evaluateAll((lists) =>
      lists.map(
        (list) =>
          new Set(
            [...list.querySelectorAll('[data-fact="match"]')].map(
              (score) => /on (\d+ of \d+)/.exec(score.textContent ?? "")?.[1],
            ),
          ).size,
      ),
    );
    // The page carries one short note on ties, on the first mixed one, and none when no tie mixes.
    await expect(page.getByText(/^Scores lean toward 50% until you share more votes/)).toHaveCount(
      counts.some((size) => size > 1) ? 1 : 0,
    );
    // Issues with fewer than 2 shared votes are left out of "Where you agree most".
    for (const chip of await closest
      .getByRole("list", { name: "Where you agree most" })
      .locator("li")
      .all())
      await expect(chip).toContainText(/of ([2-9]|\d{2,})/);
  });

  test("Explore pins the voter's own members first with a Yours tag", async ({ page }) => {
    await seedStances(page, ELEVEN, ["TX-37@cd119"]);
    await page.goto("/explore");
    const rows = page.locator("[data-member-row]");
    for (const index of [0, 1, 2]) await expect(rows.nth(index)).toContainText("Yours");
    await expect(rows.nth(3)).not.toContainText("Yours");
    // The three are TX-37's representative and Texas's two senators, in rank order among themselves.
    const pinned = (
      await rows.evaluateAll((nodes) => nodes.slice(0, 3).map((node) => node.textContent))
    ).join(" ");
    for (const name of ["Doggett", "Cornyn", "Cruz"]) expect(pinned).toContain(name);
  });

  test("initials keep a surname's particle: Matt Van Epps is MV", async ({ page }) => {
    await page.goto("/explore?state=TN&chamber=house");
    const row = page.locator("[data-member-row]", { hasText: "Van Epps" });
    await expect(row).toContainText("MV");
    await expect(row).not.toContainText("ME");
  });
});

test.describe("explore", () => {
  test("filters by state and issue, with the state in the URL and on the map", async ({
    page,
  }, testInfo) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { level: 1, name: "Explore Congress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^\d+ members$/ })).toBeVisible();

    // On phones, chamber, party, and state sit in a bottom sheet behind the Filters button.
    const mobile = testInfo.project.name === "mobile";
    if (mobile) {
      await expect(async () => {
        await page.getByRole("button", { name: /^Filters/ }).click();
        await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible({
          timeout: 1_000,
        });
      }).toPass();
    }
    // The select is controlled, so retry until the page has hydrated and the choice reaches the URL.
    await expect(async () => {
      await page.getByRole("combobox", { name: "State" }).selectOption("");
      await page.getByRole("combobox", { name: "State" }).selectOption("ME");
      await expect(page).toHaveURL(/[?&]state=ME/, { timeout: 1_000 });
    }).toPass();
    if (mobile) {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Filters" })).toBeHidden();
    }
    const heading = page.getByRole("heading", { name: /^\d+ members? from Maine$/ });
    await expect(heading).toBeVisible();
    const cards = page.locator("#main ul li a[href^='/people/']");
    const count = Number((await heading.textContent())!.split(" ")[0]);
    await expect(cards).toHaveCount(count);
    for (const office of await cards.locator("p.text-ink-2").allTextContents())
      expect(office).toMatch(/Maine|ME-|ME at-large/);

    await page.getByRole("button", { name: "Elections and voting" }).click();
    await expect(page.getByRole("button", { name: "Elections and voting" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/[?&]issue=elections/);
    await expect(page).toHaveURL(/[?&]state=ME/);
    await expect(
      page.getByRole("heading", { name: "Key votes on elections and voting" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^H\.R\. 22: / })).toHaveAttribute(
      "href",
      "/bills/119-hr-22",
    );

    if (mobile) {
      await expect(page.getByRole("region", { name: /each state/ })).toBeHidden();
      await page.getByRole("button", { name: "Show map" }).click();
    }
    const maine = page.getByRole("button", { name: /^Maine: \d+ members?, / });
    await expect(maine).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Texas: \d+ members?, / }).click();
    await expect(page).toHaveURL(/[?&]state=TX/);

    await page.getByRole("button", { name: "View as table" }).click();
    await expect(page.getByRole("table")).toContainText("Texas");
  });

  test("with answers, an issue ranks members by agreement on it", async ({ page }, testInfo) => {
    await seedStances(page, [
      ["kv-save-act", "Yea"],
      ["kv-laken-riley", "Nay"],
    ]);
    await page.goto("/explore?issue=elections&chamber=house");
    await expect(
      page.getByText(/ranked by how often they voted your way on elections/i).first(),
    ).toBeVisible();
    const first = page.locator("#main ul li a[href^='/people/']").first();
    await expect(first).toContainText(/Agrees with you on 1 of 1 vote/);
    // Phones load the map only when it is asked for.
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Show map" }).click();
    await expect(page.locator("#map-title")).toHaveText(
      /^How House members from each state match you on elections and voting$/,
    );
  });

  test("rows show a plain count; the page says once how scores are weighted, beside one method link", async ({
    page,
  }) => {
    await seedStances(page, [
      ["kv-save-act", "Yea"],
      ["kv-laken-riley", "Nay"],
    ]);
    await page.goto("/explore");
    const rows = page.locator("[data-member-row]");
    const score = rows.first().locator('[data-fact="match"]');
    // Screen readers still hear that the score is weighted; the visible count is raw, so it never
    // says so. The count leads and the score follows it.
    await expect(score).toContainText(
      /Agrees with you on \d+ of \d+ votes?\. Match score \d+% \(weighted\)/,
    );
    expect(await shownText(score)).toMatch(/^Agrees on \d+ of \d+ Match score \d+%$/);
    await expect(
      page.getByText(
        "Votes you care more about count more. When you share only a few votes, scores stay near 50%, so a lucky streak does not look like a perfect match.",
      ),
    ).toHaveCount(1);
    const method = page.getByRole("link", { name: "How scores work" });
    await expect(method).toHaveCount(1);
    await expect(method).toHaveAttribute("href", "/methodology#match");
  });

  test("the map's count says why it is smaller than the members listed", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedStances(page, [
      ["kv-save-act", "Yea"],
      ["kv-laken-riley", "Nay"],
    ]);
    await page.goto("/explore");
    const listed = Number(
      ((await page.locator("#members-title").textContent()) ?? "").replace(/\D/g, ""),
    );
    const caption = page.locator("figcaption", { hasText: /^Median match with you/ });
    await expect(caption).toBeVisible();
    const text = (await caption.textContent()) ?? "";
    // Delegates have no passage votes to share, so fewer members have a score than are listed.
    const scored = Number(/from the ([\d,]+) of/.exec(text)?.[1]?.replace(/,/g, ""));
    expect(scored).toBeLessThan(listed);
    expect(text).toBe(
      `Median match with you, from the ${scored} of ${listed} members who share a vote with you`,
    );
  });

  test("the first member is above the fold, and the map follows every filter", async ({
    page,
  }, testInfo) => {
    await page.goto("/explore?chamber=senate&party=R");
    const first = page.locator("[data-member-row]").first();
    await expect(first).toBeVisible();
    if (testInfo.project.name === "mobile") {
      // Above the bottom tab bar on a 390 x 844 phone.
      const box = (await first.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(844 - 64);
      await page.getByRole("button", { name: "Show map" }).click();
    }
    await expect(page.locator("#map-title")).toHaveText(
      "How often each state's Republican senators vote with their party",
    );
    await page.getByRole("button", { name: "View as table" }).click();
    await expect(page.getByRole("table").getByRole("row", { name: /^Maine 1 \d/ })).toBeVisible();
    await expect(page.locator("#main")).not.toContainText(/\b(card|deck)s?\b/i);
  });

  test("explore passes axe and every fact has a receipt", async ({ page }) => {
    await seedStances(page, [["kv-save-act", "Yea"]]);
    for (const path of ["/explore", "/explore?issue=elections"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: /members?/ }).first()).toBeVisible();
      await expectAccessible(page);
      expect(await expectProvenance(page)).toBeGreaterThan(0);
    }
  });
});

test.describe("vote duel", () => {
  test("two current senators: agreement with n, key votes, and a receipt on a split", async ({
    page,
  }) => {
    await page.goto(`/duel?a=${COLLINS}&b=${MURKOWSKI}`);
    const agreement = page.getByRole("heading", {
      name: /^Collins and Murkowski agreed on \d+ of \d+ shared votes$/,
    });
    await expect(agreement).toBeVisible();
    const [agreed, shared] = (await agreement.textContent())!.match(/\d+/g)!.map(Number);
    expect(shared).toBeGreaterThan(0);
    expect(agreed).toBeLessThanOrEqual(shared!);
    await expect(
      page.getByRole("heading", { name: `Where they split (${shared! - agreed!})` }),
    ).toBeVisible();

    await expect(page.getByText(/^Agreed on \d+ of \d+ key votes/)).toBeVisible();
    await page
      .getByRole("button", { name: /^Collins: Yea/ })
      .first()
      .click();
    let sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Verified from the official record")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await page
      .getByRole("button", { name: /^Receipt for Senate roll call \d+$/ })
      .first()
      .click();
    sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Receipt" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /^Senate roll call \d+$/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /View the official record/ })).toHaveAttribute(
      "href",
      /^https:\/\/www\.senate\.gov\//,
    );
  });

  test("splits show 20 at a time (10 on a phone), by month, and agree and split use the one shared glyph", async ({
    page,
  }, info) => {
    await page.goto(`/duel?a=${COLLINS}&b=${MURKOWSKI}`);
    const splits = page.getByRole("region", { name: /^Where they split/ });
    const rows = splits.getByRole("listitem");
    const step = info.project.name === "mobile" ? 10 : 20;
    await expect(rows).toHaveCount(step);
    await splits.getByRole("button", { name: new RegExp(`^Show ${step} more`) }).click();
    await expect(rows).toHaveCount(step * 2);
    await expect(
      rows.nth(step).getByRole("link").or(rows.nth(step).getByRole("button")).first(),
    ).toBeFocused();
    // Newest first, under a heading for each month, and each row leads with the vote in plain words.
    await expect(splits.getByRole("heading", { level: 3 }).first()).toHaveText(
      /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/,
    );
    await expect(splits.getByText(/^Official question: On /).first()).toBeVisible();

    const keyVotes = page.getByRole("region", { name: "Key votes" });
    await expect(keyVotes.getByText("Agreed", { exact: true }).first()).toBeVisible();
    const marker = keyVotes.getByText("Split", { exact: true }).first().locator("xpath=..");
    await expect(marker.locator("svg line")).toHaveCount(1);
  });

  test("with answers on the device, the voter gets a line of their own and a You column", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "44444444-4444-4444-8444-444444444444",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "swiping",
          stances: [
            {
              keyVoteId: "kv-laken-riley",
              choice: "Yea",
              weight: 2,
              answeredAt: "2026-09-23T15:00:00.000Z",
            },
            {
              keyVoteId: "kv-obbba",
              choice: "Nay",
              weight: 2,
              answeredAt: "2026-09-23T15:01:00.000Z",
            },
          ],
          location: null,
          ballotPlan: null,
          following: [],
        }),
      ),
    );
    await page.goto(`/duel?a=${COLLINS}&b=${MURKOWSKI}`);
    await expect(
      page.getByText(/^You agree with Collins on \d+ of \d+ and Murkowski on \d+ of \d+$/),
    ).toBeVisible();
    const keyVotes = page.getByRole("region", { name: "Key votes" });
    // The voter's answer is a filled oval and the word, one per key vote.
    await expect(keyVotes.getByText(/^You: (Yea|Nay)$/)).toHaveCount(2);
    await expect(keyVotes.getByText(/^You: Not answered$/).first()).toBeAttached();
  });

  test("members of different chambers share no roll calls", async ({ page }) => {
    await page.goto(`/duel?a=${SANDERS}&b=${PELOSI}`);
    await expect(page.getByRole("heading", { name: "No shared roll calls" })).toBeVisible();
    await expect(page.getByText(/never voted on the same roll call/)).toBeVisible();
    await expect(page.getByText(/Took the same side on \d+ of \d+ key votes/)).toBeVisible();
    await expect(
      page.getByText("Votes in different chambers are compared on the bill itself.", {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("a profile offers the duel by its name, and the duel sits under Explore", async ({
    page,
  }) => {
    await page.goto(`/people/${COLLINS}`);
    await page.getByRole("link", { name: "Compare votes with another member" }).click();
    await expect(page).toHaveURL(new RegExp(`/duel\\?a=${COLLINS}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Vote Duel" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Compare/ })).toHaveCount(0);
  });

  test("the picker searches the member index and puts the choice in the URL", async ({ page }) => {
    await page.goto(`/duel?a=${COLLINS}`);
    await page.getByRole("button", { name: "Choose the second member" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose the second member" });
    await dialog.getByPlaceholder("Search a name or state").fill("Murkowski");
    await dialog.getByRole("option", { name: /Lisa Murkowski/ }).click();
    await expect(page).toHaveURL(new RegExp(`b=${MURKOWSKI}`));
    await expect(
      page.getByRole("heading", { name: /^Collins and Murkowski agreed on \d+ of \d+/ }),
    ).toBeVisible();
  });

  test("duel passes axe and every fact has a receipt", async ({ page }) => {
    await page.goto(`/duel?a=${COLLINS}&b=${MURKOWSKI}`);
    await expect(page.getByRole("heading", { name: /agreed on/ })).toBeVisible();
    // The key-vote pairs drop in and the meter slides after hydration; axe must scan the settled page,
    // so wait until every finite animation has finished.
    await waitForHydration(page);
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .every((animation) => animation.playState === "finished"),
    );
    await expectAccessible(page);
    expect(await expectProvenance(page)).toBeGreaterThan(0);
  });
});
