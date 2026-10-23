import { desc, eq } from "drizzle-orm";
import type { OrgDto, SessionDto } from "@supportflow/shared";
import type { AppContext } from "../context";
import { memberships, organizations, subscriptions } from "../db/schema";
import type { SessionState } from "../plugins/auth";

export function toOrgDto(org: typeof organizations.$inferSelect): OrgDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    aiMode: org.aiMode,
    aiConfidenceThreshold: org.aiConfidenceThreshold,
    aiInstructions: org.aiInstructions,
    retentionDays: org.retentionDays,
    collectCsat: org.collectCsat,
    createdAt: org.createdAt.toISOString(),
  };
}

export async function buildSessionDto(ctx: AppContext, session: SessionState): Promise<SessionDto> {
  const rows = await ctx.db
    .select({ org: organizations, role: memberships.role, plan: subscriptions.plan })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .leftJoin(subscriptions, eq(subscriptions.orgId, memberships.orgId))
    .where(eq(memberships.userId, session.user.id))
    .orderBy(desc(memberships.createdAt));
  const active = rows.find((r) => r.org.id === session.activeOrgId) ?? null;
  return {
    user: session.user,
    organization: active ? toOrgDto(active.org) : null,
    role: active?.role ?? null,
    organizations: rows.map((r) => ({ id: r.org.id, name: r.org.name, slug: r.org.slug, role: r.role })),
    plan: active?.plan ?? "free",
    ai: {
      provider: ctx.ai.provider.name,
      model: ctx.ai.provider.model,
      available: ctx.ai.available,
    },
  };
}
