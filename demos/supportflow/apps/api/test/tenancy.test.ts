import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as,
  createTestApp,
  MockProvider,
  publishArticle,
  register,
  resetDatabase,
  visitorSays,
  widgetKey,
  type Actor,
} from "./helpers";

let app: FastifyInstance;
const provider = new MockProvider();
let a: Actor;
let b: Actor;
let conversationA: string;
let ticketA: string;
let articleA: string;
let customerA: string;
let visitorTokenA: string;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp({ provider });
  a = await register(app, "Tenant A");
  b = await register(app, "Tenant B");
  articleA = await publishArticle(app, a, "Tenant A secret returns policy", "Zebra-coded returns are accepted within 45 days at Tenant A.");
  const visit = await visitorSays(app, await widgetKey(app, a), "Hello from a customer of tenant A");
  conversationA = visit.conversationId!;
  visitorTokenA = visit.token;
  const ticket = await as(app, a).post("/tickets", { title: "Tenant A ticket", conversationId: conversationA });
  ticketA = ticket.json().id;
  customerA = ticket.json().customer.id;
  await as(app, a).post(`/conversations/${conversationA}/messages`, { body: "Internal note for A", internal: true });
});
afterAll(async () => app.close());

describe("cross-tenant isolation", () => {
  it("hides another workspace's records behind 404s", async () => {
    const asB = as(app, b);
    const attempts = [
      asB.get(`/conversations/${conversationA}`),
      asB.post(`/conversations/${conversationA}/messages`, { body: "intrusion" }),
      asB.patch(`/conversations/${conversationA}`, { status: "resolved" }),
      asB.post(`/conversations/${conversationA}/takeover`),
      asB.post(`/conversations/${conversationA}/suggestions`),
      asB.post(`/conversations/${conversationA}/read`),
      asB.get(`/tickets/${ticketA}`),
      asB.patch(`/tickets/${ticketA}`, { status: "closed" }),
      asB.post(`/tickets/${ticketA}/comments`, { body: "intrusion" }),
      asB.get(`/kb/articles/${articleA}`),
      asB.patch(`/kb/articles/${articleA}`, { title: "Hijacked title" }),
      asB.post(`/kb/articles/${articleA}/status`, { status: "archived" }),
      asB.delete(`/kb/articles/${articleA}`),
      asB.delete(`/customers/${customerA}`),
      asB.delete(`/tickets/${ticketA}`),
    ];
    const results = await Promise.all(attempts);
    results.forEach((res, i) => expect(res.statusCode, `attempt ${i}`).toBe(404));
  });

  it("does not let B attach a ticket to A's conversation", async () => {
    const res = await as(app, b).post("/tickets", { title: "Sneaky", conversationId: conversationA });
    expect(res.statusCode).toBe(404);
  });

  it("does not let B assign A's members", async () => {
    const own = await visitorSays(app, await widgetKey(app, b), "B customer question");
    const res = await as(app, b).patch(`/conversations/${own.conversationId}`, { assigneeId: a.userId });
    expect(res.statusCode).toBe(400);
  });

  it("keeps list endpoints scoped to the caller's workspace", async () => {
    const asB = as(app, b);
    const conversations = (await asB.get("/conversations?status=all")).json().items;
    const tickets = (await asB.get("/tickets?status=all")).json();
    const articles = (await asB.get("/kb/articles")).json();
    const customers = (await asB.get("/customers")).json();
    expect(conversations.map((c: { id: string }) => c.id)).not.toContain(conversationA);
    expect(tickets.map((t: { id: string }) => t.id)).not.toContain(ticketA);
    expect(articles.map((x: { id: string }) => x.id)).not.toContain(articleA);
    expect(customers.map((c: { id: string }) => c.id)).not.toContain(customerA);
  });

  it("keeps settings, widget configuration and audit logs separate", async () => {
    const orgB = (await as(app, b).get("/org")).json();
    expect(orgB.id).toBe(b.orgId);
    const widgetA = (await as(app, a).get("/widget/config")).json().config.publicKey;
    const widgetB = (await as(app, b).get("/widget/config")).json().config.publicKey;
    expect(widgetA).not.toBe(widgetB);
    const logsB = (await as(app, b).get("/org/audit-logs")).json().items;
    expect(logsB.every((l: { targetId: string | null }) => l.targetId !== articleA)).toBe(true);
  });

  it("never retrieves another workspace's knowledge base", async () => {
    const search = await as(app, b).post("/kb/search", { q: "zebra coded returns policy" });
    expect(search.json()).toEqual([]);

    // B's AI prompt must not contain A's article even for a matching question.
    await as(app, b).patch("/org", { aiMode: "suggest" });
    const own = await visitorSays(app, await widgetKey(app, b), "What is the zebra coded returns policy?");
    provider.requests.length = 0;
    await as(app, b).post(`/conversations/${own.conversationId}/suggestions`);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.prompt).not.toContain("Zebra-coded");
    expect(provider.requests[0]!.prompt).not.toContain("Tenant A");
  });

  it("does not let A's visitor token read B's widget", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/public/widget/${await widgetKey(app, b)}/session`,
      headers: { origin: "http://localhost:3000", "x-visitor-token": visitorTokenA },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().conversation).toBeNull();
    expect(res.json().messages).toEqual([]);
  });

  it("never exposes internal notes to the visitor", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/public/widget/${await widgetKey(app, a)}/session`,
      headers: { origin: "http://localhost:3000", "x-visitor-token": visitorTokenA },
    });
    const bodies = res.json().messages.map((m: { body: string }) => m.body);
    expect(bodies).toContain("Hello from a customer of tenant A");
    expect(bodies.join(" ")).not.toContain("Internal note");
    expect(bodies.join(" ")).not.toContain("Ticket #");
  });

  it("the public widget key grants no dashboard access", async () => {
    const key = await widgetKey(app, a);
    for (const url of ["/conversations", "/org", "/team/members"]) {
      const res = await app.inject({ method: "GET", url, headers: { "x-visitor-token": key, authorization: `Bearer ${key}` } });
      expect(res.statusCode).toBe(401);
    }
  });
});
