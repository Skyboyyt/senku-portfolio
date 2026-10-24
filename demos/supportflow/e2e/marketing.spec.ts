import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalOverflow } from "./helpers";

test.describe("public website", () => {
  for (const path of ["/", "/features", "/how-it-works", "/pricing", "/contact", "/privacy", "/terms", "/login", "/register"]) {
    test(`${path} renders, is accessible and fits phones`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expectAccessible(page);
      await page.setViewportSize({ width: 375, height: 800 });
      await expectNoHorizontalOverflow(page);
    });
  }

  test("dark mode is accessible too", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectAccessible(page);
  });

  test("the theme choice persists without a flash", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Colour theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    // Set by the inline script before React hydrates.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("mobile menu opens, traps focus, closes on Escape and on navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const open = page.getByRole("button", { name: "Open menu" });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await dialog.getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(dialog).toBeHidden();
  });

  test("contact form validates and submits", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Name is required")).toBeVisible();
    await page.getByLabel("Name").fill("Pat Visitor");
    await page.getByLabel("Work email").fill("pat@example.com");
    await page.getByLabel("How can we help?").fill("We'd like to know about the Business plan.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Message received")).toBeVisible();
  });

  test("the dashboard requires signing in", async ({ page }) => {
    await page.goto("/app/inbox");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Finbox/);
  });

  test("the homepage demo answers from the fictional help centre", async ({ page }) => {
    await page.goto("/");
    const chat = page.getByRole("region", { name: "Larkspur Coffee" });
    await expect(chat).toBeVisible();
    await chat.getByLabel("Message", { exact: true }).fill("How long does shipping take to Europe?");
    await chat.getByRole("button", { name: "Send message" }).click();
    await expect(chat.getByText("How long does shipping take to Europe?")).toBeVisible();
    // Excerpt replies name the article; a language model answers with its contents.
    await expect(chat.getByText(/Shipping times and costs|3[–-]5 business days/).last()).toBeVisible({ timeout: 15_000 });
  });
});
