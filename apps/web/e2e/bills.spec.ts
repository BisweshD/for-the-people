import type { Page } from "@playwright/test";
import {
  chooseOption,
  expect,
  expectAccessible,
  expectProvenance,
  test,
  waitForHydration,
} from "./fixtures";

/** Below 834 px The Board folds into one row; open it the way a reader would. */
async function openBoard(page: Page) {
  const row = page.getByRole("button", { name: /^Replay the (House|Senate) vote board/ });
  if (await row.isVisible()) {
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }
}

test.describe("bill page, The Board, and the hemicycle", () => {
  test("a bill replays on The Board and a cell opens that member", async ({ page }) => {
    await page.goto("/bills/119-hr-1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("One Big Beautiful Bill Act");
    await expect(
      page.getByText("Official summary from the Congressional Research Service"),
    ).toBeVisible();

    await openBoard(page);
    const board = page.getByRole("region", { name: "The Board" });
    const cells = board.getByRole("group", { name: "The Board" }).getByRole("link");
    await expect(cells).toHaveCount(432);
    await expect(cells.first()).toHaveAccessibleName(
      /^(Rep\.|Del\.|Res\. Comm\.) .+, [A-Z]{2}, (voted (Yea|Nay|Present)|did not vote)$/,
    );

    const replay = board.getByRole("button", { name: "Replay", exact: true });
    await replay.scrollIntoViewIfNeeded();
    await replay.click();
    const unlit = () =>
      board
        .locator("[data-light]")
        .evaluateAll(
          (lights) => lights.filter((light) => getComputedStyle(light).opacity !== "1").length,
        );
    await expect.poll(unlit, { intervals: [50] }).toBeGreaterThan(0);
    await expect(replay).toBeEnabled();
    await expect.poll(unlit).toBe(0);
    const tallies = board.locator('[data-fact="roll-call-totals"]');
    await expect(tallies).toContainText("218");
    await expect(tallies).toContainText("214");

    await cells.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(cells.nth(1)).toBeFocused();
    await expect(cells.nth(1)).toHaveAttribute("tabindex", "0");
    await expect(cells.first()).toHaveAttribute("tabindex", "-1");

    const name = (await cells.nth(1).getAttribute("aria-label"))!
      .split(",")[0]!
      .replace(/^\S+ /, "");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/people\/[A-Z]\d{6}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  });

  test("The Board and the hemicycle each switch to a table", async ({ page }) => {
    await page.goto("/bills/119-s-5");
    await openBoard(page);
    const board = page.getByRole("region", { name: "The Board" });
    const toggle = board.getByRole("button", { name: "View as table" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const table = board.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(434);
    await expect(board.getByRole("group", { name: "The Board" })).toBeHidden();
    await toggle.click();
    await expect(board.getByRole("group", { name: "The Board" })).toBeVisible();

    const chamber = page.getByRole("region", { name: "The chamber" });
    await expect(chamber.getByRole("img", { name: "The chamber" })).toBeVisible();
    await chamber.getByRole("button", { name: "View as table" }).click();
    await expect(chamber.getByRole("rowheader", { name: "Democrats" })).toBeVisible();
    await expect(chamber.getByRole("rowheader", { name: "Republicans" })).toBeVisible();
  });

  test("how you would vote records a Stance and rings your side of the chamber", async ({
    page,
  }) => {
    await page.goto("/bills/119-s-5");
    await expect(page.getByTestId("you-ring")).toHaveCount(0);
    const answer = page.getByRole("group", { name: "Your answer" });
    await answer.getByRole("button", { name: "Yea" }).click();
    await expect(answer.getByRole("button", { name: "Yea" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Saved on this device: you would vote Yea.")).toBeVisible();
    await expect(page.getByTestId("you-ring")).toHaveCount(1);
    await expect(
      page.getByText(/Your answer puts you with the 263 members who voted Yea/),
    ).toBeVisible();
    const stored = await page.evaluate(() => window.localStorage.getItem("for-the-people.voter"));
    expect(stored).toContain('"keyVoteId":"kv-laken-riley"');
  });

  test("how your members voted uses the location saved on this device", async ({ page }) => {
    await page.goto("/bills/119-s-5");
    const members = page.getByRole("region", { name: "How your members voted" });
    await expect(members.getByRole("link", { name: "Add your address" })).toHaveAttribute(
      "href",
      "/ballot",
    );
    await page.evaluate(() =>
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "22222222-2222-4222-8222-222222222222",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "new",
          stances: [],
          location: {
            state: "VT",
            districts: ["VT-0@cd119"],
            ballotDistrictConfirmed: true,
            setAt: "2026-09-23T16:00:00.000Z",
            method: "manual",
          },
          ballotPlan: null,
          following: [],
        }),
      ),
    );
    await page.reload();
    const rows = members.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(members.getByRole("link", { name: /^Sen\. .*Sanders$/ })).toBeVisible();
    await expect(
      members.getByText(/VT at-large: Voted (Yea|Nay)|VT at-large: Did not vote/),
    ).toBeVisible();
  });

  test("receipts open from the bill and from every roll call", async ({ page }) => {
    await page.goto("/bills/119-s-5");
    await page.getByRole("button", { name: "Receipt for this bill" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Receipt" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /View the official record/ })).toHaveAttribute(
      "href",
      "https://www.congress.gov/bill/119th-congress/senate-bill/5",
    );
    await page.keyboard.press("Escape");

    const votes = page.getByRole("region", { name: "Every recorded vote on this bill" });
    await votes.getByRole("button", { name: "Receipt" }).last().click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: /View the official record/ }),
    ).toHaveAttribute("href", /^https:\/\/(clerk\.house\.gov|www\.senate\.gov)\//);
  });

  test("a roll call lists every member, filterable by state and vote", async ({ page }) => {
    await page.goto("/votes/senate-119-1-372");
    // The plain line leads; the official question stays on the page under it.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A vote to pass the One Big Beautiful Bill Act",
    );
    await expect(page.getByText("Official question: On Passage of the Bill")).toBeVisible();
    await expect(
      page.getByText("Tie broken by the Vice President of the United States"),
    ).toBeVisible();
    const list = page.getByRole("region", { name: "How every member voted" });
    await expect(list.getByText("Showing 100 of 100 members")).toBeVisible();
    // The shared restyled select, not a native one.
    await expect(list.locator("select")).toHaveCount(0);
    await chooseOption(page, "State", "Vermont");
    await list.getByRole("button", { name: /^Nay/ }).click();
    await expect(list.getByText("Showing 2 of 100 members")).toBeVisible();
    await expect(list.getByRole("link", { name: /Sanders/ })).toBeVisible();
    // As in the shared member row: the name, then the party letter, then the office in OfficeText's words.
    const sanders = list.getByRole("listitem").filter({ hasText: "Sanders" });
    await expect(sanders.locator('a + span[title="Independent"]')).toHaveCount(1);
    await expect(sanders.getByRole("link")).toHaveText(/^\S.* Sanders$/);
    await expect(sanders).toContainText(/(U\.S\. Senator|Sen\.), Vermont/);
    await list.getByLabel("Search by name").fill("Welch");
    await expect(list.getByText("Showing 1 of 100 members")).toBeVisible();
  });

  test("a concurrent resolution agreed to by both chambers does not read 'Not law'", async ({
    page,
  }) => {
    await page.goto("/bills/119-hconres-86");
    const status = page.locator('[data-fact="measure-status"]').first();
    await expect(status).toContainText("Agreed to by both chambers");
    await expect(status).not.toContainText("Not law");
    await expect(page.getByText("does not go to the President")).toBeVisible();
  });

  test("a cloture vote shows the three-fifths threshold it needed", async ({ page }) => {
    await page.goto("/votes/senate-119-1-100");
    await expect(page.locator('[data-fact="roll-call-threshold"]')).toHaveText(
      "Needed three-fifths of all senators (60 when every seat is filled).",
    );
  });

  test("an unknown bill is not found", async ({ page }) => {
    const response = await page.goto("/bills/119-hr-999999");
    expect(response?.status()).toBe(404);
  });

  test("the bill page asks how you would vote before The Board and previews its summary cleanly", async ({
    page,
  }) => {
    await page.goto("/bills/119-hr-1");
    const order = await page
      .locator("h2")
      .evaluateAll((headings) => headings.map((heading) => heading.textContent?.trim()));
    expect(order.indexOf("How you would vote")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("How you would vote")).toBeLessThan(order.indexOf("The Board"));

    // The plain words lead; the official summary sits behind one disclosure under them.
    await expect(page.getByText("In plain words", { exact: true })).toBeVisible();
    await page.getByText("Official summary from the Congressional Research Service").click();
    const summary = page.locator(`div[data-fact="crs-summary"]`);
    await expect(
      summary.getByText("Official summary by the Congressional Research Service"),
    ).toBeVisible();
    const preview = summary.locator(":scope > div.font-serif > *");
    await expect(preview.last()).toHaveJSProperty("tagName", "P");
    for (const text of await preview.allTextContents()) {
      expect(text).not.toMatch(/^[^a-z]*$/);
    }
    await summary.getByRole("link", { name: "Read the full summary" }).click();
    await page.waitForURL(/\/bills\/119-hr-1\/summary$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "H.R. 1: the official summary",
    );
    // The heading names the title as the rail and the chart do; the CRS's full heading opens its text.
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(
      "Title I: Agriculture, Nutrition, and Forestry",
    );
    await expect(page.locator("details#title-i")).toContainText(
      "In the CRS summary: Title I: Committee on Agriculture, Nutrition, and Forestry",
    );
    await page.getByRole("link", { name: "Back to H.R. 1" }).click();
    await page.waitForURL(/\/bills\/119-hr-1$/);
  });

  test("the full summary opens as closed titles with the CRS's own gists, and expands", async ({
    page,
  }, info) => {
    await page.goto("/bills/119-hr-1/summary");
    await waitForHydration(page);
    const titles = page.locator("article details[data-summary-section]:not(details details)");
    expect(await titles.count()).toBeGreaterThanOrEqual(10);
    await expect(page.locator("details[data-summary-section][open]")).toHaveCount(0);
    await expect(titles.first().locator(":scope > summary")).toContainText(
      "This title addresses a wide range of Department of Agriculture (USDA) programs",
    );
    // Every word stays in the page while closed, for find-in-page and screen readers.
    await expect(titles.first()).toContainText("Thrifty Food Plan");
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(8000);

    // The way back and "Expand all" stay in reach below 1280 px; from 1280 px the rail holds them.
    const back = page.getByRole("link", { name: "Back to H.R. 1" });
    const expand = page.getByRole("button", { name: "Expand all" });
    await page.mouse.wheel(0, 3000);
    if (info.project.name === "mobile") {
      await expect(back).toBeInViewport();
      await expect(expand).toBeInViewport();
    } else {
      const rail = page.getByRole("navigation", { name: "On this page" });
      await expect(rail).toBeInViewport();
      await rail.getByRole("link", { name: "Title VII: Finance" }).click();
      await expect(page.locator("details#title-vii")).toHaveAttribute("open", "");
      await expect(page.locator("details#title-vii > summary")).toBeInViewport();
    }
    await expand.click();
    await expect(page.locator("details[data-summary-section]:not([open])")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Collapse all" })).toBeVisible();
    await expectAccessible(page);
  });

  test("every title has a gist, a bar sizes titles by sections, and the rail starts on nothing", async ({
    page,
  }, info) => {
    await page.goto("/bills/119-hr-1/summary");
    await waitForHydration(page);
    const summaries = page.locator(
      "article details[data-summary-section]:not(details details) > summary",
    );
    const count = await summaries.count();
    for (let index = 0; index < count; index++) {
      const text = (await summaries.nth(index).textContent()) ?? "";
      expect(text).toMatch(/This (title|section|subtitle|chapter|part)\b/);
      // The CRS's section locator lives in the meta line, never at the head of a gist.
      expect(text).not.toMatch(/\(Sec\./);
    }
    // A title that opens on one section's paragraph says so, and where that section is.
    const armed = page.locator("details#title-ii > summary");
    // One name per title: the heading, the chart's link and the rail all read "Title II: Armed Services".
    await expect(armed.getByRole("heading", { level: 2 })).toHaveText("Title II: Armed Services");
    await armed.click();
    await expect(
      page.getByText("In the CRS summary: Title II: Committee on Armed Services"),
    ).toBeVisible();
    await armed.click();
    await expect(armed).toContainText("From its first section: This section provides");
    await expect(armed).toContainText(/\d+ sections?; from Sec\. 20001/);
    // A title's own overview needs no such note.
    await expect(summaries.first()).not.toContainText("From its first");

    const bar = page.getByRole("navigation", { name: "207 sections, by title" });
    await expect(bar).toHaveAccessibleDescription(
      "Finance is the largest title, with 86 of 207 sections.",
    );
    const segments = bar.getByRole("link");
    await expect(segments).toHaveCount(count);
    // Every bar starts at zero, so lengths compare directly.
    const starts = await bar
      .locator("a > span[aria-hidden] > span")
      .evaluateAll((marks) =>
        marks.map(
          (mark) =>
            mark.getBoundingClientRect().left - mark.parentElement!.getBoundingClientRect().left,
        ),
      );
    expect(starts).toHaveLength(count);
    for (const start of starts) expect(start).toBe(0);
    await expect(
      bar.getByRole("link", { name: "Title VII: Finance, 86 of 207 sections" }),
    ).toBeVisible();
    await expect(bar.getByRole("link", { name: /^Title II: Armed Services, / })).toBeVisible();
    await expect(bar).toContainText("Finance");
    await expect(bar).toContainText("86 of 207");
    await bar.getByRole("link", { name: /^Title VII: Finance/ }).click();
    await expect(page.locator("details#title-vii")).toHaveAttribute("open", "");
    await expect(page.locator("details#title-vii > summary")).toBeInViewport();

    if (info.project.name !== "mobile") {
      await page.goto("/bills/119-hr-1/summary");
      await waitForHydration(page);
      const rail = page.getByRole("navigation", { name: "On this page" });
      await expect(rail).toBeVisible();
      const frames = () =>
        page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        );
      await frames();
      // At the top of the page no title is being read yet.
      await expect(rail.locator('[aria-current="location"]')).toHaveCount(0);
      await page.locator("details#title-ii").evaluate((title) => title.scrollIntoView());
      // The rail uses the chart's short names: "Committee on" is not read down every row.
      await expect(rail.locator('[aria-current="location"]')).toHaveText(
        "Title II: Armed Services",
      );
      await expect(rail.getByText(/Committee on/)).toHaveCount(0);
    }
  });

  test("the full summary page passes axe and carries its receipt", async ({ page }) => {
    await page.goto("/bills/119-hr-1/summary");
    await expectAccessible(page);
    expect(await expectProvenance(page)).toBeGreaterThan(0);
    const missing = await page.goto("/bills/119-hr-999999/summary");
    expect(missing?.status()).toBe(404);
  });

  test("a bill lists five roll calls, key votes marked, then shows all of them", async ({
    page,
  }) => {
    await page.goto("/bills/119-hr-1");
    const votes = page.getByRole("region", { name: "Every recorded vote on this bill" });
    const rows = votes.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    await expect(votes.getByText("Key vote", { exact: true })).toHaveCount(2);
    await expect(rows.first()).toContainText("House roll call 190");
    const more = votes.getByRole("button", { name: "Show all 24 roll calls" });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(24);
    await expect(more).toBeHidden();
    await expect(rows.nth(5).getByRole("link")).toBeFocused();
  });

  test("The Board has readable cells and a visible focus ring; the hemicycle waits", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/bills/119-hr-1");
    await openBoard(page);
    const board = page.getByRole("region", { name: "The Board" });
    const cell = board.locator("[data-cell]").first();
    const size = await cell.boundingBox();
    // The WCAG 2.2 target floor: every cell is a link to that member.
    expect(size!.width).toBeGreaterThanOrEqual(24);
    expect(size!.height).toBeGreaterThanOrEqual(24);
    const letter = await cell
      .locator("[data-light]")
      .evaluate((light) => Number.parseFloat(getComputedStyle(light).fontSize));
    expect(letter).toBeGreaterThanOrEqual(12);

    const hint = page.getByTestId("board-inspector");
    await hint.scrollIntoViewIfNeeded();
    expect(await hint.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await hint.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe("ellipsis");

    await cell.focus();
    await page.keyboard.press("ArrowRight");
    const focused = board.locator("[data-cell]").nth(1);
    const outline = await focused.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });
    const strong = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--marigold-strong)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(outline).toEqual({ width: "2px", style: "solid", color: strong });

    const chamber = page.getByRole("region", { name: "The chamber" });
    await chamber.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const faded = await chamber
      .locator("svg g circle")
      .evaluateAll(
        (seats) => seats.filter((seat) => getComputedStyle(seat).opacity !== "1").length,
      );
    expect(faded).toBe(0);

    await page
      .getByRole("group", { name: "Your answer" })
      .getByRole("button", { name: "Nay" })
      .click();
    const ring = page.getByTestId("you-ring").locator("circle");
    await expect(ring).toHaveClass(/stroke-marigold-strong/);
  });

  test("a roll call shows 20 members, then all of them", async ({ page }) => {
    await page.goto("/votes/house-119-1-190");
    const list = page.getByRole("region", { name: "How every member voted" });
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(20);
    await list.getByRole("button", { name: "Show all 432 members" }).click();
    await expect(rows).toHaveCount(432);
    await expect(page.locator('[data-fact="roll-call-threshold"]')).toHaveText(
      "Needed a simple majority of those voting.",
    );
  });

  test("a roll call leads with its plain line, and its result bar counts up with The Board", async ({
    page,
  }) => {
    await page.goto("/votes/house-119-1-190");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A vote to accept the Senate's changes to the One Big Beautiful Bill Act",
    );
    await expect(
      page.getByText("Official question: On Motion to Concur in the Senate Amendment"),
    ).toBeVisible();
    const result = page.locator('[data-fact="roll-call-result"]');
    await expect(result).toContainText("Passed by 4 votes");
    await expect(result).toContainText("217 needed");
    await expect(result).toContainText("218 Yea (yes)");
    await expect(result).toContainText("214 Nay (no)");
    // The party bars are a picture; the same numbers stay in a table for screen readers.
    const parties = page.getByRole("table", { name: "How each party voted" });
    await expect(parties.getByRole("rowheader", { name: "Republicans" })).toBeAttached();

    // Result bar, then the chamber, then The Board.
    const regions = await page
      .locator("section[aria-label]")
      .evaluateAll((sections) => sections.map((section) => section.getAttribute("aria-label")));
    expect(regions.indexOf("The chamber")).toBeLessThan(regions.indexOf("The Board"));

    await openBoard(page);
    const board = page.getByRole("region", { name: "The Board" });
    const replay = board.getByRole("button", { name: "Replay", exact: true });
    await replay.scrollIntoViewIfNeeded();
    await replay.click();
    const yea = () => result.evaluate((node) => node.textContent ?? "");
    await expect.poll(yea, { intervals: [50] }).not.toContain("218 Yea (yes)");
    await expect.poll(yea).toContain("218 Yea (yes)");
  });

  test("The Board folds into one row on a phone and rings the voter's own member", async ({
    page,
  }, info) => {
    await page.addInitScript(() =>
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "33333333-3333-4333-8333-333333333333",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "new",
          stances: [],
          location: {
            state: "TX",
            districts: ["TX-37@cd119", "TX-10@cd120"],
            ballotDistrictConfirmed: true,
            setAt: "2026-09-23T16:00:00.000Z",
            method: "manual",
          },
          ballotPlan: null,
          following: [],
        }),
      ),
    );
    await page.goto("/votes/house-119-1-190");
    const board = page.getByRole("region", { name: "The Board" });
    const cells = board.getByRole("group", { name: "The Board" });
    const row = page.getByRole("button", { name: /^Replay the House vote board/ });
    if (info.project.name === "mobile") {
      await expect(cells).toBeHidden();
      await expect(row).toHaveAttribute("aria-expanded", "false");
      await row.click();
    } else {
      await expect(row).toBeHidden();
    }
    await expect(cells).toBeVisible();
    // One row per state, its two-letter code at the left.
    await expect(board.getByText("TX", { exact: true })).toBeVisible();
    const mine = board.locator("[data-you]");
    await expect(mine).toHaveCount(1);
    await expect(mine).toHaveAccessibleName(
      /^Rep\. .+, TX, (voted (Yea|Nay|Present)|did not vote), your representative$/,
    );
    expect(await mine.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
  });

  test("every recorded vote on a bill leads with its plain line and a result mark", async ({
    page,
  }) => {
    await page.goto("/bills/119-hr-1");
    const votes = page.getByRole("region", { name: "Every recorded vote on this bill" });
    const first = votes.getByRole("listitem").first();
    await expect(first.getByRole("link")).toHaveText(
      /^A vote to accept the Senate's changes to the One Big Beautiful Bill Act/,
    );
    await expect(first).toContainText("Official question: On Motion to Concur");
    await expect(first).toContainText("Passed, 218 to 214");
    await expect(first.locator("svg.lucide-circle-check")).toHaveCount(1);
    // The receipt says so in words, on a 44 px target.
    const receipt = first.getByRole("button", { name: "Receipt for House roll call 190" });
    await expect(receipt).toHaveText("Receipt");
    const box = await receipt.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-fact="measure-status"]').first()).toContainText("Became law");
  });

  for (const path of [
    "/bills/119-hr-1",
    "/bills/119-s-5",
    "/votes/senate-119-1-372",
    "/votes/house-119-1-190",
  ]) {
    test(`${path} passes axe and every fact has a receipt`, async ({ page }) => {
      await page.goto(path);
      await expectAccessible(page);
      expect(await expectProvenance(page)).toBeGreaterThan(5);
    });
  }
});
