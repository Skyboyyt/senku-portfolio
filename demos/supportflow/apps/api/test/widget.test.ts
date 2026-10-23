import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { as, createTestApp, CUSTOMER_SITE, nextIp, register, resetDatabase, visitorSays, WEB_ORIGIN, widgetKey, type Actor } from "./helpers";

let app: FastifyInstance;
let owner: Actor;
let key: string;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  owner = await register(app, "Widget Co");
  key = await widgetKey(app, owner);
  await as(app, owner).patch("/widget/config", { allowedOrigins: [CUSTOMER_SITE] });
});
afterAll(async () => app.close());

const visitor = (token: string, origin = CUSTOMER_SITE) => ({ origin, "x-visitor-token": token });

describe("origin validation", () => {
  it("rejects websites that are not on the allow list", async () => {
    const res = await app.inject({ method: "GET", url: `/public/widget/${key}/bootstrap`, headers: { origin: "https://copycat.example" } });
    expect(res.statusCode).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects requests without an Origin header", async () => {
    expect((await app.inject({ method: "GET", url: `/public/widget/${key}/bootstrap` })).statusCode).toBe(403);
  });

  it("allows listed origins with CORS headers and answers preflight", async () => {
    const res = await app.inject({ method: "GET", url: `/public/widget/${key}/bootstrap`, headers: { origin: CUSTOMER_SITE } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(CUSTOMER_SITE);
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.json().config.title).toBe("Widget Co");
    const preflight = await app.inject({
      method: "OPTIONS",
      url: `/public/widget/${key}/messages`,
      headers: { origin: CUSTOMER_SITE, "access-control-request-method": "POST" },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-headers"]).toContain("X-Visitor-Token");
  });

  it("returns 404 for unknown keys", async () => {
    expect((await app.inject({ method: "GET", url: "/public/widget/pk_doesnotexist123/bootstrap", headers: { origin: CUSTOMER_SITE } })).statusCode).toBe(404);
  });

  it("validates allowed-origin input", async () => {
    const res = await as(app, owner).patch("/widget/config", { allowedOrigins: ["https://shop.example.com/path"] });
    expect(res.statusCode).toBe(400);
  });

  it("stops serving a disabled widget", async () => {
    await as(app, owner).patch("/widget/config", { enabled: false });
    expect((await app.inject({ method: "GET", url: `/public/widget/${key}/bootstrap`, headers: { origin: CUSTOMER_SITE } })).statusCode).toBe(403);
    await as(app, owner).patch("/widget/config", { enabled: true });
  });

  it("rotating the key invalidates the old one", async () => {
    const shop = await register(app, "Rotate Co");
    const oldKey = await widgetKey(app, shop);
    const rotated = await as(app, shop).post("/widget/config/rotate-key");
    expect(rotated.json().config.publicKey).not.toBe(oldKey);
    expect((await app.inject({ method: "GET", url: `/public/widget/${oldKey}/bootstrap`, headers: { origin: WEB_ORIGIN } })).statusCode).toBe(404);
  });
});

describe("visitor conversations", () => {
  it("creates a conversation on the first message and continues it with the same token", async () => {
    const session = await app.inject({ method: "POST", url: `/public/widget/${key}/session`, headers: { origin: CUSTOMER_SITE }, payload: {} });
    const token = session.json().visitorToken;
    expect(session.json().conversation).toBeNull();
    const first = await visitorSays(app, key, "Hi, is the shop open on Sunday?", token, CUSTOMER_SITE);
    expect(first.res.statusCode).toBe(201);
    const second = await visitorSays(app, key, "Also, do you deliver?", token, CUSTOMER_SITE);
    expect(second.conversationId).toBe(first.conversationId);
    const resumed = await app.inject({ method: "POST", url: `/public/widget/${key}/session`, headers: visitor(token), payload: {} });
    expect(resumed.json().conversation.id).toBe(first.conversationId);
    expect(resumed.json().messages).toHaveLength(2);
  });

  it("shows the conversation in the inbox as unread", async () => {
    const { conversationId } = await visitorSays(app, key, "Unread check", undefined, CUSTOMER_SITE);
    const list = (await as(app, owner).get("/conversations?unread=true")).json().items;
    expect(list.map((c: { id: string }) => c.id)).toContain(conversationId);
    await as(app, owner).post(`/conversations/${conversationId}/read`);
    const after = (await as(app, owner).get("/conversations?unread=true")).json().items;
    expect(after.map((c: { id: string }) => c.id)).not.toContain(conversationId);
  });

  it("rejects the honeypot field, link stuffing, oversize and duplicate messages", async () => {
    const token = "spam-token-0123456789abcdef";
    const honeypot = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "Buy now", website: "http://spam" } });
    expect(honeypot.statusCode).toBe(400);
    const links = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "http://a.x http://b.x http://c.x http://d.x" } });
    expect(links.statusCode).toBe(400);
    const huge = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "x".repeat(2001) } });
    expect(huge.statusCode).toBe(400);
    await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "Same message" } });
    const dup = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "Same message" } });
    expect(dup.statusCode).toBe(429);
  });

  it("requires an email first when the widget is configured to", async () => {
    await as(app, owner).patch("/widget/config", { requireEmail: true });
    const token = "email-token-0123456789abcdef";
    const missing = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "Hello" } });
    expect(missing.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, headers: visitor(token), payload: { body: "Hello", email: "Visitor@Example.com", name: "Vee" } });
    expect(ok.statusCode).toBe(201);
    const customers = (await as(app, owner).get("/customers?q=visitor@example.com")).json();
    expect(customers[0]).toMatchObject({ email: "visitor@example.com", name: "Vee" });
    await as(app, owner).patch("/widget/config", { requireEmail: false });
  });

  it("rate limits a flooding visitor", async () => {
    const token = "flood-token-0123456789abcdef";
    const ip = nextIp();
    let last = 0;
    for (let i = 0; i < 14; i++) {
      const res = await app.inject({ method: "POST", url: `/public/widget/${key}/messages`, remoteAddress: ip, headers: visitor(token), payload: { body: `Message ${i}` } });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });

  it("supports handoff and a rating after resolution", async () => {
    const { token, conversationId } = await visitorSays(app, key, "Question about beans", undefined, CUSTOMER_SITE);
    expect((await app.inject({ method: "POST", url: `/public/widget/${key}/handoff`, headers: visitor(token), payload: {} })).statusCode).toBe(200);
    const conv = (await as(app, owner).get(`/conversations/${conversationId}`)).json();
    expect(conv.needsHuman).toBe(true);

    const early = await app.inject({ method: "POST", url: `/public/widget/${key}/csat`, headers: visitor(token), payload: { rating: 5 } });
    expect(early.statusCode).toBe(400);
    await as(app, owner).patch(`/conversations/${conversationId}`, { status: "resolved" });
    const rated = await app.inject({ method: "POST", url: `/public/widget/${key}/csat`, headers: visitor(token), payload: { rating: 4, comment: "Quick help" } });
    expect(rated.statusCode).toBe(200);
    const twice = await app.inject({ method: "POST", url: `/public/widget/${key}/csat`, headers: visitor(token), payload: { rating: 1 } });
    expect(twice.statusCode).toBe(400);
    expect((await as(app, owner).get(`/conversations/${conversationId}`)).json().csatRating).toBe(4);
  });

  it("reopens a resolved conversation when the visitor writes again", async () => {
    const { token, conversationId } = await visitorSays(app, key, "First question", undefined, CUSTOMER_SITE);
    await as(app, owner).patch(`/conversations/${conversationId}`, { status: "resolved" });
    const again = await visitorSays(app, key, "One more thing", token, CUSTOMER_SITE);
    expect(again.conversationId).toBe(conversationId);
    expect((await as(app, owner).get(`/conversations/${conversationId}`)).json().status).toBe("open");
  });
});

describe("realtime", () => {
  let base: string;
  beforeAll(async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  const nextMessage = (socket: WebSocket, match: (data: Record<string, unknown>) => boolean) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for socket message")), 5000);
      socket.on("message", (raw) => {
        const data = JSON.parse(String(raw)) as Record<string, unknown>;
        if (match(data)) {
          clearTimeout(timer);
          resolve(data);
        }
      });
    });

  it("pushes agent replies to the visitor and visitor messages to the dashboard", async () => {
    const { token, conversationId } = await visitorSays(app, key, "Realtime hello", undefined, CUSTOMER_SITE);
    const visitorSocket = new WebSocket(`${base}/public/widget/${key}/ws?token=${token}&conversationId=${conversationId}`, { origin: CUSTOMER_SITE });
    await new Promise((r) => visitorSocket.once("open", r));
    const ticket = (await as(app, owner).post("/realtime/ticket")).json().ticket;
    const agentSocket = new WebSocket(`${base}/realtime?ticket=${ticket}`, { origin: WEB_ORIGIN });
    await nextMessage(agentSocket, (d) => d.type === "ready");

    const toVisitor = nextMessage(visitorSocket, (d) => d.type === "message");
    await as(app, owner).post(`/conversations/${conversationId}/messages`, { body: "Hi from the team" });
    expect(((await toVisitor).message as { body: string }).body).toBe("Hi from the team");

    const toAgent = nextMessage(agentSocket, (d) => d.type === "message.created");
    await visitorSays(app, key, "Thanks!", token, CUSTOMER_SITE);
    expect(((await toAgent).message as { body: string }).body).toBe("Thanks!");

    // Internal notes never reach the visitor socket.
    let leaked = false;
    visitorSocket.on("message", (raw) => {
      if (String(raw).includes("secret note")) leaked = true;
    });
    await as(app, owner).post(`/conversations/${conversationId}/messages`, { body: "secret note", internal: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
    visitorSocket.close();
    agentSocket.close();
  });

  it("rejects reused tickets, foreign origins and other visitors' conversations", async () => {
    const ticket = (await as(app, owner).post("/realtime/ticket")).json().ticket;
    const first = new WebSocket(`${base}/realtime?ticket=${ticket}`, { origin: WEB_ORIGIN });
    await nextMessage(first, (d) => d.type === "ready");
    const reuse = new WebSocket(`${base}/realtime?ticket=${ticket}`, { origin: WEB_ORIGIN });
    const reuseCode = await new Promise<number>((r) => reuse.on("close", (code) => r(code)));
    expect(reuseCode).toBe(4401);

    const ticket2 = (await as(app, owner).post("/realtime/ticket")).json().ticket;
    const foreign = new WebSocket(`${base}/realtime?ticket=${ticket2}`, { origin: "https://evil.example" });
    expect(await new Promise<number>((r) => foreign.on("close", (code) => r(code)))).toBe(4403);

    const a = await visitorSays(app, key, "Visitor A", undefined, CUSTOMER_SITE);
    const b = await visitorSays(app, key, "Visitor B", undefined, CUSTOMER_SITE);
    const snoop = new WebSocket(`${base}/public/widget/${key}/ws?token=${b.token}&conversationId=${a.conversationId}`, { origin: CUSTOMER_SITE });
    expect(await new Promise<number>((r) => snoop.on("close", (code) => r(code)))).toBe(4404);
    first.close();
  });
});

describe("spam resistance", () => {
  it("rotating visitor tokens doesn't bypass the per-IP message limit", async () => {
    const app2 = await createTestApp();
    const shop = await register(app2, "Spam Target");
    const shopKey = await widgetKey(app2, shop);
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await app2.inject({
        method: "POST",
        url: `/public/widget/${shopKey}/messages`,
        remoteAddress: ip,
        headers: { origin: WEB_ORIGIN, "x-visitor-token": `rotating-token-${i}-0123456789abcdef` },
        payload: { body: `Spam ${i}` },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(12);
    expect(statuses.at(-1)).toBe(429);
    await app2.close();
  });
});
