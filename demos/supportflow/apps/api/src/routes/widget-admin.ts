import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { widgetConfigSchema, type WidgetConfigDto } from "@supportflow/shared";
import type { AppContext } from "../context";
import { widgetConfigs } from "../db/schema";
import { audit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { parse } from "../lib/validate";
import { requireMember } from "../plugins/auth";
import { getOrgPlan, newPublicKey } from "../services/workspace";

export function toWidgetConfigDto(row: typeof widgetConfigs.$inferSelect, removeBranding: boolean): WidgetConfigDto {
  return {
    publicKey: row.publicKey,
    enabled: row.enabled,
    brandColor: row.brandColor,
    title: row.title,
    greeting: row.greeting,
    launcherLabel: row.launcherLabel,
    position: row.position,
    allowedOrigins: row.allowedOrigins,
    requireEmail: row.requireEmail,
    showBranding: !removeBranding,
  };
}

export function widgetAdminRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    const load = async (orgId: string) => {
      const [row] = await ctx.db.select().from(widgetConfigs).where(eq(widgetConfigs.orgId, orgId));
      if (!row) throw notFound("Widget configuration");
      const plan = await getOrgPlan(ctx.db, orgId);
      return {
        config: toWidgetConfigDto(row, plan.features.removeBranding),
        scriptUrl: `${ctx.config.API_PUBLIC_URL}/widget.js`,
        apiUrl: ctx.config.API_PUBLIC_URL,
        removeBrandingAvailable: plan.features.removeBranding,
      };
    };

    app.get("/widget/config", async (request) => {
      const member = await requireMember(ctx, request);
      return load(member.orgId);
    });

    app.patch("/widget/config", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const input = parse(widgetConfigSchema, request.body);
      const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      if (Object.keys(changes).length === 0) throw badRequest("Nothing to update");
      if (input.allowedOrigins) changes.allowedOrigins = [...new Set(input.allowedOrigins)];
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(widgetConfigs)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(widgetConfigs.orgId, member.orgId));
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "widget.updated",
          targetType: "widget",
          targetId: member.orgId,
          metadata: changes,
          ip: request.clientIp,
        });
      });
      return load(member.orgId);
    });

    app.post("/widget/config/rotate-key", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(widgetConfigs)
          .set({ publicKey: newPublicKey(), updatedAt: new Date() })
          .where(eq(widgetConfigs.orgId, member.orgId));
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "widget.key_rotated",
          targetType: "widget",
          targetId: member.orgId,
          ip: request.clientIp,
        });
      });
      return load(member.orgId);
    });

  };
}
