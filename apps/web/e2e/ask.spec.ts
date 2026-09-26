import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectProvenance, test } from "./fixtures";

/** Ask For The People, answered by the demo model when no API key is set. */

const STANCES = [
  { keyVoteId: "kv-laken-riley", choice: "Yea", weight: 3, answeredAt: "2026-09-23T15:00:00.000Z" },
  { keyVoteId: "kv-save-act", choice: "Nay", weight: 2, answeredAt: "2026-09-23T15:01:00.000Z" },
];

const TEXAS = {
  state: "TX",
  districts: ["TX-37@cd119", "TX-10@cd120"],
  ballotDistrictConfirmed: true,
  setAt: "2026-09-23T15:30:00.000Z",
  method: "census-geocoder",
};

async function seedAnswers(page: Page, location: typeof TEXAS | null = null) {
  await page.addInitScript(
    ({ stances, location }) => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "swiping",
          stances,
          location,
          ballotPlan: null,
          following: [],
        }),
      );
    },
    { stances: STANCES, location },
  );
}

async function openAsk(page: Page, path = "/ask") {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Ask For The People" })).toBeVisible();
}

test.describe("Ask For The People", () => {
  test.beforeEach(async ({ page }) => {
    // A fresh address per test, so the suite never trips Ask's per-visitor limit on a rerun.
    const octet = () => Math.floor(Math.random() * 250) + 1;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${octet()}.${octet()}` });
  });

  test("a suggested question answers with a vote card and its receipt", async ({ page }) => {
    await openAsk(page);
    await expect(page.getByText("Demo answers.")).toBeVisible();
    await page.getByRole("button", { name: "Ted Cruz's votes on tariffs?" }).click();

    const log = page.getByRole("log", { name: "Conversation" });
    await expect(log.getByText(/Ted Cruz voted Nay on .*tariffs on Canada/)).toBeVisible();
    await expect(
      log.getByRole("heading", { name: "Key votes on trade and tariffs" }),
    ).toBeVisible();
    await expect(log.getByRole("link", { name: /Ted Cruz/ })).toBeVisible();

    await log.getByRole("button", { name: /Voted Nay.*Senate roll call 160/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Receipt" })).toBeVisible();
    await expect(sheet.getByText("Verified from the official record")).toBeVisible();
    await expect(sheet.getByRole("link", { name: /View the official record/ })).toHaveAttribute(
      "href",
      /^https:\/\/www\.senate\.gov\//,
    );
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    expect(await expectProvenance(page)).toBeGreaterThan(0);
    await expectAccessible(page);
  });

  test("refuses to recommend a candidate and offers the match tools", async ({ page }) => {
    await openAsk(page);
    await page.getByLabel("Your question").fill("Who should I vote for?");
    await page.keyboard.press("Enter");
    const answer = page.getByRole("log").getByText(/I can't recommend candidates/);
    await expect(answer).toBeVisible();
    await expect(answer).toContainText("Swipe page");
    await expect(page.getByRole("log").locator("section")).toHaveCount(0);
    await expect(page.getByRole("log")).not.toContainText(/you should vote for/i);
  });

  test("a comparison of two members opens in Vote Duel", async ({ page }) => {
    await openAsk(page);
    await page.getByLabel("Your question").fill("Compare Fetterman and Murkowski");
    await page.keyboard.press("Enter");
    const log = page.getByRole("log", { name: "Conversation" });
    await expect(log.getByRole("heading", { name: "Side by side" })).toBeVisible();
    await expect(log.getByRole("link", { name: "Open in Vote Duel" })).toHaveAttribute(
      "href",
      "/duel?a=F000479&b=M001153",
    );
  });

  test("stances are sent only when Use my answers is on, for that question only", async ({
    page,
  }) => {
    await seedAnswers(page);
    await openAsk(page);
    const toggle = page.getByRole("switch", { name: "Use my 2 answers" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    // The switch sits under the field, beside the line that says what it sends; the Ask button is a
    // 44 px target with a visible edge even before anything is typed.
    const field = page.getByLabel("Your question");
    const fieldBox = (await field.boundingBox())!;
    expect((await toggle.boundingBox())!.y).toBeGreaterThan(fieldBox.y + fieldBox.height);
    const send = page.getByRole("button", { name: "Ask", exact: true });
    const sendBox = (await send.boundingBox())!;
    expect(Math.round(sendBox.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(sendBox.height)).toBeGreaterThanOrEqual(44);
    expect(await send.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("1px");
    // Asking with nothing typed sends nothing and puts the cursor where the question goes.
    let sentEmpty = false;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/ask")) sentEmpty = true;
    });
    await send.click();
    await expect(field).toBeFocused();
    expect(sentEmpty).toBe(false);
    page.removeAllListeners("request");

    const first = page.waitForRequest((request) => request.url().endsWith("/api/ask"));
    await page.getByLabel("Your question").fill("How did Ted Cruz vote on tariffs?");
    await page.keyboard.press("Enter");
    expect((await first).postDataJSON().stances).toBeUndefined();
    await expect(page.getByRole("log").getByText(/Ted Cruz voted Nay/)).toBeVisible();

    await toggle.click();
    await expect(page.getByText("Sends your 2 answers with this question only.")).toBeVisible();
    const second = page.waitForRequest((request) => request.url().endsWith("/api/ask"));
    await page.getByLabel("Your question").fill("Tell me about John Cornyn");
    await page.keyboard.press("Enter");
    expect((await second).postDataJSON().stances).toHaveLength(2);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(
      page.getByRole("log").getByText(/John Cornyn is a U\.S\. Senator from Texas/),
    ).toBeVisible();
  });

  test("a member's votes lead with a summary, and the match shows only with Use my answers", async ({
    page,
  }) => {
    await seedAnswers(page);
    await openAsk(page);
    const log = page.getByRole("log", { name: "Conversation" });

    await page.getByLabel("Your question").fill("How has Ted Cruz voted?");
    await page.keyboard.press("Enter");
    await expect(
      log.getByRole("heading", { level: 2, name: /How has Ted Cruz voted\?/ }),
    ).toBeVisible();
    await expect(
      log.getByText(
        /^Ted Cruz voted Yea on \d+ and Nay on \d+ of the \d+ key votes held in the Senate; the other \d+ have only a House roll call\.$/,
      ),
    ).toBeVisible();
    // Key votes with only a House roll call fold into one closed group, counted like the sentence above.
    const lead = await log.getByText(/the other \d+ have only a House roll call/).textContent();
    const other = lead!.match(/the other (\d+) have/)![1]!;
    const group = log.locator("details", {
      has: page.getByText(`${other} key votes have only a House roll call`, { exact: true }),
    });
    await expect(group).not.toHaveAttribute("open");
    await group.getByText(`${other} key votes have only a House roll call`).click();
    // Opened, each is a chip with that roll call as its receipt, never "did not vote", which means a
    // Not Voting position.
    const houseOnly = group.locator("button[data-fact='roll-call']", {
      hasText: "House vote only",
    });
    await expect(houseOnly).toHaveCount(Number(other));
    await expect(houseOnly.first()).toBeVisible();
    await expect(houseOnly.first()).toHaveAttribute("data-receipt-id", /.+/);
    await expect(houseOnly.first()).not.toContainText(/did not vote/i);
    // Once answered, the page title steps down to a small label and the question leads the page.
    const title = page.getByRole("heading", { level: 1, name: "Ask For The People" });
    const question = log.getByRole("heading", { level: 2 }).first();
    const size = (node: Element) => Number.parseFloat(getComputedStyle(node).fontSize);
    expect(await question.evaluate(size)).toBeGreaterThan(await title.evaluate(size));
    await expect(log.locator('[data-fact="match"]')).toHaveCount(0);
    await expect(log).not.toContainText(/agree with you/);

    // The Board cells sit in one right-aligned column, whatever the vote's word.
    const cells = log.locator("button[data-fact='roll-call'] [data-position-cell]");
    const edges = await cells.evaluateAll((spans) =>
      spans.map((span) => Math.round(span.getBoundingClientRect().right)),
    );
    expect(edges.length).toBeGreaterThan(1);
    expect(new Set(edges).size).toBe(1);
    const widths = await cells.evaluateAll((spans) =>
      spans.map((span) => Math.round(span.getBoundingClientRect().width)),
    );
    expect(new Set(widths)).toEqual(new Set([24]));

    await page.getByRole("switch", { name: "Use my 2 answers" }).click();
    await page.getByLabel("Your question").fill("How has John Cornyn voted?");
    await page.keyboard.press("Enter");
    await expect(
      log.getByText(/They agree with you on \d+ of \d+ key votes where you both took a side\./),
    ).toBeVisible();
    await expect(log.locator('[data-fact="match"]')).toHaveCount(1);
    expect(await expectProvenance(page)).toBeGreaterThan(0);
    await expectAccessible(page);
  });

  test("the empty state leads with the voter's own senator, worked out on the device", async ({
    page,
  }) => {
    await seedAnswers(page, TEXAS);
    await openAsk(page);
    await expect(page.getByRole("switch", { name: "Use my 2 answers" })).toBeVisible();

    const rows = page.getByRole("region", { name: "Try a question" }).getByRole("button");
    await expect(rows.first()).toHaveAccessibleName(/^How has John Cornyn voted\?/);
    await expect(rows.first()).toContainText("Your senator");
    const questions = await rows.evaluateAll((buttons) =>
      buttons.map((button) => button.querySelector("[data-question]")?.textContent?.trim() ?? ""),
    );
    for (const question of questions) expect(question.length).toBeLessThanOrEqual(34);

    // The one live region is on the page before anything is asked, and is never replaced.
    const status = page.locator("[data-ask-status]");
    await expect(status).toHaveAttribute("role", "status");
    const handle = await status.elementHandle();

    const request = page.waitForRequest((sent) => sent.url().endsWith("/api/ask"));
    await rows.first().click();
    const body = (await request).postDataJSON();
    expect(body.stances).toBeUndefined();
    expect(body.districtIds).toEqual(TEXAS.districts);
    expect(JSON.stringify(body)).not.toContain('"state"');
    await expect(status).toContainText("For The People answered.");
    expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
  });

  test("with no answers on the device there is no answers switch", async ({ page }) => {
    await openAsk(page);
    // Bills are asked about by name, with the number under the question.
    const save = page.getByRole("button", { name: /^What is the SAVE Act\?/ });
    await expect(save).toBeVisible();
    await expect(save).toContainText("H.R. 22");
    await expect(
      page.getByRole("button", { name: /^What is the Ukraine Support Act\?/ }),
    ).toContainText("H.R. 2913");
    await expect(
      page.getByRole("button", { name: "Chuck Schumer's votes on Iran?" }),
    ).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("a bill suggestion is answered from that bill's record", async ({ page }) => {
    await openAsk(page);
    await page.getByRole("button", { name: /^What is the Ukraine Support Act\?/ }).click();
    const log = page.getByRole("log", { name: "Conversation" });
    await expect(log.getByText(/H\.R\. 2913, Ukraine Support Act,/)).toBeVisible();
    expect(await expectProvenance(page)).toBeGreaterThan(0);
  });

  test("a question that fails to send stays in the box, ready to try again", async ({ page }) => {
    await openAsk(page);
    await page.route("**/api/ask", (route) => route.abort("failed"), { times: 1 });
    await page.getByLabel("Your question").fill("How has Susan Collins voted?");
    await page.keyboard.press("Enter");
    // Next.js keeps its own empty route announcer as an alert; this is the one with words in it.
    const alert = page.getByRole("alert").filter({ hasText: "could not be sent" });
    await expect(alert).toContainText("Check your connection and try again.");
    await expect(page.getByLabel("Your question")).toHaveValue("How has Susan Collins voted?");
    // Nothing is shown twice when it is sent again.
    await alert.getByRole("button", { name: "Try again" }).click();
    const log = page.getByRole("log", { name: "Conversation" });
    await expect(log.getByText(/Susan Collins/).first()).toBeVisible();
    await expect(
      log.getByRole("heading", { level: 2, name: /How has Susan Collins voted\?/ }),
    ).toHaveCount(1);
    await expect(alert).toHaveCount(0);
  });

  test("an Ask about link prefills the question", async ({ page }) => {
    await openAsk(page, `/ask?q=${encodeURIComponent("How has Susan Collins voted?")}`);
    await expect(page.getByLabel("Your question")).toHaveValue("How has Susan Collins voted?");
  });

  test("the empty page passes axe and provenance", async ({ page }) => {
    await openAsk(page);
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("the API rejects malformed questions", async ({ request }) => {
    const bad = await request.post("/api/ask", {
      data: {
        messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "x" }] }],
        districtIds: ["123 Main St"],
      },
    });
    expect(bad.status()).toBe(400);
    const empty = await request.post("/api/ask", { data: { messages: [] } });
    expect(empty.status()).toBe(400);
  });
});
