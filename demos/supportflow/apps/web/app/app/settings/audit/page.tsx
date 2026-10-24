"use client";

import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import type { AuditLogDto, Paginated } from "@supportflow/shared";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

const ACTIONS: Record<string, string> = {
  "workspace.created": "created the workspace",
  "settings.updated": "changed workspace settings",
  "member.invited": "invited a member",
  "member.joined": "joined the workspace",
  "member.role_changed": "changed a member's role",
  "member.removed": "removed a member",
  "member.left": "left the workspace",
  "invitation.revoked": "withdrew an invitation",
  "article.published": "published an article",
  "article.unpublished": "unpublished an article",
  "article.archived": "archived an article",
  "article.updated": "edited a published article",
  "article.deleted": "deleted an article",
  "articles.imported": "imported articles",
  "articles.reindexed": "re-indexed the knowledge base",
  "widget.updated": "changed the chat widget",
  "widget.key_rotated": "rotated the widget key",
  "customer.deleted": "deleted a customer's data",
  "retention.purged": "deleted old conversations",
  "billing.plan_changed": "changed the plan",
  "ticket.created": "created a ticket",
  "ticket.deleted": "deleted a ticket",
  "ticket.status_changed": "changed a ticket's status",
  "ticket.priority_changed": "changed a ticket's priority",
  "ticket.owner_changed": "reassigned a ticket",
  "ticket.edited": "edited a ticket",
};

function details(log: AuditLogDto): string {
  const m = log.metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.title === "string") parts.push(`“${m.title}”`);
  if (typeof m.email === "string") parts.push(m.email);
  if (m.from && m.to) parts.push(`${String(m.from)} → ${String(m.to)}`);
  if (typeof m.plan === "string") parts.push(`${m.plan}${m.mode === "test" ? " (test mode, not charged)" : ""}`);
  if (typeof m.conversations === "number") parts.push(`${m.conversations} conversations`);
  if (typeof m.conversationsDeleted === "number") parts.push(`${m.conversationsDeleted} conversations`);
  if (typeof m.count === "number") parts.push(`${m.count} articles`);
  if (log.action === "settings.updated") parts.push(Object.keys(m).join(", "));
  return parts.join(" · ");
}

export default function AuditLogPage() {
  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<Paginated<AuditLogDto>>(
    (index, previous: Paginated<AuditLogDto> | null) => {
      if (previous && !previous.nextCursor) return null;
      return index === 0 ? "/org/audit-logs" : `/org/audit-logs?before=${encodeURIComponent(previous!.nextCursor!)}`;
    },
  );
  const items = data?.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Administrative actions in this workspace, kept for one year."
        actions={
          <Link href="/app/settings" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden /> Settings
          </Link>
        }
      />
      <PageBody>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : items.length === 0 ? (
            <EmptyState icon={ScrollText} title="No entries yet" />
          ) : (
            <ol className="divide-y divide-border">
              {items.map((log) => (
                <li key={log.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-4 sm:px-5">
                  <time dateTime={log.createdAt} className="w-36 shrink-0 text-[13px] tabular-nums text-subtle">{formatDateTime(log.createdAt)}</time>
                  <p className="min-w-0 text-text">
                    <span className="font-medium">{log.actor?.name ?? "System"}</span> {ACTIONS[log.action] ?? log.action}
                    {details(log) && <span className="text-muted"> · {details(log)}</span>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
        {data?.at(-1)?.nextCursor && (
          <Button variant="secondary" className="mt-4" loading={isValidating} onClick={() => void setSize(size + 1)}>
            Load older entries
          </Button>
        )}
      </PageBody>
    </>
  );
}
