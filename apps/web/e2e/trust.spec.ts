import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  answer,
  chooseOption,
  expect,
  expectAccessible,
  expectProvenance,
  test,
  waitForHydration,
} from "./fixtures";

/** The changelog shows its newest 30 changes; the runs these tests look for may be older. */
async function showAllChanges(page: Page) {
  await waitForHydration(page);
  const older = page.getByRole("button", { name: /^Show \d+ older changes?$/ });
  if ((await older.count()) > 0) await older.click();
}

/** Trust pages, the election hub, and the voter's own data page. */

test.describe("methodology", () => {
  test("every anchor that method receipts link to exists", async ({ page }) => {
    await page.goto("/methodology");
    await expect(
      page.getByRole("heading", { level: 1, name: "How For The People works" }),
    ).toBeVisible();
    for (const anchor of ["match", "key-votes", "review", "voting-record", "money", "never"]) {
      await expect(page.locator(`#${anchor}`)).toHaveCount(1);
    }
    const receipt = await page.request.get("/api/receipts/method-match");
    const { href } = (await receipt.json()) as { href: string };
    expect(href).toBe("/methodology#match");
    await expect(page.locator("#match")).toContainText("score = (Σ w·agree + k·0.5) ÷ (Σ w + k)");
    await expect(page.locator("#match")).toContainText("= 70%");
  });

  test("the worked example can use the voter's own answers, off by default", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "swiping",
          stances: [
            {
              keyVoteId: "kv-laken-riley",
              choice: "Yea",
              weight: 3,
              answeredAt: "2026-09-23T15:00:00.000Z",
            },
            {
              keyVoteId: "kv-halt-fentanyl",
              choice: "Yea",
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
    let sent = false;
    page.on("request", (request) => {
      if (request.method() === "POST") sent = true;
    });
    await page.goto("/methodology");
    await waitForHydration(page);
    const example = page.locator("#match");
    const toggle = example.getByRole("switch", { name: "Use my answers" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(example).toContainText("Vote C");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(example).toContainText(/Your 2 answers compared with Sen\. /);
    await expect(example).not.toContainText("Vote C");
    await expect(example).toContainText(/score = \(\d+ \+ 2·0\.5\) ÷ \(\d+ \+ 2\) = .* = \d+%/);
    expect(await expectProvenance(page)).toBeGreaterThan(0);
    await expectAccessible(page);
    expect(sent).toBe(false);
  });
});

test.describe("changelog and status", () => {
  test("zero counts read in words, and repeated runs are listed once", async ({ page }) => {
    await page.goto("/changelog?show=updates");
    // The four terms belong to four members (traced from the run's UpsertTerm events), in plain words.
    await expect(
      page.getByText(
        "Updated the terms in office of 4 members of Congress from the public member list. No member was added, and no other details changed.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/member changes|term changes/)).toHaveCount(0);
    await expect(page.getByText(/Updated 0 /)).toHaveCount(0);
    await expect(page.getByText(/20 key votes published/)).toHaveCount(1);
  });

  test("key-vote changes lead, everything is one tap away, and a day's updates fold into one row", async ({
    page,
  }) => {
    await page.goto("/changelog");
    await showAllChanges(page);
    const show = page.getByRole("radiogroup", { name: "Show" });
    await expect(show.getByRole("radio", { name: "Key votes" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByText(/20 key votes published/)).toBeVisible();
    const folds = page.locator("li[data-kind=ingestion]");
    await expect(folds.first()).toBeHidden();

    await show.getByRole("radio", { name: "Everything" }).click();
    await expect(page).toHaveURL(/[?&]show=all/);
    // Each day's data updates are one row that opens to every update.
    const fold = page
      .locator("li[data-kind=ingestion]", { has: page.locator("[data-updates-toggle]") })
      .first();
    await expect(fold).toBeVisible();
    const runs = fold.locator("[data-run]");
    await expect(runs.first()).toBeHidden();
    const toggle = fold.getByRole("button", { name: /^Show the \d+ updates$/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(runs.first()).toBeVisible();
    await expect(fold.getByRole("button", { name: "Hide the updates" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    // The choice survives a reload, and every update is reachable under "Data updates".
    await page.reload();
    await waitForHydration(page);
    await expect(show.getByRole("radio", { name: "Everything" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await show.getByRole("radio", { name: "Data updates" }).click();
    await expect(page).toHaveURL(/[?&]show=updates/);
    await showAllChanges(page);
    const every = page.locator("[data-run]");
    const total = await every.count();
    expect(total).toBeGreaterThan(1);
    for (let index = 0; index < total; index++) await expect(every.nth(index)).toBeVisible();
    await expect(page.locator("[data-updates-toggle]").filter({ visible: true })).toHaveCount(0);
  });

  test("disclosures turn their chevron, and the rail indexes the months at 1440", async ({
    page,
  }, info) => {
    await page.goto("/changelog");
    await showAllChanges(page);
    await waitForHydration(page);
    const batch = page.locator("details", { hasText: "Show the 20 key votes" }).first();
    const chevron = batch.locator(":scope > summary svg");
    // Tailwind 4 turns it with the `rotate` property, not `transform`.
    const turn = () => chevron.evaluate((icon) => getComputedStyle(icon).rotate);
    expect(await turn()).toBe("none");
    await batch.getByText("Show the 20 key votes").click();
    await expect(batch.getByText("Hide the key votes")).toBeVisible();
    await expect.poll(turn).not.toBe("none");
    const index = page.getByRole("navigation", { name: "By month" });
    if (info.project.name === "desktop") {
      await expect(index.getByRole("link", { name: "September 2026" })).toBeVisible();
      await page.getByRole("radio", { name: "Data updates" }).click();
      await expect(page.getByRole("status").filter({ hasText: /data updates?$/ })).toBeVisible();
    } else await expect(index).toBeHidden();
  });

  test("each update shows its recent runs, oldest first", async ({ page }) => {
    await page.goto("/status");
    const strips = page.getByRole("list", { name: /runs?( so far)?, oldest first$/ });
    await expect(strips).toHaveCount(7);
    await expect(strips.first().getByRole("listitem").first()).toContainText(/finished|stopped/);
    // Runs are small ink squares: ovals and the agree and split colors mean something else.
    const marks = strips.getByRole("listitem");
    for (const mark of await marks.all()) {
      const radius = await mark.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).borderTopLeftRadius),
      );
      expect(radius).toBeLessThanOrEqual(2);
    }
    await expect(page.locator('main [class*="agree"], main [class*="danger"]')).toHaveCount(0);
  });

  test("Status, Home, and the changelog give one roll-call count", async ({ page }) => {
    await page.goto("/status");
    const held = page
      .locator("dt", { hasText: /^Roll calls$/ })
      .locator("xpath=following-sibling::dd[1]");
    const read = page.getByRole("row", { name: /^Roll calls read/ }).getByRole("cell");
    const count = (await held.textContent())!.trim();
    await expect(read).toHaveText(count);
    // The votes job now removes a quorum call an earlier parser stored, so none is set aside.
    // (The latest votes run still lists the quorum calls it skipped, in its own notes.)
    await expect(page.getByText(/not counting .*quorum call/)).toHaveCount(0);
    await page.goto("/");
    // Home says the count in running text, beside a figure with one square per roll call per chamber.
    await expect(page.locator('[data-fact="roll-call-count"]')).toHaveText(`${count} roll calls`);
    const byChamber = await page
      .locator('[data-fact="house-roll-calls"], [data-fact="senate-roll-calls"]')
      .allTextContents()
      .then((texts) => texts.map((text) => Number(text.replace(/\D/g, ""))));
    expect(byChamber).toHaveLength(2);
    expect(byChamber[0]! + byChamber[1]!).toBe(Number(count.replace(/\D/g, "")));
    expect(await expectProvenance(page)).toBeGreaterThan(0);
    await page.goto("/changelog?show=updates");
    await showAllChanges(page);
    await expect(page.getByText(`Read ${count} roll calls`).first()).toBeVisible();
    await expect(
      page.getByText(/17 members show initials: 16 have no official portrait/),
    ).toBeVisible();
  });

  test("runs of one update minutes apart share a row, and the rail says what it counts", async ({
    page,
  }, info) => {
    await page.goto("/changelog?show=updates");
    await showAllChanges(page);
    // The snapshot's stats runs: two on Sep 23 two minutes apart, each right after a roll-call read, so
    // they sit in that read's row (one row, the two reads sharing it); one at 12:25 AM on Sep 24 after
    // a legislators run, on its own row and saying what it followed; and the 4:40 AM run, in the row
    // of the read it followed.
    const members = "555 members, including 16 who left this Congress,";
    await expect(
      page.getByText(
        `After the member update, recounted how often ${members} voted with their party or missed a vote.`,
        { exact: true },
      ),
    ).toHaveCount(1);
    await expect(
      page
        .getByText(`Then recounted how often ${members} voted with their party or missed a vote.`)
        .filter({ visible: true }),
    ).toHaveCount(2);
    await expect(page.getByText(/^Ran twice between/).first()).toBeVisible();
    // Every row of repeated runs opens to its runs, whether they found the same thing or not.
    const repeated = page.locator("[data-run]", {
      hasText: /Ran (twice|\d+ times) between/,
    });
    const counts = await repeated.evaluateAll((rows) =>
      rows.map((row) => {
        const ran = /Ran (twice|(\d+) times) between/.exec(row.textContent ?? "")!;
        return { runs: ran[2] ? Number(ran[2]) : 2, text: row.textContent ?? "" };
      }),
    );
    expect(counts.length).toBeGreaterThanOrEqual(2);
    expect(counts.some(({ text }) => text.includes("with the same result each time"))).toBe(true);
    for (const { runs, text } of counts) expect(text).toContain(`Show all ${runs} runs`);
    if (info.project.name === "desktop") {
      const days = page.getByRole("navigation", { name: "By month" }).getByRole("link", {
        name: /^Sep \d+/,
      });
      for (const day of await days.all()) await expect(day).toHaveText(/\d+ changes?$/);
    }
  });

  test("receipt addresses are one line, cut in the middle, and whole for screen readers", async ({
    page,
  }) => {
    await page.goto("/sources");
    const links = page.getByRole("link", { name: /latest receipt/ });
    expect(await links.count()).toBeGreaterThan(3);
    for (const link of await links.all()) {
      const full = (await link.getAttribute("title"))!;
      await expect(link).toHaveAccessibleName(
        new RegExp(`^${full.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
      const shown = link.locator("[aria-hidden]").first();
      expect((await shown.textContent())!.length).toBeLessThanOrEqual(48);
      // Cut once, in the middle: the line itself is never clipped again at the end.
      expect(await shown.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      const box = await link.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(44);
    }
  });
});

test.describe("corrections", () => {
  test.beforeEach(async ({ page }) => {
    // A fresh address per test, so repeated runs never hit the per-connection limit.
    const octet = () => Math.floor(Math.random() * 250) + 1;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.${octet()}.${octet()}`,
    });
  });

  test("a valid report is sent and confirmed", async ({ page }) => {
    await page.goto("/corrections");
    await waitForHydration(page);
    await chooseOption(
      page,
      "What is the mistake about? (required)",
      "A member of Congress or a candidate",
    );
    await page.getByLabel("Which page or record?").fill("/people/A000370");
    await page.getByLabel(/Which detail is wrong/).fill("party");
    await page
      .getByLabel("What should it say?")
      .fill("The party tag does not match the House Clerk roster for this member.");
    const request = page.waitForResponse("**/api/corrections");
    await page.getByRole("button", { name: "Send report" }).click();
    expect((await request).status()).toBe(201);
    await expect(page.getByText("Report sent", { exact: true })).toBeVisible();
    await expect(page.getByLabel("What should it say?")).toHaveValue("");
  });

  test("a short report shows what to fix and sends nothing", async ({ page }) => {
    await page.goto("/corrections");
    let posted = false;
    page.on("request", (request) => {
      if (request.url().includes("/api/corrections")) posted = true;
    });
    await waitForHydration(page);
    await chooseOption(page, "What is the mistake about? (required)", "A bill");
    await page.getByLabel("Which page or record?").fill("/bills/119-hr-1");
    await page.getByLabel("What should it say?").fill("Wrong");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText(/Write at least 10 characters/)).toBeVisible();
    await expect(page.getByLabel("What should it say?")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("What should it say?")).toBeFocused();
    expect(posted).toBe(false);
  });

  test("a report link names the page it came from, and nothing else is echoed", async ({
    page,
  }) => {
    await page.goto("/people/S000033");
    await page.getByRole("contentinfo").getByRole("link", { name: "Report a mistake" }).click();
    await expect(page).toHaveURL(/\/corrections\?record=%2Fpeople%2FS000033$/);
    // The named record shows as a chip: the member's portrait and name, with a way to remove it.
    const chip = page.getByRole("group", { name: /Which page or record\?/ });
    await expect(chip).toContainText("Bernard Sanders");
    await expect(chip).toContainText("U.S. Senator, Vermont");
    await expect(chip.locator('[data-fact="portrait"]')).toBeVisible();
    await expect(page.getByLabel("What is the mistake about? (required)")).toHaveText(
      "A member of Congress or a candidate",
    );
    await expect(
      page.getByText("Filled in from the page you came from.", { exact: false }),
    ).toBeVisible();
    await waitForHydration(page);
    await chip.getByRole("button", { name: "Remove Bernard Sanders" }).click();
    await expect(chip).toHaveCount(0);
    await expect(page.getByLabel("Which page or record?")).toHaveValue("");
    await expect(page.getByLabel("Which page or record?")).toBeFocused();

    // A bill is named by its number and title.
    await page.goto(`/corrections?record=${encodeURIComponent("/bills/119-hr-1")}`);
    const bill = page.getByRole("group", { name: /Which page or record\?/ });
    await expect(bill).toContainText("H.R. 1");
    await expect(bill.getByRole("button", { name: /^Remove / })).toBeVisible();
    await expectAccessible(page);
    expect(await expectProvenance(page)).toBeGreaterThan(0);

    // A fixed page is named by its own title, never by the path in the link.
    await page.goto(`/corrections?record=${encodeURIComponent("/election")}`);
    const election = page.getByRole("group", { name: /Which page or record\?/ });
    await expect(election).toContainText("Election Day 2026");
    await expect(election).not.toContainText("/election");

    // Crafted or unresolved paths (R2-L1): no chip, an empty field, and no path echoed anywhere.
    for (const record of [
      "//evil.example/people",
      "javascript:alert(1)",
      "/people/<b>x</b>",
      "/Senator-Jane-Doe-voted-to-cut-Social-Security",
      "/people/Senator-Jane-Doe-voted-to-cut-Social-Security",
      "/people/Z999999",
      "/bills/119-hr-99999",
      "/people/../bills/119-hr-1",
      "/./election",
    ]) {
      await page.goto(`/corrections?record=${encodeURIComponent(record)}`);
      await waitForHydration(page);
      await expect(page.getByLabel("Which page or record?")).toHaveValue("");
      await expect(page.getByRole("group", { name: /Which page or record\?/ })).toHaveCount(0);
      await expect(page.getByText("Filled in from the page you came from.")).toHaveCount(0);
      await expect(page.getByText("voted-to-cut", { exact: false })).toHaveCount(0);
      await expect(page.locator("b")).toHaveCount(0);
    }
  });

  test("a report sent with a record chip names that record", async ({ page }) => {
    await page.goto(`/corrections?record=${encodeURIComponent("/people/S000033")}`);
    await waitForHydration(page);
    await page
      .getByLabel("What should it say?")
      .fill("The office line does not match the Senate roster for this member.");
    const request = page.waitForRequest("**/api/corrections");
    await page.getByRole("button", { name: "Send report" }).click();
    expect((await request).postDataJSON()).toMatchObject({
      target: { kind: "person", id: "/people/S000033" },
    });
  });

  test("the API rejects invalid input on its own", async ({ page }) => {
    const response = await page.request.post("/api/corrections", {
      data: { target: { kind: "donor", id: "x", field: null }, report: "short" },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("election hub", () => {
  test("counts down to Election Day and offers the calendar file", async ({ page }) => {
    await page.goto("/election");
    await expect(page.getByText("41 days until Election Day")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Add Election Day to calendar" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("election-day-2026.ics");
    const ics = await readFile((await file.path())!, "utf8");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261103");
    expect(ics).toContain("END:VCALENDAR");
  });

  test("the state picker shows official deadlines with receipts", async ({ page }) => {
    await page.goto("/election");
    // Retried because a change made before hydration finishes is replaced by React's first render.
    await waitForHydration(page);
    await chooseOption(page, "Your state", "Florida");
    await expect(page).toHaveURL(/[?&]state=FL/);
    const card = page.getByRole("article", { name: "Florida" });
    await expect(card.getByText("29 days before Election Day").first()).toBeVisible();
    await expect(card.getByRole("link", { name: /Check your registration/ })).toHaveAttribute(
      "href",
      /^https:\/\/registration\.elections\.myflorida\.com\//,
    );
    await expect(card.getByText(/Check your state's election office/)).toBeVisible();

    // The countdown card: when to register, in vote.gov's words, on a line from today to Election Day,
    // and the page's one ink button goes to Florida's own registration lookup.
    const top = page.locator("#election-card");
    await expect(top.getByText("Register in Florida by")).toBeVisible();
    await expect(top.locator('[data-fact="registration-deadline"]')).toHaveText(
      "29 days before Election Day, online or in person",
    );
    const line = top.getByRole("list", { name: "From today to Election Day" });
    await expect(line.getByRole("listitem")).toHaveText([
      /^TodayYou are here$/,
      /^Register by29 days before$/,
      /^Election DayNov 3$/,
    ]);
    const check = top.getByRole("link", { name: /^Check your registration/ });
    await expect(check).toHaveAttribute(
      "href",
      /^https:\/\/registration\.elections\.myflorida\.com\//,
    );
    expect(await expectProvenance(page)).toBeGreaterThan(0);
  });

  test("the calendar link is outlined at every width, and the closing link is underlined in ink", async ({
    page,
  }) => {
    await page.goto("/election");
    await waitForHydration(page);
    // "Add Election Day to calendar" is the secondary action: an outline, never a second ink button.
    const calendar = page.getByRole("link", { name: "Add Election Day to calendar" });
    const check = page.getByRole("link", { name: /^Check your registration \(opens/ });
    const fill = (link: typeof calendar) =>
      link.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(await fill(calendar)).not.toBe(await fill(check));
    const outline = () =>
      calendar.evaluate((link) => {
        const style = getComputedStyle(link);
        return { border: style.borderTopWidth, radius: style.borderTopLeftRadius };
      });
    const wide = await outline();
    expect(Number.parseFloat(wide.border)).toBeGreaterThanOrEqual(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await outline()).toEqual(wide);
    const next = page.getByRole("link", { name: /^(See your matches|Answer key votes)/ });
    const line = await next.evaluate((link) => {
      const style = getComputedStyle(link);
      return { line: style.textDecorationLine, color: style.textDecorationColor, ink: style.color };
    });
    expect(line.line).toBe("underline");
    expect(line.color).toBe(line.ink);
  });

  test("the key dates link puts focus on the state picker, ready for the keyboard", async ({
    page,
  }) => {
    await page.goto("/election");
    await waitForHydration(page);
    // Keyboard only, as a keyboard user would: activate the link, then choose by typing.
    await page.getByRole("link", { name: "Choose your state" }).focus();
    await page.keyboard.press("Enter");
    const picker = page.getByRole("combobox", { name: "Your state" });
    await expect(picker).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Alabama" })).toBeFocused();
    await page.keyboard.type("Flo");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]state=FL/);
    await expect(picker).toHaveText("Florida");
  });

  test("a saved state shows its next registration deadline", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "new",
          stances: [],
          location: {
            state: "FL",
            districts: [],
            ballotDistrictConfirmed: false,
            setAt: "2026-09-23T15:00:00.000Z",
            method: "manual",
          },
          ballotPlan: null,
          following: [],
        }),
      );
    });
    await page.goto("/election");
    await expect(page.getByText("Register in Florida by")).toBeVisible();
    await expect(page.locator('header [data-fact="registration-deadline"]')).toHaveText(
      "29 days before Election Day, online or in person",
    );
    await expect(page.getByRole("combobox", { name: "Your state" })).toHaveText("Florida");
  });

  test("a voter with answers is sent to their matches, not asked to answer a few votes", async ({
    page,
  }) => {
    // The server renders the first-visit wording; it must match the first client render.
    const html = await (await page.request.get("/election")).text();
    expect(html).toContain("Answer a few real votes");
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "swiping",
          stances: [
            {
              keyVoteId: "kv-laken-riley",
              choice: "Yea",
              weight: 3,
              answeredAt: "2026-09-23T15:00:00.000Z",
            },
            {
              keyVoteId: "kv-save-act",
              choice: "Nay",
              weight: 2,
              answeredAt: "2026-09-23T15:01:00.000Z",
            },
            {
              keyVoteId: "kv-obbba",
              choice: "Skip",
              weight: 1,
              answeredAt: "2026-09-23T15:02:00.000Z",
            },
          ],
          location: null,
          ballotPlan: null,
          following: [],
        }),
      );
    });
    await page.goto("/election");
    await waitForHydration(page);
    const section = page.getByRole("region", { name: "See who votes like you" });
    await expect(section.getByRole("link", { name: "See your matches" })).toHaveAttribute(
      "href",
      "/matches",
    );
    // A skip is not an answer.
    await expect(section).toContainText("matched to your 2 answers");
    await expect(section).not.toContainText("Answer a few");
    await expect(section.getByRole("link", { name: "Answer key votes" })).toHaveCount(0);
    expect(errors.filter((text) => /hydrat/i.test(text))).toEqual([]);
  });

  test("one ink button: the closing next step is a text link", async ({ page }) => {
    await page.goto("/election");
    await waitForHydration(page);
    const next = page.getByRole("link", { name: "Answer key votes" });
    await expect(next).toHaveAttribute("href", "/swipe");
    await expect(next).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(next).toHaveCSS("text-decoration-line", "underline");
  });
});

test.describe("your data", () => {
  test("change an answer, then clear everything", async ({ page }) => {
    await page.goto("/swipe");
    await waitForHydration(page);
    await answer(page, "Yea");
    await expect(page.getByText(/^1 of \d+ answered$/)).toBeVisible();

    await page.goto("/you");
    await expect(page.getByText(/1 of \d+ key votes answered/)).toBeVisible();
    // Each row is a summary; its controls open in place under Edit.
    const row = page.locator("[data-flip]").first();
    await expect(row).toContainText("Matters: Some");
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    const edit = page.getByRole("button", { name: /^Edit your answer on / });
    await expect(edit).toHaveAttribute("aria-expanded", "false");
    await edit.click();
    await expect(
      page.getByRole("button", { name: /^Done editing your answer on / }),
    ).toHaveAttribute("aria-expanded", "true");
    // The answer date is in the row's name, not repeated on screen under every title.
    await expect(page.getByRole("radiogroup").first()).toHaveAccessibleName(
      /, answered [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    );
    // Any element that sets "answered <date>" as its own text is the 1 px screen-reader span only.
    const shownDates = await page.locator("[data-flip] *").evaluateAll(
      (elements) =>
        elements.filter(
          (element) =>
            element.getBoundingClientRect().width > 1 &&
            /answered [A-Z]/.test(
              [...element.childNodes]
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent)
                .join(""),
            ),
        ).length,
    );
    expect(shownDates).toBe(0);
    await page.getByText("Nay", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Nay" })).toBeChecked();

    await page.getByRole("button", { name: /^Clear answer on / }).click();
    await expect(page.getByText("You have not answered any key votes yet.")).toBeVisible();
    await expect(page.getByText("Answer cleared")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText(/1 of \d+ key votes answered/)).toBeVisible();
    await expect(page.locator("[data-flip]").first()).toContainText("Nay");
    await page.getByRole("button", { name: /^Edit your answer on / }).click();
    await expect(page.getByRole("radio", { name: "Nay" })).toBeChecked();

    // What the service worker would have cached for this voter's districts (R2-L4).
    await page.evaluate(async () => {
      const runtime = await caches.open("for-the-people-runtime-v1");
      await runtime.put("/api/ballot?districts=TX-7%40cd120", new Response("{}"));
      const shell = await caches.open("for-the-people-shell-v1");
      await shell.put("/ballot/cheat-sheet", new Response("<html></html>"));
    });

    const clearAll = page.getByRole("button", { name: "Clear all my data" });
    // Quiet at rest: an underlined link in the text color, not a red button.
    await expect(clearAll).toHaveCSS("text-decoration-line", "underline");
    await expect(clearAll).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await clearAll.click();
    const dialog = page.getByRole("dialog", { name: "Clear all your data?" });
    // The confirmation says what is lost, counting the answers.
    await expect(dialog).toContainText("This removes your 1 answer,");
    await dialog.getByRole("button", { name: "Clear everything" }).click();
    await expect(page.getByText("You have not answered any key votes yet.")).toBeVisible();
    const stored = await page.evaluate(() => window.localStorage.getItem("for-the-people.voter"));
    expect(stored === null || JSON.parse(stored).stances.length === 0).toBe(true);
    await expect
      .poll(() => page.evaluate(() => caches.has("for-the-people-runtime-v1")))
      .toBe(false);
    // The offline cheat sheet's page shell holds nothing about the voter and stays.
    expect(await page.evaluate(() => caches.has("for-the-people-shell-v1"))).toBe(true);
  });
});

test.describe("accessibility and provenance", () => {
  for (const path of [
    "/methodology",
    "/sources",
    "/corrections",
    "/changelog",
    "/status",
    "/election?state=ND",
    "/you",
  ]) {
    test(`${path} passes axe and every fact has a receipt`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
      await expectProvenance(page);
    });
  }
});

test.describe("not found", () => {
  test("an unknown address or member shows the not-found page with a way back", async ({
    page,
  }) => {
    for (const path of ["/no-such-page", "/people/nobody-X000000"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Nothing on the record here",
      );
      await expect(page.getByRole("link", { name: "Find a member" })).toHaveAttribute(
        "href",
        "/explore",
      );
      // No oval as decoration: ovals keep their four roles (BRIEF 8.2), and a slash means "split".
      const page404 = page.locator("section", { has: page.getByRole("heading", { level: 1 }) });
      await expect(page404.locator("svg ellipse")).toHaveCount(0);
    }
    await expectAccessible(page);
  });
});
