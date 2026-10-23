import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { auditLogs, contactRequests, conversations, customers, organizations, sessions } from "../db/schema";
import { audit } from "../lib/audit";

/**
 * Deletes resolved conversations (and their messages) older than the retention period,
 * then customers left without any conversation.
 */
export async function purgeOrgRetention(db: Database, orgId: string, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  const deleted = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.orgId, orgId),
        eq(conversations.status, "resolved"),
        lt(conversations.lastMessageAt, cutoff),
      ),
    )
    .returning({ id: conversations.id });
  await db.execute(sql`
    delete from ${customers} c
    where c.org_id = ${orgId}
      and c.created_at < ${cutoff.toISOString()}::timestamptz
      and not exists (select 1 from ${conversations} v where v.customer_id = c.id)
  `);
  return deleted.length;
}

/** Deletes every conversation in the demo workspace older than `hours`, whatever its status. */
export async function purgeDemo(db: Database, hours: number): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const demoOrgs = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.isDemo, true));
  if (demoOrgs.length === 0) return 0;
  const ids = demoOrgs.map((o) => o.id);
  const deleted = await db
    .delete(conversations)
    .where(and(inArray(conversations.orgId, ids), lt(conversations.createdAt, cutoff)))
    .returning({ id: conversations.id });
  await db.delete(customers).where(and(inArray(customers.orgId, ids), lt(customers.lastSeenAt, cutoff)));
  return deleted.length;
}

/** Hourly maintenance: retention policies, demo cleanup and expired sessions. */
export async function runMaintenance(db: Database, demoRetentionHours: number) {
  const orgs = await db
    .select({ id: organizations.id, days: organizations.retentionDays })
    .from(organizations)
    .where(and(isNotNull(organizations.retentionDays), eq(organizations.isDemo, false)));
  let conversationsDeleted = 0;
  for (const org of orgs) {
    if (!org.days) continue;
    const n = await purgeOrgRetention(db, org.id, org.days);
    if (n > 0) {
      conversationsDeleted += n;
      await audit(db, {
        orgId: org.id,
        actorUserId: null,
        action: "retention.purged",
        targetType: "organization",
        targetId: org.id,
        metadata: { conversations: n, retentionDays: org.days, trigger: "schedule" },
      });
    }
  }
  const demoDeleted = await purgeDemo(db, demoRetentionHours);
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  // Audit entries and contact-form messages are kept for a year.
  const yearAgo = new Date(Date.now() - 365 * 86400_000);
  await db.delete(auditLogs).where(lt(auditLogs.createdAt, yearAgo));
  await db.delete(contactRequests).where(lt(contactRequests.createdAt, yearAgo));
  return { conversationsDeleted, demoDeleted };
}
