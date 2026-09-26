import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectProvenance, test, waitForHydration } from "./fixtures";

/** Profile facts that need more than a number. */

/** Puts answers on the device the way the swipe deck stores them. */
async function seedVoter(page: Page, stances: Array<[string, "Yea" | "Nay"]>) {
  await page.addInitScript((entries) => {
    window.localStorage.setItem(
      "for-the-people.voter",
      JSON.stringify({
        localId: "11111111-1111-4111-8111-111111111111",
        schemaVersion: 1,
        preferences: { theme: "system" },
        consent: { analytics: false },
        journey: "matched",
        stances: entries.map(([keyVoteId, choice], index) => ({
          keyVoteId,
          choice,
          weight: 2,
          answeredAt: `2026-09-23T15:0${index}:00.000Z`,
        })),
        location: null,
        ballotPlan: null,
        following: [],
      }),
    );
  }, stances);
}

test.describe("profile", () => {
  test("the Speaker gets an explanation instead of a missed-vote share", async ({ page }) => {
    await page.goto("/people/J000299");
    await expect(page.getByText("Speaker of the House", { exact: true })).toBeVisible();
    const missed = page.locator('[data-fact="missed-votes"]');
    await expect(missed).toContainText("the Speaker votes at their discretion");
    await expect(missed).not.toContainText("%");
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("a delegate's missed votes are counted against Committee of the Whole votes only", async ({
    page,
  }) => {
    await page.goto("/people/N000147");
    const missed = page.locator('[data-fact="missed-votes"]');
    await expect(missed).toContainText("Committee of the Whole");
    await expect(missed).not.toContainText("%");
  });

  test("an appointed senator serves until the special election winner takes office", async ({
    page,
  }) => {
    await page.goto("/people/M001244");
    await expect(page.locator('[data-fact="term"]')).toHaveText(
      "Appointed; serves until the winner of the Nov 3, 2026 special election takes office",
    );
  });

  test("money names transfers and counts small-dollar contributions, not people", async ({
    page,
  }) => {
    await page.goto("/people/G000359");
    const money = page.locator('[data-fact="finance-summary"]');
    await expect(money).toContainText("arrived as transfers from joint fundraising");
    await expect(money).not.toContainText("largest source");
    await expect(money).not.toContainText("people giving");
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("sponsored measures merge under short plain titles", async ({ page }) => {
    await page.goto("/people/S000033");
    const sponsored = page.locator("section", { has: page.locator("#sponsored") });
    await expect(sponsored.getByRole("heading", { level: 3 })).toHaveText([
      "Block arms sales to Israel (6 resolutions)",
    ]);
    await expect(sponsored.locator('[data-fact="sponsored-measure"]')).toHaveCount(6);
    await expect(sponsored).not.toContainText("A joint resolution providing for");
  });

  test("a profile highlights no navigation tab", async ({ page }) => {
    await page.goto("/people/S000033");
    await waitForHydration(page);
    await expect(page.locator('nav[aria-label="Primary"] [aria-current]')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Main"] [aria-current]')).toHaveCount(0);
  });

  test("a representative with a 2026 FEC candidacy and a senator without one share one money name", async ({
    page,
  }) => {
    await page.goto("/people/P000197");
    await expect(
      page.getByRole("heading", { name: "Money, 2025–26 reporting period" }),
    ).toBeVisible();
    // An FEC filing is not ballot status: the note says what the FEC lists, and has its own Receipt.
    const filed = page.locator('[data-fact="fec-candidacy"]');
    await expect(filed).toHaveText(
      "The Federal Election Commission (FEC) lists Pelosi as a 2026 candidate. FEC filings do not show who won a primary or who dropped out, so check the Ballot page for who is on the November ballot.",
    );
    await expect(filed).toHaveAttribute("data-receipt-id", /^src_/);
    await expect(filed.getByRole("link", { name: "Ballot page" })).toHaveAttribute(
      "href",
      "/ballot",
    );
    await expect(page.locator("#main")).not.toContainText("filed as a candidate");
    await expectProvenance(page);
    await page.goto("/people/S000033");
    await expect(
      page.getByRole("heading", { name: "Money, 2025–26 reporting period" }),
    ).toBeVisible();
    const none = page.locator('[data-fact="fec-candidacy"]');
    await expect(none).toContainText(
      "The filings we hold from the Federal Election Commission (FEC) do not list Sanders as a 2026 candidate.",
    );
    await expect(none).toHaveAttribute("data-receipt-id", /^src_/);
    await expectProvenance(page);
  });

  test("key votes at 1440: the title has half the row, the receipt sits under it, and your answer is an oval", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedVoter(page, [
      ["kv-aca-extension", "Yea"],
      ["kv-obbba", "Nay"],
    ]);
    await page.goto("/people/S000033");
    // The compared votes come in two lists (where you differ, where you agree) under one group.
    const rows = page
      .getByRole("group", { name: "Votes compared with your answers" })
      .locator("li");
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      const title = await row.locator("p").first().boundingBox();
      const receipt = await row
        .getByRole("button", { name: /^Receipt: Senate roll call/ })
        .boundingBox();
      const cells = row.locator("> div").last().locator("> span");
      const member = await cells.nth(0).boundingBox();
      const you = await cells.nth(1).boundingBox();
      const width = (await row.boundingBox())!.width;
      expect(title!.width).toBeGreaterThanOrEqual(width * 0.5);
      // The receipt line is under the title and ends before the member's cell begins.
      expect(receipt!.y).toBeGreaterThan(title!.y);
      expect(receipt!.x + receipt!.width).toBeLessThan(member!.x);
      expect(member!.x + member!.width).toBeLessThanOrEqual(you!.x);
      // The voter's answer is a ballot oval (an SVG), never a Board Y/N square.
      await expect(cells.nth(1).locator("svg ellipse").first()).toBeAttached();
    }
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("your answers are marigold ovals with a 1.5px ink outline, and the page explains scores once", async ({
    page,
  }) => {
    await seedVoter(page, [
      ["kv-aca-extension", "Yea"],
      ["kv-obbba", "Nay"],
    ]);
    await page.goto("/people/S000033");
    const rows = page
      .getByRole("group", { name: "Votes compared with your answers" })
      .locator("li");
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      const mark = row.locator("> div").last().locator("> span").nth(1);
      const outline = mark.locator("svg > ellipse");
      await expect(outline).toHaveClass(/\bstroke-ink\b/);
      // Marigold means "you": the voter's own answer is filled marigold, always with its ink edge.
      await expect(mark.locator("svg circle")).toHaveClass(/\bfill-you-mark\b/);
      const [color, ink, width] = await outline.evaluate((node) => {
        const svg = (node as SVGEllipseElement).ownerSVGElement!;
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const probe = document.createElement("span");
        probe.className = "text-ink";
        document.body.append(probe);
        const inkColor = getComputedStyle(probe).color;
        probe.remove();
        return [
          getComputedStyle(node).stroke,
          inkColor,
          parseFloat(getComputedStyle(node).strokeWidth) * scale,
        ];
      });
      expect(color).toBe(ink);
      expect(width).toBeCloseTo(1.5, 1);
    }
    await expect(
      page.getByText(
        "Votes you care more about count more. When you share only a few votes, scores stay near 50%, so a lucky streak does not look like a perfect match.",
      ),
    ).toHaveCount(1);
    const method = page.getByRole("link", { name: "How scores work" });
    await expect(method).toHaveCount(1);
    await expect(method).toHaveAttribute("href", "/methodology#match");
  });

  test("the money river's target is the committee's name at every width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/people/S000033");
    // The share bar leads; the river waits behind its own disclosure.
    await page.getByText("See how the money flows").click();
    const river = page.locator('[data-fact="finance-summary"] [role="img"]');
    await expect(river).not.toContainText("The campaign");
    const committee = await page
      .locator('[data-fact="finance-summary"] > p')
      .last()
      .evaluate((node) => /Totals for (.+), filed with/.exec(node.textContent ?? "")?.[1] ?? "");
    expect(committee.length).toBeGreaterThan(0);
    await expect(river.getByText(committee, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(river.getByText(committee, { exact: true })).toBeVisible();
  });

  test("below 1024 the profile is one column: portrait and name, the match card, then key votes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await seedVoter(page, [["kv-aca-extension", "Yea"]]);
    await page.goto("/people/P000197");
    const name = page.getByRole("heading", { level: 1 });
    const nameBox = (await name.boundingBox())!;
    const lineHeight = parseFloat(await name.evaluate((node) => getComputedStyle(node).lineHeight));
    expect(nameBox.height).toBeLessThan(lineHeight * 1.5);
    const card = (await page.getByRole("complementary", { name: "Your match" }).boundingBox())!;
    const keyVotes = (await page.locator("#key-votes").boundingBox())!;
    expect(card.y).toBeGreaterThan(nameBox.y + nameBox.height);
    expect(card.y + card.height).toBeLessThan(keyVotes.y);
    expect(card.width).toBeGreaterThan(700);
  });

  test("money labels are at least 12px and the figures share a baseline", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/people/S000033");
    const money = page.locator('[data-fact="finance-summary"]');
    await page.getByText("See how the money flows").click();
    const sizes = await money
      .locator('[role="img"] p span')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => (node as HTMLElement).offsetParent !== null)
          .map((node) => parseFloat(getComputedStyle(node).fontSize)),
      );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    const bottoms = await money
      .locator("dl dd")
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().bottom)));
    expect(new Set(bottoms).size).toBe(1);
    await expect(
      page.getByRole("heading", { name: "Money, 2025–26 reporting period" }),
    ).toBeVisible();
    await expect(money.locator("summary", { hasText: "View as table" })).toHaveCSS(
      "height",
      "44px",
    );
  });

  test("the phone match bar leads with the vote count, then the score, and has no score oval", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "matched",
          stances: [
            {
              keyVoteId: "kv-aca-extension",
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
      );
    });
    await page.goto("/people/S000033");
    const bar = page.getByRole("complementary", { name: "Your match" });
    await expect(bar.getByText("2 of 2 votes").filter({ visible: true })).toBeVisible();
    await expect(bar.getByText(/^Match score \d+%/).filter({ visible: true })).toBeVisible();
    // Ovals mark answers, progress and agreement, never a score (round 10).
    await expect(bar.locator("svg ellipse").filter({ visible: true })).toHaveCount(0);
  });

  test("sponsored resolutions read as adopted, never 'Not law'", async ({ page }) => {
    await page.goto("/people/F000470");
    const sponsored = page.locator("section", { has: page.locator("#sponsored") });
    await expect(sponsored).toContainText("Adopted by the House");
    await expect(sponsored).not.toContainText("Motion to reconsider");
    await expect(sponsored).not.toContainText("Not law");
  });
});
