import { eq } from "drizzle-orm";
import type { PlanId } from "@supportflow/shared";
import type { Config } from "../config";
import type { Database } from "../db/client";
import { billingEvents, subscriptions } from "../db/schema";
import { AppError, badRequest, unavailable } from "../lib/errors";
import { verifyStripeSignature } from "./stripe-signature";

type PaidPlan = Exclude<PlanId, "free">;
type SubscriptionStatus = (typeof subscriptions.$inferSelect)["status"];

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items: { data: { price: { id: string }; current_period_end?: number }[] };
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Subscription billing.
 *
 * - `stripe`: Stripe Checkout and Customer Portal. Plans change only when a verified
 *   webhook says so; the API never trusts the browser about payment.
 * - `test`: development only. Plan changes apply immediately without payment, and the UI
 *   labels them as test changes. Refused at startup in production.
 * - `disabled`: plans are shown but cannot be changed.
 */
export class BillingService {
  constructor(
    /** Read on every use: on Cloudflare Workers the connection is per request. */
    private readonly source: { readonly db: Database },
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get db(): Database {
    return this.source.db;
  }

  get mode(): Config["BILLING_MODE"] {
    return this.config.BILLING_MODE;
  }

  private priceFor(plan: PaidPlan): string {
    const price = {
      starter: this.config.STRIPE_PRICE_STARTER,
      pro: this.config.STRIPE_PRICE_PRO,
      business: this.config.STRIPE_PRICE_BUSINESS,
    }[plan];
    if (!price) throw unavailable("Billing is not configured for this plan");
    return price;
  }

  private planForPrice(priceId: string | undefined): PlanId | null {
    if (!priceId) return null;
    if (priceId === this.config.STRIPE_PRICE_STARTER) return "starter";
    if (priceId === this.config.STRIPE_PRICE_PRO) return "pro";
    if (priceId === this.config.STRIPE_PRICE_BUSINESS) return "business";
    return null;
  }

  private async stripe<T>(method: "GET" | "POST", path: string, form?: Record<string, string>): Promise<T> {
    const response = await this.fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.STRIPE_SECRET_KEY ?? ""}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!response.ok) {
      throw new AppError(502, "billing_provider_error", body.error?.message ?? "Stripe request failed");
    }
    return body;
  }

  async createCheckout(orgId: string, plan: PaidPlan, email: string, returnUrl: string): Promise<string> {
    if (this.mode !== "stripe") throw badRequest("Checkout is only available with Stripe billing");
    const [sub] = await this.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
    if (sub?.providerSubscriptionId && sub.status !== "canceled") {
      throw badRequest("This workspace already has a subscription. Use Manage billing to change plans.");
    }
    const form: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": this.priceFor(plan),
      "line_items[0][quantity]": "1",
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=cancelled`,
      client_reference_id: orgId,
      "metadata[orgId]": orgId,
      "subscription_data[metadata][orgId]": orgId,
    };
    if (sub?.providerCustomerId) form.customer = sub.providerCustomerId;
    else form.customer_email = email;
    const session = await this.stripe<{ url: string }>("POST", "/checkout/sessions", form);
    return session.url;
  }

  async createPortal(orgId: string, returnUrl: string): Promise<string> {
    if (this.mode !== "stripe") throw badRequest("The billing portal is only available with Stripe billing");
    const [sub] = await this.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
    if (!sub?.providerCustomerId) throw badRequest("This workspace has no billing account yet");
    const portal = await this.stripe<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: sub.providerCustomerId,
      return_url: returnUrl,
    });
    return portal.url;
  }

  /** Development-only plan change without payment. */
  async changePlanInTestMode(orgId: string, plan: PlanId): Promise<void> {
    if (this.mode !== "test" || this.config.isProduction) {
      throw badRequest("Test-mode plan changes are disabled on this server");
    }
    await this.db
      .update(subscriptions)
      .set({
        plan,
        status: "active",
        provider: plan === "free" ? "none" : "test",
        currentPeriodEnd: plan === "free" ? null : new Date(Date.now() + 30 * 86400_000),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.orgId, orgId));
  }

  /**
   * Applies a Stripe webhook. Returns the org whose plan changed, if any.
   * Throws 400 on a bad signature; duplicate events are acknowledged and ignored.
   */
  async handleWebhook(rawBody: string, signature: string | undefined): Promise<{ orgId: string; plan: PlanId } | null> {
    if (this.mode !== "stripe" || !this.config.STRIPE_WEBHOOK_SECRET) {
      throw badRequest("Stripe billing is not enabled");
    }
    if (!verifyStripeSignature(rawBody, signature, this.config.STRIPE_WEBHOOK_SECRET)) {
      throw new AppError(400, "invalid_signature", "Invalid webhook signature");
    }
    const event = JSON.parse(rawBody) as StripeEvent;
    const [seen] = await this.db.select().from(billingEvents).where(eq(billingEvents.id, event.id));
    if (seen) return null;
    const result = await this.applyEvent(event);
    // Recorded only after success, so Stripe's retry of a failed delivery is processed again.
    await this.db.insert(billingEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
    return result;
  }

  private async applyEvent(event: StripeEvent): Promise<{ orgId: string; plan: PlanId } | null> {
    const object = event.data.object;
    switch (event.type) {
      case "checkout.session.completed": {
        const orgId = (object.client_reference_id as string | null) ?? null;
        const subscriptionId = object.subscription as string | null;
        if (!orgId || !subscriptionId) return null;
        const subscription = await this.stripe<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`);
        return this.applySubscription(orgId, subscription);
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = object as unknown as StripeSubscription;
        const orgId = subscription.metadata?.orgId ?? (await this.orgForCustomer(subscription.customer));
        if (!orgId) return null;
        if (event.type === "customer.subscription.deleted") subscription.status = "canceled";
        return this.applySubscription(orgId, subscription);
      }
      default:
        return null;
    }
  }

  private async orgForCustomer(customerId: string): Promise<string | null> {
    const [sub] = await this.db
      .select({ orgId: subscriptions.orgId })
      .from(subscriptions)
      .where(eq(subscriptions.providerCustomerId, customerId));
    return sub?.orgId ?? null;
  }

  private async applySubscription(orgId: string, subscription: StripeSubscription) {
    const item = subscription.items.data[0];
    const status = mapStatus(subscription.status);
    // A canceled or unpaid subscription drops the workspace to Free limits.
    const plan: PlanId =
      status === "canceled" ? "free" : (this.planForPrice(item?.price.id) ?? "free");
    const periodEnd = subscription.current_period_end ?? item?.current_period_end;
    await this.db
      .update(subscriptions)
      .set({
        plan,
        status,
        provider: "stripe",
        providerCustomerId: subscription.customer,
        providerSubscriptionId: subscription.id,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.orgId, orgId));
    return { orgId, plan };
  }
}

function mapStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}
