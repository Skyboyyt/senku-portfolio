import { expect, test } from "@playwright/test";
import { expectAccessible, registerViaUi } from "./helpers";

test("support workflow: knowledge base, AI reply, realtime handoff, ticket", async ({ page, context }) => {
  test.setTimeout(120_000);
  await registerViaUi(page, "Workflow Roasters");

  // Publish an article for the AI to use.
  await page.goto("/app/knowledge/new");
  await page.getByLabel("Title", { exact: true }).fill("Opening hours");
  await page.getByLabel("Article", { exact: true }).fill("## Weekdays\nThe shop is open from 8am to 6pm, Monday to Friday.\n\n## Weekends\nSaturdays 9am to 1pm. Closed on Sundays.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published. The AI can use it now.")).toBeVisible();
  await expect(page.getByText(/passages?,/)).toBeVisible();

  // Automatic replies need a paid plan; test billing switches without payment.
  await page.goto("/app/billing");
  await expect(page.getByText("Test mode.")).toBeVisible();
  await page.getByRole("button", { name: "Switch to Starter" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Switch to Starter" }).click();
  await expect(page.getByText(/Switched to Starter in test mode/)).toBeVisible();

  await page.goto("/app/settings");
  await page.getByLabel(/Reply automatically when confident/).check();
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText("AI settings saved")).toBeVisible();

  // Keep the inbox open in a second tab to see realtime updates arrive.
  const inbox = await context.newPage();
  await inbox.goto("/app/inbox");
  await expect(inbox.getByText("Live updates on")).toBeVisible();

  // A visitor asks a question in the widget preview (the real widget).
  await page.goto("/app/widget");
  const chat = page.getByRole("region", { name: "Workflow Roasters" });
  await expect(chat).toBeVisible();
  await chat.getByLabel("Message", { exact: true }).fill("What are your opening hours on Saturdays?");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat.getByText(/help article "Opening hours"/)).toBeVisible({ timeout: 15_000 });
  await expect(chat.getByText("AI", { exact: true })).toBeVisible();

  // The conversation appears in the other tab without reloading.
  const item = inbox.getByRole("link", { name: /Website visitor/ }).first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
  await expect(inbox.getByText("What are your opening hours on Saturdays?")).toBeVisible();
  await expect(inbox.getByText("Sent automatically")).toBeVisible();
  await expectAccessible(inbox);

  // The visitor asks for a person; the inbox flags it.
  await chat.getByRole("button", { name: "Talk to a person" }).click();
  await expect(inbox.getByText("Waiting for a person. The AI has stopped replying.")).toBeVisible({ timeout: 15_000 });

  // An agent replies; the visitor sees it live.
  await inbox.getByLabel("Reply").fill("Hi! We're open 9 to 1 on Saturdays. See you then.");
  await inbox.getByRole("button", { name: "Send reply" }).click();
  await expect(chat.getByText("Hi! We're open 9 to 1 on Saturdays. See you then.")).toBeVisible({ timeout: 15_000 });

  // Internal notes never reach the visitor.
  await inbox.getByRole("tab", { name: "Internal note" }).click();
  await inbox.getByLabel("Internal note").fill("Regular customer, likes the Ethiopia roast");
  await inbox.getByRole("button", { name: "Add note" }).click();
  await expect(inbox.getByText("Regular customer, likes the Ethiopia roast")).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(chat.getByText("Regular customer")).toHaveCount(0);

  // Create a ticket from the conversation.
  await inbox.getByRole("button", { name: "More actions" }).click();
  await inbox.getByRole("menuitem", { name: "Create ticket" }).click();
  const dialog = inbox.getByRole("dialog", { name: "New ticket" });
  await dialog.getByLabel("Title", { exact: true }).fill("Reserve Ethiopia beans for Saturday pickup");
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByRole("button", { name: "Create ticket" }).click();
  await expect(inbox.getByText("Ticket #1 created", { exact: true })).toBeVisible();

  await inbox.goto("/app/tickets");
  await inbox.getByRole("link", { name: /Reserve Ethiopia beans/ }).click();
  await expect(inbox).toHaveURL(/\/app\/tickets\/[0-9a-f-]{36}$/);
  await expect(inbox.getByRole("heading", { name: /Reserve Ethiopia beans/ })).toBeVisible();
  await inbox.getByLabel("Status").selectOption("in_progress");
  await expect(inbox.getByText("Status updated")).toBeVisible();
  await inbox.getByLabel("Add an internal comment").fill("Beans set aside.");
  await inbox.getByRole("button", { name: "Comment" }).click();
  await expect(inbox.getByText("Beans set aside.")).toBeVisible();
  await expect(inbox.getByText(/changed status from Open to In progress/)).toBeVisible();

  // Resolve, and the visitor is asked for a rating.
  await inbox.getByRole("link", { name: "Open conversation" }).click();
  await inbox.getByRole("button", { name: "Resolve" }).click();
  await expect(chat.getByText("How did we do?")).toBeVisible({ timeout: 15_000 });
  await chat.getByRole("button", { name: "5 out of 5" }).click();
  await expect(chat.getByText("Thanks for your feedback.")).toBeVisible();

  // Analytics reflect the activity.
  await inbox.goto("/app/analytics");
  await expect(inbox.getByText("5.0 / 5")).toBeVisible();
});

test("one workspace can't open another workspace's records", async ({ browser }) => {
  const a = await browser.newContext();
  const pageA = await a.newPage();
  await registerViaUi(pageA, "Tenant Alpha");
  await pageA.goto("/app/tickets");
  await pageA.getByRole("button", { name: "New ticket" }).first().click();
  await pageA.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Alpha internal ticket");
  await pageA.getByRole("dialog").getByRole("button", { name: "Create ticket" }).click();
  await expect(pageA).toHaveURL(/\/app\/tickets\/[0-9a-f-]{36}$/);
  const ticketUrl = pageA.url();

  const b = await browser.newContext();
  const pageB = await b.newPage();
  await registerViaUi(pageB, "Tenant Beta");
  await pageB.goto(ticketUrl);
  await expect(pageB.getByText("This ticket doesn't exist or was deleted.")).toBeVisible();
  await expect(pageB.getByText("Alpha internal ticket")).toHaveCount(0);
  await a.close();
  await b.close();
});

test("dashboard navigation works on phones", async ({ page }) => {
  await registerViaUi(page, "Mobile Shop");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("dialog", { name: "Navigation" });
  await nav.getByRole("link", { name: "Tickets" }).click();
  await expect(page).toHaveURL(/\/app\/tickets$/);
  await expect(nav).toBeHidden();
  for (const path of ["/app", "/app/inbox", "/app/tickets", "/app/knowledge", "/app/analytics", "/app/widget", "/app/team", "/app/billing", "/app/settings"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("dashboard pages pass accessibility checks", async ({ page }) => {
  await registerViaUi(page, "Accessible Co");
  for (const path of ["/app", "/app/tickets", "/app/knowledge", "/app/customers", "/app/analytics", "/app/widget", "/app/team", "/app/billing", "/app/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);
  }
});

test("team invitation flow", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await registerViaUi(owner, "Invite Co");
  await owner.goto("/app/team");
  await owner.getByRole("button", { name: "Invite", exact: true }).click();
  const email = `agent.${Date.now()}@example.com`;
  await owner.getByRole("dialog").getByLabel("Email").fill(email);
  await owner.getByRole("dialog").getByRole("button", { name: "Create invitation" }).click();
  const link = await owner.getByLabel("Invitation link").inputValue();
  expect(link).toContain("/invite/");

  const agentCtx = await browser.newContext();
  const agent = await agentCtx.newPage();
  await agent.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(agent.getByRole("heading", { name: "Join Invite Co" })).toBeVisible();
  await agent.getByLabel("Your name").fill("Avery Agent");
  await agent.getByLabel("Password").fill("correct horse battery");
  await agent.getByRole("button", { name: "Create account and join" }).click();
  await expect(agent.getByRole("heading", { name: "Hello, Avery" })).toBeVisible();
  // Agents don't get admin controls.
  await agent.goto("/app/settings");
  await expect(agent.getByText("Workspace settings can be changed by admins and owners.")).toBeVisible();
  await ownerCtx.close();
  await agentCtx.close();
});
