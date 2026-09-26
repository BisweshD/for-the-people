import type { BrowserContext, Page } from "@playwright/test";
import { expect, expectAccessible, expectProvenance, test } from "./fixtures";

// Route the service worker's own requests too, so "offline" also cuts the worker off from the network.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

/**
 * My Ballot: address, districts, races, plan, and the offline cheat sheet. /api/location is mocked here
 * (the Census geocoder is never called from tests); the ballot itself comes from our own API and DB.
 */

const TEXAS = {
  state: "TX",
  districts: ["TX-37@cd119", "TX-10@cd120"],
  ballotDistrictConfirmed: true,
  method: "census-geocoder",
};
const COLORADO = {
  state: "CO",
  districts: ["CO-1@cd119", "CO-1@cd120"],
  ballotDistrictConfirmed: true,
  method: "census-geocoder",
};
const MISSOURI = {
  state: "MO",
  districts: ["MO-3@cd119", "MO-5@cd120", "MO-3@cd120"],
  ballotDistrictConfirmed: false,
  method: "census-geocoder",
};

async function mockLocation(page: Page, response: object) {
  const bodies: unknown[] = [];
  await page.route("**/api/location", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: response });
  });
  return bodies;
}

async function findBallot(page: Page, address: string) {
  await page.goto("/ballot");
  await expect(
    page.getByRole("heading", { level: 1, name: "Find your 2026 ballot" }),
  ).toBeVisible();
  await expect(page.getByText(/U\.S\. Census Bureau's address lookup/)).toBeVisible();
  await page.getByLabel("Your home address").fill(address);
  await page.getByRole("button", { name: "Find my ballot" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your 2026 ballot" })).toBeVisible();
}

/** Offline for the page and its service worker alike: every request that would reach the network fails. */
async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

const pick = (page: Page, name: RegExp) =>
  page.locator("label", { has: page.getByRole("radio", { name }) }).click();

test.describe("address, ballot, plan, and the offline cheat sheet", () => {
  test("a voter finds their races, saves a plan, and reads it offline", async ({
    page,
    context,
  }) => {
    const sent = await mockLocation(page, TEXAS);
    await findBallot(page, "1100 Congress Ave, Austin, TX 78701");
    expect(sent).toEqual([{ address: "1100 Congress Ave, Austin, TX 78701" }]);
    const stored = await page.evaluate(
      () => window.localStorage.getItem("for-the-people.voter") ?? "",
    );
    expect(stored).not.toContain("Congress Ave");

    // The ballot district's outline draws in, then the words say where the voter votes.
    await expect(page.getByText("You vote in TX-10 for the U.S. House")).toBeVisible();
    const notice = page.getByRole("region", { name: "Your district changed" });
    await expect(notice).toContainText("TX-37");
    await expect(notice).toContainText("TX-10");

    const senate = page.getByRole("region", { name: "U.S. Senate, Texas" });
    const house = page.getByRole("region", { name: "U.S. House, TX-10" });
    await expect(senate).toBeVisible();
    await expect(house).toBeVisible();
    // Neither race has a state list, so each says so at its top, before any name, with the state's
    // election office one tap away.
    for (const race of [senate, house]) {
      await expect(race.getByText("Official candidate list not available yet")).toBeVisible();
      // FEC filings can include people who are out and leave out people who are in: never "everyone".
      const rows = await race.locator('li[data-fact="candidacy"]').count();
      await expect(
        race.getByText(
          `This list comes from FEC filings. It may include people who lost a primary or dropped out, and may leave out candidates who have not filed with the FEC. All ${rows} FEC filings are shown, in alphabetical order.`,
        ),
      ).toBeVisible();
      await expect(race.getByRole("link", { name: /Texas election office/ })).toHaveAttribute(
        "href",
        /^https:\/\/www\.sos\.state\.tx\.us\//,
      );
    }
    // Every FEC filer, alphabetical by last name: never reordered by money or incumbency.
    const names = (
      await senate
        .getByRole("radio")
        .evaluateAll((radios) => radios.map((radio) => radio.getAttribute("aria-label") ?? ""))
    )
      .filter((label) => label !== "")
      .map((label) => label.split(",")[0]!);
    expect(names.length).toBeGreaterThan(10);
    const lastName = (name: string) =>
      name
        .replace(/,? (Jr|Sr|II|III|IV)\.?$/, "")
        .split(" ")
        .at(-1)!
        .toLowerCase();
    expect(names.map(lastName)).toEqual(names.map(lastName).toSorted());
    if (test.info().project.name === "mobile") {
      // Compact rows at 390: the name with its party tag, then the money or the match. Two lines.
      const heights = await senate
        .locator('li[data-fact="candidacy"]')
        .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
      expect(Math.max(...heights)).toBeLessThanOrEqual(76);
    }
    await expect(house.getByText("Incumbent").first()).toBeVisible();
    // One "Raised through" date per race; a row names a date only when its own differs.
    await expect(
      house.getByText(/^Raised through \w{3} \d{1,2}, \d{4} unless noted\.$/),
    ).toBeVisible();
    await expect(
      house.getByRole("button", { name: /^Raised \$[\d.]+[KM]? ?: receipts for / }).first(),
    ).toBeVisible();
    // Texas's pending note says why no nominee is marked, and names no result the page does not show.
    await expect(senate).toContainText("so no name here is marked as a nominee");
    await expect(senate).not.toContainText(/runoff results name/i);
    // Candidates with no voting record on the key votes are compact: no portrait, no "No voting record yet".
    await expect(page.getByText("No voting record yet")).toHaveCount(0);
    const rowFacts = await senate.locator('li[data-fact="candidacy"]').evaluateAll((rows) =>
      rows.map((row) => ({
        portrait: row.querySelector('[class*="aspect-[4/5]"]') !== null,
        width: row.firstElementChild!.getBoundingClientRect().width,
        height: row.getBoundingClientRect().height,
      })),
    );
    expect(rowFacts.some((row) => !row.portrait)).toBe(true);
    if (test.info().project.name === "desktop") {
      // Rows stop at 640px, so the money sits near the name; a compact row is one line.
      expect(Math.max(...rowFacts.map((row) => row.width))).toBeLessThanOrEqual(640);
      const compact = rowFacts.filter((row) => !row.portrait);
      // A 44px oval target, 10px of padding above and below, and the 1px rule between rows.
      expect(Math.max(...compact.map((row) => row.height))).toBeLessThanOrEqual(65);
    }
    // A row with no portrait puts the name right after the oval, where Undecided's label starts; rows
    // with a portrait line their names up after it. No row keeps an empty portrait-width gap. Layout
    // offsets, not client rects, so the ovals' scale-in does not move the edges being measured.
    const nameEdges = await senate.locator("li").evaluateAll((rows) =>
      rows.flatMap((row) => {
        const oval = row.querySelector<HTMLElement>("input[type=radio] + span");
        const name = row.querySelector<HTMLElement>("label > span:last-child > span:first-child");
        if (!oval || !name || oval.offsetParent !== name.offsetParent) return [];
        return [
          {
            portrait: row.querySelector('[class*="aspect-[4/5]"]') !== null,
            gap: name.offsetLeft - (oval.offsetLeft + oval.offsetWidth),
            left: name.offsetLeft,
          },
        ];
      }),
    );
    const bare = nameEdges.filter((row) => !row.portrait);
    const pictured = nameEdges.filter((row) => row.portrait);
    expect(bare.length).toBeGreaterThan(1);
    expect(Math.max(...bare.map((row) => row.gap))).toBeLessThanOrEqual(16);
    expect(new Set(bare.map((row) => row.left)).size).toBe(1);
    expect(new Set(pictured.map((row) => row.left)).size).toBeLessThanOrEqual(1);

    await pick(page, /^Chris Gober, Republican/);
    await senate.getByText("Undecided", { exact: true }).click();
    await house.getByLabel("Note for yourself (optional)").fill("Read the debate recap");
    await expect(page.getByText("Unsaved changes in 2 races")).toBeVisible();
    await page.getByRole("button", { name: "Save my ballot" }).click();
    await expect(page.getByText("Saved to your ballot")).toBeVisible();
    await expect(page.getByText("2 of 2 races planned, saved on this device")).toBeVisible();

    await expectAccessible(page);
    expect(await expectProvenance(page)).toBeGreaterThan(10);

    await page.getByRole("link", { name: "Open my cheat sheet" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "My ballot cheat sheet" }),
    ).toBeVisible();
    const picks = page.getByRole("list", { name: "Your picks" });
    await expect(picks).toContainText("Chris Gober");
    await expect(page.getByRole("button", { name: "Print" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("link", { name: "Plan my ballot" })).toHaveCount(0);
    await expect(picks).toContainText("Note: Read the debate recap");
    await expect(page.getByText(/Some states limit phones and cameras/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Add Election Day to calendar" })).toHaveAttribute(
      "href",
      "/election-day-2026.ics",
    );
    await expectAccessible(page);

    // Once the service worker controls the page, the cheat sheet and its race list are cached.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(picks).toContainText("Chris Gober");
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);

    await goOffline(context);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "My ballot cheat sheet" }),
    ).toBeVisible();
    await expect(
      page.getByText("You are offline. This is the plan saved on this device."),
    ).toBeVisible();
    await expect(picks).toContainText("Chris Gober");
    await expect(picks).toContainText("Undecided");

    // Any other page offline falls back to the cheat sheet.
    await page.goto("/swipe");
    await expect(page).toHaveURL(/\/ballot\/cheat-sheet$/);
    await expect(picks).toContainText("Chris Gober");
  });

  test("before an address, the ballot shows a real race, marked as an example", async ({
    page,
  }, info) => {
    await page.goto("/ballot");
    const example = page.getByRole("figure");
    await expect(example.getByText("Example", { exact: true })).toBeVisible();
    await expect(example.getByText(/^Example\. Your address shows your own/)).toBeVisible();
    // Two real candidates, each with its Receipt, and nothing to press or pick: it cannot pass for the
    // voter's own ballot, and it shows no match.
    await expect(example.locator('li[data-fact="candidacy"]')).toHaveCount(2);
    await expect(example.getByRole("link")).toHaveCount(0);
    await expect(example.getByRole("button")).toHaveCount(0);
    await expect(example.getByRole("radio")).toHaveCount(0);
    await expect(example.getByText(/\d+% match/)).toHaveCount(0);
    // On a phone the countdown and the registration deadlines come before the address card.
    if (info.project.name === "mobile") {
      const deadlines = await page
        .getByRole("link", { name: "Registration deadlines by state" })
        .boundingBox();
      const address = await page.getByLabel("Your home address").boundingBox();
      expect(deadlines!.y).toBeLessThan(address!.y);
    }
    await expectAccessible(page);
    expect(await expectProvenance(page)).toBeGreaterThan(0);
  });

  test("a cheat sheet with nothing planned leads back to the ballot, and Print says why it waits", async ({
    page,
  }) => {
    await page.addInitScript((location) => {
      window.localStorage.setItem(
        "for-the-people.voter",
        JSON.stringify({
          localId: "11111111-1111-4111-8111-111111111111",
          schemaVersion: 1,
          preferences: { theme: "system" },
          consent: { analytics: false },
          journey: "new",
          stances: [],
          location: { ...location, setAt: "2026-09-23T15:00:00.000Z" },
          ballotPlan: null,
          following: [],
        }),
      );
    }, TEXAS);
    let printed = false;
    await page.exposeFunction("markPrinted", () => {
      printed = true;
    });
    await page.addInitScript(() => {
      window.print = () => (window as unknown as { markPrinted: () => void }).markPrinted();
    });
    await page.goto("/ballot/cheat-sheet");
    const picks = page.getByRole("list", { name: "Your picks" });
    await expect(picks.getByText("Not planned yet")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Plan my ballot" })).toHaveAttribute(
      "href",
      "/ballot",
    );
    const print = page.getByRole("button", { name: "Print" });
    await expect(print).toHaveAttribute("aria-disabled", "true");
    await expect(print).toHaveAccessibleDescription(
      "Print is ready once you plan at least one race.",
    );
    await expect(print).toBeDisabled();
    // aria-disabled keeps it focusable and clickable; a press does nothing.
    await print.click({ force: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(printed).toBe(false);
    await expectAccessible(page);
  });

  test("the calendar file is a valid all-day Election Day event", async ({ page }) => {
    const response = await page.request.get("/election-day-2026.ics");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("DTSTART;VALUE=DATE:20261103");
    expect(text).toContain("SUMMARY:Election Day");
  });

  test("a state whose map is in court shows both possible House races and confirms neither", async ({
    page,
  }) => {
    await mockLocation(page, MISSOURI);
    await findBallot(page, "201 W Capitol Ave, Jefferson City, MO 65101");
    const notice = page.getByRole("region", { name: /map is still being decided in court/ });
    await expect(notice).toContainText("MO-5 (the new map) or MO-3 (the map used in 2024)");
    await expect(notice.getByRole("link", { name: /Missouri election office/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "U.S. House, MO-5" })).toContainText(
      "If the new map stands",
    );
    await expect(page.getByRole("region", { name: "U.S. House, MO-3" })).toContainText(
      "If the map used in 2024 stands",
    );
    await expect(page.getByText("Your district changed")).toHaveCount(0);
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("a voter can pick a district by hand, and Louisiana ballots explain the open primary", async ({
    page,
  }) => {
    await page.goto("/ballot");
    await page.getByRole("button", { name: "Pick my district instead" }).click();
    await page.getByLabel("State", { exact: true }).selectOption("LA");
    await page.getByLabel("District on your 2026 ballot").selectOption("2");
    await page.getByRole("button", { name: "Use this district" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your 2026 ballot" })).toBeVisible();
    const house = page.getByRole("region", { name: "U.S. House, LA-2" });
    await expect(house).toContainText("runoff on December 12, 2026");
    const senate = page.getByRole("region", { name: "U.S. Senate, Louisiana" });
    await expect(senate).toBeVisible();
    await expect(senate).toContainText("no majority is required");
    await expect(
      senate.getByRole("link", { name: /Louisiana Secretary of State/ }),
    ).toHaveAttribute(
      "href",
      "https://www.sos.la.gov/elections-voting/closed-party-primary-elections",
    );
    await page.getByRole("button", { name: "Change address" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Find your 2026 ballot" }),
    ).toBeVisible();
  });

  test("a certified Senate list names the choices, and other FEC filers are set aside", async ({
    page,
  }) => {
    await mockLocation(page, COLORADO);
    await findBallot(page, "200 E Colfax Ave, Denver, CO 80203");
    const senate = page.getByRole("region", { name: "U.S. Senate, Colorado" });
    await expect(senate).toContainText(
      "On the November ballot, certified by Colorado Secretary of State",
    );
    await expect(senate.getByRole("link", { name: /Colorado Secretary of State/ })).toHaveAttribute(
      "href",
      "https://www.sos.state.co.us/pubs/elections/vote/generalCandidates.html",
    );
    const choices = senate.getByRole("radio");
    await expect(choices).toHaveCount(7);
    await expect(
      senate.getByRole("radio", { name: /^John Hickenlooper, Democrat, incumbent/ }),
    ).toBeAttached();
    await expect(
      senate.getByRole("radio", { name: /^Christopher Baum, Approval Voting Party/ }),
    ).toBeAttached();
    await expect(senate.getByRole("radio", { name: /Karen Breslin/ })).toHaveCount(0);

    const others = senate.getByText("Other FEC filings (not on the state's list)");
    await expect(senate.getByText("Karen Breslin", { exact: true })).toBeHidden();
    await others.click();
    await expect(senate.getByText("Karen Breslin", { exact: true })).toBeVisible();

    // The House race has no state list yet, so its FEC note stays; the certified Senate list has none.
    const house = page.getByRole("region", { name: "U.S. House, CO-1" });
    await expect(house.getByText(/This list comes from FEC filings/)).toBeVisible();
    await expect(senate.getByText(/This list comes from FEC filings/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save my ballot" })).toBeDisabled();
    await expect(page.getByText("Pick a candidate or Undecided in a race first.")).toBeVisible();
    await expectAccessible(page);
    await expectProvenance(page);
  });

  test("the location API validates input and never echoes an address", async ({ page }) => {
    const bad = await page.request.post("/api/location", { data: { address: "x" } });
    expect(bad.status()).toBe(400);
    const extra = await page.request.post("/api/location", {
      data: { address: "1100 Congress Ave, Austin, TX", note: "extra" },
    });
    expect(extra.status()).toBe(400);
    const unknown = await page.request.post("/api/location", {
      data: { state: "TX", district: 99 },
    });
    expect(unknown.status()).toBe(400);
    const manual = await page.request.post("/api/location", {
      data: { state: "TX", district: 10 },
    });
    expect(manual.status()).toBe(200);
    expect(await manual.json()).toEqual({
      state: "TX",
      districts: ["TX-10@cd120"],
      ballotDistrictConfirmed: true,
      method: "manual",
    });
    const ballot = await page.request.get("/api/ballot?state=TX&districts=CA-1@cd120");
    expect(ballot.status()).toBe(400);
  });
});
