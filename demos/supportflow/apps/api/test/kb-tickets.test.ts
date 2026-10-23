import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, as, createTestApp, publishArticle, register, resetDatabase, visitorSays, widgetKey, type Actor } from "./helpers";

let app: FastifyInstance;
let owner: Actor;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  owner = await register(app, "Docs Co");
});
afterAll(async () => app.close());

describe("knowledge base", () => {
  it("only published articles are retrievable, and archiving removes them", async () => {
    const draft = await as(app, owner).post("/kb/articles", { title: "Warranty terms", body: "Grinders carry a two year warranty against defects." });
    const id = draft.json().id;
    expect(draft.json().chunkCount).toBe(0);
    expect((await as(app, owner).post("/kb/search", { q: "grinder warranty" })).json()).toEqual([]);

    const published = await as(app, owner).post(`/kb/articles/${id}/status`, { status: "published" });
    expect(published.json().chunkCount).toBeGreaterThan(0);
    expect(published.json().indexedAt).not.toBeNull();
    const hits = (await as(app, owner).post("/kb/search", { q: "grinder warranty" })).json();
    expect(hits[0].title).toBe("Warranty terms");

    await as(app, owner).post(`/kb/articles/${id}/status`, { status: "archived" });
    expect((await as(app, owner).post("/kb/search", { q: "grinder warranty" })).json()).toEqual([]);
  });

  it("reindexes a published article when it is edited", async () => {
    const id = await publishArticle(app, owner, "Store hours", "We open at 8am.");
    await as(app, owner).patch(`/kb/articles/${id}`, { body: "We open at 7am and close at noon on Saturdays." });
    const hits = (await as(app, owner).post("/kb/search", { q: "saturdays noon" })).json();
    expect(hits[0].excerpt).toContain("7am");
  });

  it("imports a Markdown file split on top-level headings", async () => {
    const content = "# Payment methods\nWe accept cards and PayPal.\n\n# Gift cards\nGift cards never expire.\n## Balance\nCheck your balance online.";
    const res = await as(app, owner).post("/kb/import", { filename: "help-centre.md", content, publish: true });
    expect(res.statusCode).toBe(201);
    expect(res.json().imported).toBe(2);
    const articles = (await as(app, owner).get("/kb/articles?q=gift")).json();
    expect(articles[0]).toMatchObject({ title: "Gift cards", source: "import", status: "published" });
    expect((await as(app, owner).post("/kb/import", { filename: "malware.exe", content: "# x\nyyy" })).statusCode).toBe(400);
  });

  it("manages categories and filters by them", async () => {
    const cat = await as(app, owner).post("/kb/categories", { name: "Orders" });
    expect(cat.statusCode).toBe(201);
    expect((await as(app, owner).post("/kb/categories", { name: "orders" })).statusCode).toBe(409);
    await as(app, owner).post("/kb/articles", { title: "Changing an order", body: "Contact us within one hour.", categoryId: cat.json().id });
    const list = (await as(app, owner).get(`/kb/articles?categoryId=${cat.json().id}`)).json();
    expect(list).toHaveLength(1);
    expect(list[0].category.name).toBe("Orders");
  });

  it("enforces the plan's article limit", async () => {
    const shop = await register(app, "Many Docs");
    const content = Array.from({ length: 26 }, (_, i) => `# Article number ${i + 1}\nBody ${i + 1}`).join("\n");
    const res = await as(app, shop).post("/kb/import", { filename: "bulk.md", content });
    expect(res.statusCode).toBe(402);
  });
});

describe("tickets", () => {
  it("creates tickets from conversations with per-workspace numbers", async () => {
    const { conversationId } = await visitorSays(app, await widgetKey(app, owner), "My grinder arrived broken");
    const first = await as(app, owner).post("/tickets", { title: "Broken grinder", priority: "high", conversationId });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ number: 1, priority: "high", status: "open", conversationId });
    expect(first.json().customer).not.toBeNull();
    const second = await as(app, owner).post("/tickets", { title: "Follow-up call" });
    expect(second.json().number).toBe(2);

    const other = await register(app, "Other Numbers");
    expect((await as(app, other).post("/tickets", { title: "Their first" })).json().number).toBe(1);

    const conv = (await as(app, owner).get(`/conversations/${conversationId}`)).json();
    expect(conv.tickets[0].number).toBe(1);
    expect(conv.messages.at(-1)).toMatchObject({ internal: true, authorType: "system" });
  });

  it("updates status, priority and owner, recording history", async () => {
    const agent = await addMember(app, owner, "agent");
    const ticket = (await as(app, owner).post("/tickets", { title: "Refund request" })).json();
    await as(app, owner).patch(`/tickets/${ticket.id}`, { status: "in_progress", priority: "urgent", ownerId: agent.userId });
    const resolved = await as(app, agent).patch(`/tickets/${ticket.id}`, { status: "resolved" });
    expect(resolved.json().resolvedAt).not.toBeNull();
    await as(app, agent).post(`/tickets/${ticket.id}/comments`, { body: "Refund approved by finance." });
    const full = (await as(app, owner).get(`/tickets/${ticket.id}`)).json();
    expect(full.comments[0].body).toBe("Refund approved by finance.");
    expect(full.events.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(["ticket.created", "ticket.status_changed", "ticket.priority_changed", "ticket.owner_changed"]),
    );
  });

  it("filters and searches", async () => {
    await as(app, owner).post("/tickets", { title: "Searchable espresso machine issue", priority: "low" });
    const byText = (await as(app, owner).get("/tickets?q=espresso")).json();
    expect(byText).toHaveLength(1);
    const urgentOnly = (await as(app, owner).get("/tickets?priority=urgent&status=all")).json();
    expect(urgentOnly.every((t: { priority: string }) => t.priority === "urgent")).toBe(true);
    const byNumber = (await as(app, owner).get("/tickets?q=%231&status=all")).json();
    expect(byNumber[0].number).toBe(1);
  });

  it("rejects owners from outside the workspace and invalid input", async () => {
    const stranger = await register(app, "Stranger");
    expect((await as(app, owner).post("/tickets", { title: "Bad owner", ownerId: stranger.userId })).statusCode).toBe(400);
    expect((await as(app, owner).post("/tickets", { title: "x" })).statusCode).toBe(400);
    expect((await as(app, owner).get("/tickets/not-a-uuid")).statusCode).toBe(404);
  });
});

describe("customers and retention", () => {
  it("deletes a customer and all of their conversations", async () => {
    const key = await widgetKey(app, owner);
    const { conversationId } = await visitorSays(app, key, "Please delete my data");
    const conv = (await as(app, owner).get(`/conversations/${conversationId}`)).json();
    expect((await as(app, owner).delete(`/customers/${conv.customer.id}`)).statusCode).toBe(204);
    expect((await as(app, owner).get(`/conversations/${conversationId}`)).statusCode).toBe(404);
  });

  it("purges resolved conversations past the retention period", async () => {
    const shop = await register(app, "Retention Shop");
    const key = await widgetKey(app, shop);
    const { conversationId } = await visitorSays(app, key, "Old question");
    await as(app, shop).patch(`/conversations/${conversationId}`, { status: "resolved" });
    const { sql } = await import("drizzle-orm");
    await app.ctx.db.execute(sql`update conversations set last_message_at = now() - interval '40 days' where id = ${conversationId}`);
    await as(app, shop).patch("/org", { retentionDays: 30 });
    const res = await as(app, shop).post("/org/retention/run");
    expect(res.json().deletedConversations).toBe(1);
    expect((await as(app, shop).get(`/conversations/${conversationId}`)).statusCode).toBe(404);
  });
});
