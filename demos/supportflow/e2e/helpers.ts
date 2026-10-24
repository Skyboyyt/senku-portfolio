import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

let n = 0;
export function uniqueEmail(prefix = "e2e"): string {
  n += 1;
  return `${prefix}.${Date.now()}.${n}@example.com`;
}

export async function registerViaUi(page: Page, org = "E2E Coffee Co", email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Jamie Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByLabel("Workspace name").fill(org);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("heading", { name: "Hello, Jamie" })).toBeVisible();
  return email;
}

/** Fails on serious or critical WCAG A/AA violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")})`),
  ).toEqual([]);
}

/** No horizontal scrolling at the current viewport width. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
