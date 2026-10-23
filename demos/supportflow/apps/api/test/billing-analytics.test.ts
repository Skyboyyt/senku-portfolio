import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signStripePayload, verifyStripeSignature } from "../src/billing/stripe-signature";
import { loadConfig } from "../src/config";
import { as, createTestApp, register, resetDatabase, visitorSays, widgetKey, type Actor } from "./helpers";

const STRIPE = {
  BILLING_MODE: "stripe",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_BUSINESS: "price_business",
};

beforeAll(async () => resetDatabase());

describe("Stripe signature verification", () => {
  it("accepts valid signatures and rejects tampering or stale timestamps", () => {
    const body = '{"id":"evt_1"}';
    const header = signStripePayload(body, "secret");
    expect(verifyStripeSignature(body, header, "secret")).toBe(true);
    expect(verifyStripeSignature(`${body} `, header, "secret")).toBe(false);
    expect(verifyStripeSignature(body, header, "other")).toBe(false);
    const old = signStripePayload(body, "secret", Math.floor(Date.now() / 1000) - 3600);
    expect(verifyStripeSignature(body, old, "secret")).toBe(false);
    expect(verifyStripeSignature(body, undefined, "secret")).toBe(false);
  });
});

describe("configuration safety", () => {
  const base = { DATABASE_URL: "postgres://x", WEB_ORIGIN: "https://app.example.com", PROXY_SHARED_SECRET: "x".repeat(32) };
  it("refuses test billing in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", BILLING_MODE: "test" })).toThrow(/not allowed in production/);
  });
  it("requires Stripe settings in stripe mode and the proxy secret in production", () => {
    expect(() => loadConfig({ ...base, BILLING_MODE: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => loadConfig({ DATABASE_URL: "postgres://x", WEB_ORIGIN: "https://a.b", NODE_ENV: "production" })).toThrow(/PROXY_SHARED_SECRET/);
  });
  it("picks a provider from available keys", () => {
    expect(loadConfig({ ...base }).aiProvider).toBe("extractive");
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: "k" }).aiProvider).toBe("anthropic");
  });
});

describe("billing in test mode", () => {
  let app: FastifyInstance;
  let owner: Actor;
  beforeAll(async () => {
    app = await createTestApp();
    owner = await register(app, "Plan Shop");
  });
  afterAll(async () => app.close());

  it("changes plans without payment and reports usage", async () => {
    expect((await as(app, owner).get("/billing")).json()).toMatchObject({ plan: "free", billingMode: "test", provider: "none" });
    await as(app, owner).post("/billing/test/change-plan", { plan: "pro" });
    const after = (await as(app, owner).get("/billing")).json();
    expect(after).toMatchObject({ plan: "pro", provider: "test" });
    expect(after.usage.seats).toBe(1);
    expect((await as(app, owner).post("/billing/checkout", { plan: "pro" })).statusCode).toBe(400);
  });
});

describe("billing with Stripe", () => {
  let app: FastifyInstance;
  let owner: Actor;
  const calls: { url: string; body: string }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? "") });
    if (url.endsWith("/checkout/sessions")) return Response.json({ url: "https://checkout.stripe.com/c/test_123" });
    if (url.includes("/subscriptions/sub_123")) {
      return Response.json({
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_pro" }, current_period_end: 1893456000 }] },
      });
    }
    return Response.json({ error: { message: "unexpected" } }, { status: 400 });
  };

  beforeAll(async () => {
    app = await createTestApp({ config: STRIPE, fetchImpl: fakeFetch });
    owner = await register(app, "Stripe Shop");
  });
  afterAll(async () => app.close());

  const webhook = (event: Record<string, unknown>, secret = STRIPE.STRIPE_WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    return app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": signStripePayload(payload, secret) },
      payload,
    });
  };

  it("creates a Checkout session but does not change the plan before payment", async () => {
    const res = await as(app, owner).post("/billing/checkout", { plan: "pro" });
    expect(res.json().url).toBe("https://checkout.stripe.com/c/test_123");
    expect(calls[0]!.body).toContain("price_pro");
    expect(calls[0]!.body).toContain(owner.orgId);
    expect((await as(app, owner).get("/billing")).json().plan).toBe("free");
    expect((await as(app, owner).post("/billing/test/change-plan", { plan: "pro" })).statusCode).toBe(400);
  });

  it("rejects unsigned webhooks", async () => {
    const res = await webhook({ id: "evt_bad", type: "checkout.session.completed", data: { object: {} } }, "wrong");
    expect(res.statusCode).toBe(400);
  });

  it("upgrades on a verified checkout webhook, once", async () => {
    const event = {
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: owner.orgId, subscription: "sub_123" } },
    };
    expect((await webhook(event)).statusCode).toBe(200);
    const billing = (await as(app, owner).get("/billing")).json();
    expect(billing).toMatchObject({ plan: "pro", provider: "stripe", status: "active" });
    expect(billing.currentPeriodEnd).toBe("2030-01-01T00:00:00.000Z");
    const before = calls.length;
    expect((await webhook(event)).statusCode).toBe(200);
    expect(calls.length).toBe(before);
  });

  it("downgrades to Free when the subscription is deleted", async () => {
    const res = await webhook({
      id: "evt_deleted_1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_123", customer: "cus_123", status: "canceled", cancel_at_period_end: false, metadata: { orgId: owner.orgId }, items: { data: [{ price: { id: "price_pro" } }] } } },
    });
    expect(res.statusCode).toBe(200);
    expect((await as(app, owner).get("/billing")).json()).toMatchObject({ plan: "free", status: "canceled" });
  });
});

describe("analytics", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it("shows zeros and nulls for an empty workspace instead of invented numbers", async () => {
    const owner = await register(app, "Empty Analytics");
    const overview = (await as(app, owner).get("/analytics/overview?days=30")).json();
    expect(overview.totals).toEqual({
      conversations: 0,
      openConversations: 0,
      aiAssistedConversations: 0,
      openTickets: 0,
      resolvedTickets: 0,
      medianFirstResponseSeconds: null,
      medianResolutionSeconds: null,
    });
    const analytics = (await as(app, owner).get("/analytics?days=7")).json();
    expect(analytics.daily).toHaveLength(7);
    expect(analytics.escalationRate).toBeNull();
    expect(analytics.csat).toBeNull();
  });

  it("counts real activity", async () => {
    const owner = await register(app, "Busy Analytics");
    const key = await widgetKey(app, owner);
    const a = await visitorSays(app, key, "First conversation");
    await visitorSays(app, key, "Second conversation");
    await as(app, owner).post(`/conversations/${a.conversationId}/messages`, { body: "Reply" });
    await as(app, owner).patch(`/conversations/${a.conversationId}`, { status: "resolved" });
    await as(app, owner).post("/tickets", { title: "Analytics ticket" });
    const overview = (await as(app, owner).get("/analytics/overview?days=7")).json();
    expect(overview.totals.conversations).toBe(2);
    expect(overview.totals.openConversations).toBe(1);
    expect(overview.totals.openTickets).toBe(1);
    expect(overview.totals.medianFirstResponseSeconds).not.toBeNull();
    expect(overview.workload[0].openConversations).toBe(0);
    const today = (await as(app, owner).get("/analytics?days=7")).json().daily.at(-1);
    expect(today.conversations).toBe(2);
    expect(today.ticketsOpened).toBe(1);
    expect((await as(app, owner).get("/analytics?days=12")).statusCode).toBe(400);
  });
});
