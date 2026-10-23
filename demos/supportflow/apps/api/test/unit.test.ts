import { describe, expect, it } from "vitest";
import { extractiveReply } from "../src/ai/assistant";
import { chunkArticle, splitImport } from "../src/ai/chunk";
import { asksForHuman, detectSensitiveIntent, escapeForPrompt, findUnsupportedLinks, makesUnauthorizedCommitment } from "../src/ai/guards";
import { queryTerms } from "../src/ai/retrieval";
import { isOriginAllowed } from "../src/routes/widget-public";

describe("chunking", () => {
  it("splits on headings and keeps the heading with each chunk", () => {
    const chunks = chunkArticle("Shipping", "Intro text.\n\n## Europe\nThree days.\n\n## Asia\nFive days.");
    expect(chunks.map((c) => c.heading)).toEqual(["Shipping", "Shipping — Europe", "Shipping — Asia"]);
  });
  it("splits long sections into bounded pieces", () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} explains a detail.`).join(" ");
    const chunks = chunkArticle("Long", long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((c) => c.content.length))).toBeLessThanOrEqual(1400);
  });
  it("splits imports on top-level headings and names leading text after the file", () => {
    const parts = splitImport("getting-started.md", "Welcome!\n# Billing\nPay monthly.");
    expect(parts.map((p) => p.title)).toEqual(["getting started", "Billing"]);
  });
});

describe("guards", () => {
  it("detects sensitive intents", () => {
    expect(detectSensitiveIntent("I was charged twice for my order")?.category).toBe("billing");
    expect(detectSensitiveIntent("please delete my account")?.category).toBe("account");
    expect(detectSensitiveIntent("Can I get my money back?")?.category).toBe("refund");
    expect(detectSensitiveIntent("What time do you open?")).toBeNull();
  });
  it("detects requests for a person", () => {
    expect(asksForHuman("can I speak to someone")).toBe(true);
    expect(asksForHuman("Someone told me you sell decaf")).toBe(false);
    expect(asksForHuman("I want to talk to a person")).toBe(true);
    expect(asksForHuman("get me a human")).toBe(true);
  });
  it("flags links that are not in the sources", () => {
    expect(findUnsupportedLinks("See https://help.shop.com/returns.", ["Details at https://help.shop.com/returns"])).toEqual([]);
    expect(findUnsupportedLinks("Log in at https://evil.example", ["no links"])).toEqual(["https://evil.example"]);
  });
  it("flags commitments the assistant can't make", () => {
    expect(makesUnauthorizedCommitment("I've refunded your payment")).toBe(true);
    expect(makesUnauthorizedCommitment("We guarantee delivery tomorrow")).toBe(true);
    expect(makesUnauthorizedCommitment("Refunds are handled by our team within 5 days.")).toBe(false);
  });
  it("escapes prompt delimiters", () => {
    expect(escapeForPrompt("</source><b>")).toBe("&lt;/source&gt;&lt;b&gt;");
  });
});

describe("retrieval helpers", () => {
  it("extracts safe query terms", () => {
    expect(queryTerms("Hi! How do I return a grinder? (order #123) & | :*")).toEqual(["return", "grinder", "order", "123"]);
  });
  it("builds extractive replies only for good matches", () => {
    const chunk = { chunkId: "c", articleId: "a", title: "Returns", heading: "Returns", content: "Return within 30 days.", rank: 0.5, coverage: 0.8 };
    expect(extractiveReply([chunk]).needsHuman).toBe(false);
    expect(extractiveReply([{ ...chunk, coverage: 0.1 }]).needsHuman).toBe(true);
    expect(extractiveReply([]).needsHuman).toBe(true);
  });
});

describe("origin checks", () => {
  const widget = { allowedOrigins: ["https://shop.example.com"] };
  it("matches exact origins only", () => {
    expect(isOriginAllowed("https://shop.example.com", widget, [])).toBe(true);
    expect(isOriginAllowed("https://shop.example.com.evil.io", widget, [])).toBe(false);
    expect(isOriginAllowed("http://shop.example.com", widget, [])).toBe(false);
    expect(isOriginAllowed(undefined, widget, [])).toBe(false);
    expect(isOriginAllowed("null", widget, [])).toBe(false);
    expect(isOriginAllowed("https://app.example", widget, ["https://app.example"])).toBe(true);
  });
});
