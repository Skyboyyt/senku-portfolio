import { describe, expect, it } from "vitest";
import { extractiveReply } from "../src/ai/assistant";
import { chunkArticle, splitImport } from "../src/ai/chunk";
import { asksForHuman, detectSensitiveIntent, escapeForPrompt, findUnsupportedLinks, makesUnauthorizedCommitment } from "../src/ai/guards";
import { WorkersAiProvider, type WorkersAiBinding } from "../src/ai/providers";
import { queryTerms } from "../src/ai/retrieval";
import { ProviderRefusalError, REPLY_JSON_SCHEMA } from "../src/ai/types";
import { signTicket, verifyTicket } from "../src/realtime/tickets";
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

describe("realtime tickets", () => {
  const secret = "x".repeat(40);

  it("round-trips a signed ticket", () => {
    const ticket = signTicket(secret, "user-1", "org-1");
    expect(verifyTicket(secret, ticket)).toMatchObject({ u: "user-1", o: "org-1" });
  });

  it("rejects tampered, foreign and expired tickets", () => {
    const ticket = signTicket(secret, "user-1", "org-1");
    const [body, sig] = ticket.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), o: "org-2" })).toString("base64url");
    expect(verifyTicket(secret, `${forged}.${sig}`)).toBeNull();
    expect(verifyTicket("y".repeat(40), ticket)).toBeNull();
    expect(verifyTicket(secret, ticket, Date.now() + 61_000)).toBeNull();
    expect(verifyTicket(secret, "garbage")).toBeNull();
  });
});

describe("Workers AI provider", () => {
  const request = (json = true, signal = new AbortController().signal) => ({ system: "sys", prompt: "question", maxTokens: 300, json, signal });
  const binding = (output: unknown, calls: unknown[][] = []): WorkersAiBinding => ({
    run: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(output);
    },
  });

  it("sends a JSON-mode chat request and reads the reply and token usage", async () => {
    const calls: unknown[][] = [];
    const reply = '{"reply":"5-7 days","confidence":0.9,"needs_human":false,"reason":"","source_ids":[1]}';
    const provider = new WorkersAiProvider(
      binding({ choices: [{ message: { content: reply }, finish_reason: "stop" }], usage: { prompt_tokens: 92, completion_tokens: 47 } }, calls),
    );
    expect(await provider.complete(request())).toEqual({ text: reply, inputTokens: 92, outputTokens: 47 });
    expect(calls[0]![0]).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(calls[0]![1]).toMatchObject({
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "question" }],
      max_tokens: 300,
      response_format: { type: "json_schema", json_schema: REPLY_JSON_SCHEMA },
    });
  });

  it("falls back to the parsed response field and omits JSON mode for plain text", async () => {
    const calls: unknown[][] = [];
    const provider = new WorkersAiProvider(binding({ response: { reply: "hi" } }, calls), "@cf/test/model");
    expect((await provider.complete(request(false))).text).toBe('{"reply":"hi"}');
    expect(calls[0]![0]).toBe("@cf/test/model");
    expect(calls[0]![1]).not.toHaveProperty("response_format");
  });

  it("rejects refusals, cut-off JSON and aborted requests", async () => {
    await expect(new WorkersAiProvider(binding({ choices: [{ message: { refusal: "no" } }] })).complete(request())).rejects.toBeInstanceOf(ProviderRefusalError);
    await expect(new WorkersAiProvider(binding({ choices: [{ message: { content: "{" }, finish_reason: "length" }] })).complete(request())).rejects.toThrow(/cut off/);
    const controller = new AbortController();
    const pending = new WorkersAiProvider({ run: () => new Promise(() => {}) }).complete(request(true, controller.signal));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
