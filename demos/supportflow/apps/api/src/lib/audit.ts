import type { DbOrTx } from "../db/client";
import { auditLogs } from "../db/schema";

export interface AuditEntry {
  orgId: string;
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Records an administrative action. Call inside the same transaction as the change. */
export async function audit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: entry.orgId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
}
