import { and, desc, eq, lt } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { createOrgSchema, deleteOrgSchema, updateOrgSchema, type AuditLogDto } from "@supportflow/shared";
import type { AppContext } from "../context";
import { auditLogs, organizations, sessions, users } from "../db/schema";
import { audit } from "../lib/audit";
import { badRequest, notFound, planLimit } from "../lib/errors";
import { parse } from "../lib/validate";
import { requireMember, requireUser } from "../plugins/auth";
import { purgeOrgRetention } from "../services/retention";
import { buildSessionDto, toOrgDto } from "../services/session-dto";
import { createWorkspace, getOrgPlan } from "../services/workspace";

export function orgRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.post("/orgs", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
      const session = requireUser(request);
      const { name } = parse(createOrgSchema, request.body);
      const org = await ctx.db.transaction((tx) =>
        createWorkspace(tx, { name, ownerId: session.user.id, ip: request.clientIp }),
      );
      await ctx.db.update(sessions).set({ activeOrgId: org.id }).where(eq(sessions.id, session.id));
      return reply.status(201).send(await buildSessionDto(ctx, { ...session, activeOrgId: org.id }));
    });

    app.get("/org", async (request) => {
      const member = await requireMember(ctx, request);
      const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, member.orgId));
      if (!org) throw notFound("Workspace");
      return toOrgDto(org);
    });

    app.patch("/org", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const input = parse(updateOrgSchema, request.body);
      if (input.aiMode === "auto") {
        const plan = await getOrgPlan(ctx.db, member.orgId);
        if (!plan.features.autoReply) {
          throw planLimit(`Automatic replies are not included in the ${plan.name} plan. Upgrade to Starter or above.`);
        }
      }
      const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      if (Object.keys(changes).length === 0) throw badRequest("Nothing to update");
      const org = await ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(organizations)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(organizations.id, member.orgId))
          .returning();
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "settings.updated",
          targetType: "organization",
          targetId: member.orgId,
          // Record which settings changed; free-text instructions are summarized, not copied.
          metadata: Object.fromEntries(
            Object.entries(changes).map(([k, v]) => [k, k === "aiInstructions" ? "(updated)" : v]),
          ),
          ip: request.clientIp,
        });
        return updated;
      });
      if (!org) throw notFound("Workspace");
      return toOrgDto(org);
    });

    app.delete("/org", async (request, reply) => {
      const member = await requireMember(ctx, request, "owner");
      const { confirmName } = parse(deleteOrgSchema, request.body);
      const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, member.orgId));
      if (!org) throw notFound("Workspace");
      if (confirmName !== org.name) {
        throw badRequest("Type the workspace name exactly to confirm", { confirmName: "Name does not match" });
      }
      // Cascades to every record that belongs to the workspace.
      await ctx.db.delete(organizations).where(eq(organizations.id, org.id));
      request.log.warn({ orgId: org.id, actor: member.user.id }, "Workspace deleted");
      return reply.status(204).send();
    });

    app.get("/org/audit-logs", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const { before } = (request.query ?? {}) as { before?: string };
      const beforeDate = before ? new Date(before) : null;
      const rows = await ctx.db
        .select({ log: auditLogs, actorName: users.name })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(
          and(
            eq(auditLogs.orgId, member.orgId),
            beforeDate && !Number.isNaN(beforeDate.getTime()) ? lt(auditLogs.createdAt, beforeDate) : undefined,
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(51);
      const items: AuditLogDto[] = rows.slice(0, 50).map(({ log, actorName }) => ({
        id: log.id,
        action: log.action,
        actor: log.actorUserId && actorName ? { id: log.actorUserId, name: actorName } : null,
        targetType: log.targetType,
        targetId: log.targetId,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      }));
      return { items, nextCursor: rows.length > 50 ? (items.at(-1)?.createdAt ?? null) : null };
    });

    app.post("/org/retention/run", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, member.orgId));
      if (!org) throw notFound("Workspace");
      if (!org.retentionDays) throw badRequest("Set a retention period first");
      const deleted = await purgeOrgRetention(ctx.db, org.id, org.retentionDays);
      await audit(ctx.db, {
        orgId: org.id,
        actorUserId: member.user.id,
        action: "retention.purged",
        targetType: "organization",
        targetId: org.id,
        metadata: { conversations: deleted, retentionDays: org.retentionDays, trigger: "manual" },
        ip: request.clientIp,
      });
      return { deletedConversations: deleted };
    });
  };
}
