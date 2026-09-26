import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Locator, type Page } from "@playwright/test";

/** Shared test setup: a fixed clock (2026-09-23), a clean device, and helpers for axe and receipts. */

export const FIXED_NOW = new Date("2026-09-23T16:00:00Z");

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await provide(page);
  },
});

export { expect };

/** Zero serious or critical axe violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    blocking.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
    ),
  ).toEqual([]);
}

/** Every element with data-fact carries a data-receipt-id that resolves. */
export async function expectProvenance(page: Page) {
  const facts = await page.locator("[data-fact]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      fact: node.getAttribute("data-fact"),
      receipt: node.getAttribute("data-receipt-id"),
    })),
  );
  const missing = facts.filter((fact) => !fact.receipt);
  expect(missing, "facts without a receipt id").toEqual([]);
  const ids = [...new Set(facts.map((fact) => fact.receipt!))];
  for (const id of ids) {
    const response = await page.request.get(`/api/receipts/${encodeURIComponent(id)}`);
    expect(response.status(), `receipt ${id}`).toBe(200);
  }
  return facts.length;
}

/** The text a sighted reader sees in an element: its text without the screen-reader-only parts. */
export async function shownText(locator: Locator): Promise<string> {
  return locator.evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

/** Waits until React has hydrated the page and attached its listeners (set in Providers). */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
}

/** Picks an option in a labeled Select (components/ui/select.tsx): open the list, choose the option. */
export async function chooseOption(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Answers the current swipe card with the given side using the visible buttons. */
export async function answer(page: Page, side: "Yea" | "Nay" | "Skip") {
  // The deck hydrates after the page; a click before then would land on a button with no handler.
  await page.locator("[data-deck-ready]").first().waitFor({ state: "attached" });
  const button = page.getByRole("button", { name: side === "Skip" ? "Skip" : side, exact: true });
  await button.click();
}
