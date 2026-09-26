import type { Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./fixtures";

const header = (page: Page) => page.locator('header a[aria-label="For The People home"]');

test.describe("the product logo", () => {
  test("the supplied emblem loads beside the full name", async ({ page }) => {
    await page.goto("/");
    await expect(header(page)).toBeVisible();
    await expect(header(page)).toHaveText("For The People");
    const logo = header(page).locator("img");
    await expect(logo).toHaveAttribute("src", "/brand/symbol.png");
    await expect
      .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page).toHaveTitle(/For The People/);
  });

  test("the logo stays visible after navigation and links home", async ({ page }) => {
    await page.goto("/methodology");
    await waitForHydration(page);
    await expect(header(page)).toBeVisible();
    await header(page).click();
    await page.waitForURL(/\/$/);
    await expect(header(page)).toHaveText("For The People");
  });
});

test.describe("navigation", () => {
  test("phones: Matches lights Swipe, a bill lights no tab, the election hub lights Ballot", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the tab bar is phone-only");
    const tabs = page.getByRole("navigation", { name: "Main" });
    await page.goto("/matches");
    await waitForHydration(page);
    await expect(tabs.getByRole("link", { name: "Swipe" })).toHaveAttribute("aria-current", "true");
    await page.goto("/bills/119-hr-1");
    await waitForHydration(page);
    await expect(tabs.locator("[aria-current]")).toHaveCount(0);
    await page.goto("/election");
    await waitForHydration(page);
    await expect(tabs.getByRole("link", { name: "Ballot" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("desktop: every destination is a visible link, and the current one is marked", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the top links are desktop-only");
    await page.goto("/election");
    await waitForHydration(page);
    const primary = page.getByRole("navigation", { name: "Primary" });
    for (const name of ["Swipe", "Matches", "Explore", "Ballot", "Election", "Ask"]) {
      await expect(primary.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(primary.getByRole("link", { name: "Election" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("button", { name: "Search a name, bill, or address", exact: true }),
    ).toBeVisible();
    await page.goto("/you");
    await waitForHydration(page);
    await expect(page.getByRole("link", { name: "You: your answers and data" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
