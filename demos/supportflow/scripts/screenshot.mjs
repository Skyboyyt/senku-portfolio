// Usage: node scripts/screenshot.mjs <url> <out.png> [width=1280] [theme=light|dark] [fullPage=true] [cookie]
// Captures real screenshots of the running app (used for visual QA and the portfolio).
import { chromium } from "@playwright/test";

const [url, out, width = "1280", theme = "light", fullPage = "true", cookie] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: screenshot.mjs <url> <out.png> [width] [theme] [fullPage] [cookie]");
  process.exit(1);
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: Number(width), height: Number(width) < 600 ? 812 : 900 },
  colorScheme: theme === "dark" ? "dark" : "light",
  deviceScaleFactor: 2,
});
if (cookie) {
  const u = new URL(url);
  await context.addCookies([{ name: "sf_session", value: cookie, domain: u.hostname, path: "/" }]);
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: fullPage === "true" });
if (errors.length) console.log(errors.join("\n"));
await browser.close();
