import { and, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getPlan, slugify } from "@supportflow/shared";
import type { DbOrTx } from "../db/client";
import {
  invitations,
  kbArticles,
  memberships,
  organizations,
  subscriptions,
  widgetConfigs,
} from "../db/schema";
import { audit } from "../lib/audit";
import { randomToken } from "../lib/crypto";
import { planLimit } from "../lib/errors";

export function newPublicKey(): string {
  return `pk_${randomToken(18)}`;
}

/** Creates a workspace with its owner, a Free subscription and a widget configuration. */
export async function createWorkspace(
  tx: DbOrTx,
  input: { name: string; ownerId: string; ip?: string | null; isDemo?: boolean; slug?: string },
) {
  const base = input.slug ?? slugify(input.name, 40);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
    if (!taken) break;
    slug = `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  }
  const [org] = await tx
    .insert(organizations)
    .values({ name: input.name, slug, isDemo: input.isDemo ?? false })
    .returning();
  if (!org) throw new Error("Workspace insert failed");
  if (!input.isDemo) {
    await tx.insert(memberships).values({ orgId: org.id, userId: input.ownerId, role: "owner" });
  }
  await tx.insert(subscriptions).values({ orgId: org.id, plan: "free" });
  await tx.insert(widgetConfigs).values({ orgId: org.id, publicKey: newPublicKey(), title: input.name });
  if (!input.isDemo) {
    await audit(tx, {
      orgId: org.id,
      actorUserId: input.ownerId,
      action: "workspace.created",
      targetType: "organization",
      targetId: org.id,
      ip: input.ip ?? null,
    });
  }
  return org;
}

export async function getOrgPlan(db: DbOrTx, orgId: string) {
  const [sub] = await db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, orgId));
  return getPlan(sub?.plan);
}

/** Members plus pending invitations, checked against the plan's seat limit. */
export async function assertSeatAvailable(db: DbOrTx, orgId: string, extraPending = 1): Promise<void> {
  const plan = await getOrgPlan(db, orgId);
  const [members] = await db.select({ n: count() }).from(memberships).where(eq(memberships.orgId, orgId));
  const [pending] = await db
    .select({ n: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.orgId, orgId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  const used = (members?.n ?? 0) + (pending?.n ?? 0);
  if (used + extraPending > plan.limits.seats) {
    throw planLimit(
      `The ${plan.name} plan includes ${plan.limits.seats} seats, counting pending invitations. Upgrade to add more people.`,
    );
  }
}

export async function assertArticleCapacity(db: DbOrTx, orgId: string, adding = 1): Promise<void> {
  const plan = await getOrgPlan(db, orgId);
  if (plan.limits.articles === null) return;
  const [row] = await db
    .select({ n: count() })
    .from(kbArticles)
    .where(and(eq(kbArticles.orgId, orgId), ne(kbArticles.status, "archived")));
  if ((row?.n ?? 0) + adding > plan.limits.articles) {
    throw planLimit(
      `The ${plan.name} plan includes ${plan.limits.articles} active articles. Archive some or upgrade your plan.`,
    );
  }
}

export async function nextTicketNumber(tx: DbOrTx, orgId: string): Promise<number> {
  const [row] = await tx
    .update(organizations)
    .set({ ticketSeq: sql`${organizations.ticketSeq} + 1` })
    .where(eq(organizations.id, orgId))
    .returning({ seq: organizations.ticketSeq });
  if (!row) throw new Error("Workspace not found");
  return row.seq;
}
