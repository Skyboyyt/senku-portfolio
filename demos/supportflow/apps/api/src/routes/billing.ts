import { and, count, eq, ne } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { checkoutSchema, PLAN_IDS, type SubscriptionDto } from "@supportflow/shared";
import { z } from "zod";
import { monthlyAiUsage } from "../ai/assistant";
import type { AppContext } from "../context";
import { kbArticles, memberships, subscriptions } from "../db/schema";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import { parse } from "../lib/validate";
import { requireMember } from "../plugins/auth";

export function billingRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    const returnUrl = `${ctx.config.WEB_ORIGIN[0]}/app/billing`;

    app.get("/billing", async (request): Promise<SubscriptionDto> => {
      const member = await requireMember(ctx, request);
      const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.orgId, member.orgId));
      if (!sub) throw notFound("Subscription");
      const [seats] = await ctx.db.select({ n: count() }).from(memberships).where(eq(memberships.orgId, member.orgId));
      const [articles] = await ctx.db
        .select({ n: count() })
        .from(kbArticles)
        .where(and(eq(kbArticles.orgId, member.orgId), ne(kbArticles.status, "archived")));
      return {
        plan: sub.plan,
        status: sub.status,
        provider: sub.provider,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        billingMode: ctx.billing.mode,
        usage: {
          aiResponses: await monthlyAiUsage(ctx.db, member.orgId),
          seats: seats?.n ?? 0,
          articles: articles?.n ?? 0,
        },
      };
    });

    app.post("/billing/checkout", async (request) => {
      const member = await requireMember(ctx, request, "owner");
      const { plan } = parse(checkoutSchema, request.body);
      const url = await ctx.billing.createCheckout(member.orgId, plan, member.user.email, returnUrl);
      return { url };
    });

    app.post("/billing/portal", async (request) => {
      const member = await requireMember(ctx, request, "owner");
      return { url: await ctx.billing.createPortal(member.orgId, returnUrl) };
    });

    /** Test mode only: switch plans immediately, without payment. */
    app.post("/billing/test/change-plan", async (request) => {
      const member = await requireMember(ctx, request, "owner");
      const { plan } = parse(z.object({ plan: z.enum(PLAN_IDS) }), request.body);
      await ctx.billing.changePlanInTestMode(member.orgId, plan);
      await audit(ctx.db, {
        orgId: member.orgId,
        actorUserId: member.user.id,
        action: "billing.plan_changed",
        targetType: "subscription",
        targetId: member.orgId,
        metadata: { plan, mode: "test", charged: false },
        ip: request.clientIp,
      });
      return { ok: true };
    });

    // Stripe webhooks need the exact raw body to verify the signature.
    await app.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
      scope.post(
        "/billing/webhook",
        { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
        async (request) => {
          const signature = request.headers["stripe-signature"];
          const changed = await ctx.billing.handleWebhook(
            String(request.body ?? ""),
            typeof signature === "string" ? signature : undefined,
          );
          if (changed) {
            await audit(ctx.db, {
              orgId: changed.orgId,
              actorUserId: null,
              action: "billing.plan_changed",
              targetType: "subscription",
              targetId: changed.orgId,
              metadata: { plan: changed.plan, mode: "stripe" },
            });
          }
          return { received: true };
        },
      );
    });

  };
}
