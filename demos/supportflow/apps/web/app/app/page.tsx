"use client";

import { Check, CircleDashed, Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { formatDuration, getPlan, type ConversationListItemDto, type OverviewDto, type Paginated, type WidgetConfigDto } from "@supportflow/shared";
import { Meter, StatStrip } from "@/components/app/charts";
import { PageBody, PageHeader, Panel } from "@/components/app/page-header";
import { RangeSelect } from "@/components/app/range-select";
import { useSession } from "@/components/app/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { customerLabel, relativeTime } from "@/lib/utils";

export default function OverviewPage() {
  const { session } = useSession();
  const [days, setDays] = useState(30);
  const overview = useSWR<OverviewDto>(`/analytics/overview?days=${days}`);
  const attention = useSWR<Paginated<ConversationListItemDto>>("/conversations?status=open&needsHuman=true&limit=5");
  const firstName = session.user.name.split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        description={`Here's how ${session.organization?.name} is doing.`}
        actions={<RangeSelect value={days} onChange={setDays} />}
      />
      <PageBody className="space-y-6">
        <SetupChecklist />

        {overview.error ? (
          <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.mutate()} />
        ) : !overview.data ? (
          <Skeleton className="h-[104px] w-full rounded-lg" />
        ) : (
          <StatStrip
            items={[
              { label: "Conversations", value: overview.data.totals.conversations.toLocaleString("en-US"), hint: `Started in ${days} days` },
              { label: "Open now", value: overview.data.totals.openConversations.toLocaleString("en-US"), hint: "Not yet resolved" },
              { label: "AI-assisted", value: overview.data.totals.aiAssistedConversations.toLocaleString("en-US"), hint: "Got an AI reply or draft" },
              { label: "Open tickets", value: overview.data.totals.openTickets.toLocaleString("en-US") },
              { label: "Tickets resolved", value: overview.data.totals.resolvedTickets.toLocaleString("en-US"), hint: `In ${days} days` },
              { label: "First response", value: formatDuration(overview.data.totals.medianFirstResponseSeconds), hint: "Median" },
              { label: "Resolution time", value: formatDuration(overview.data.totals.medianResolutionSeconds), hint: "Median" },
            ]}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel
            title="Waiting for a person"
            description="Conversations the AI handed over or the customer escalated"
            actions={
              <Link href="/app/inbox?view=needsHuman" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Open inbox
              </Link>
            }
            bodyClassName="p-0 sm:p-0"
          >
            {attention.error ? (
              <ErrorState message={errorMessage(attention.error)} onRetry={() => void attention.mutate()} />
            ) : !attention.data ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : attention.data.items.length === 0 ? (
              <EmptyState icon={Inbox} title="Nobody is waiting">
                Escalated conversations will appear here as soon as they arrive.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {attention.data.items.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                      <Avatar name={customerLabel(c.customer)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{customerLabel(c.customer)}</p>
                        <p className="truncate text-[13px] text-muted">{c.lastMessagePreview}</p>
                      </div>
                      <span className="shrink-0 text-xs text-subtle">{relativeTime(c.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Plan usage" description={`${getPlan(session.plan).name} plan · this month`}>
            {overview.data ? (
              <div className="space-y-5">
                <Meter
                  label="AI responses"
                  value={overview.data.usage.aiResponses}
                  max={overview.data.usage.aiLimit}
                  hint="Resets on the 1st of each month (UTC)."
                />
                <Meter label="Seats" value={overview.data.usage.seats} max={overview.data.usage.seatLimit} />
                <Link href="/app/billing" className="inline-flex min-h-9 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Manage plan
                </Link>
              </div>
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </Panel>
        </div>

        <Panel title="Team workload" description="Open conversations and tickets assigned to each person" bodyClassName="p-0 sm:p-0">
          {!overview.data ? (
            <div className="p-5">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[13px] text-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Person</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">Open conversations</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">Open tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.data.workload.map((w) => (
                    <tr key={w.userId} className="border-b border-border last:border-0">
                      <th scope="row" className="px-5 py-3 text-left font-normal">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={w.name} className="size-7" />
                          <span className="text-text">{w.name}</span>
                          {w.userId === session.user.id && <Badge>You</Badge>}
                        </span>
                      </th>
                      <td className="px-5 py-3 text-right tabular-nums text-text">{w.openConversations}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text">{w.openTickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

/** Setup steps computed from the workspace's real state; hidden once everything is done. */
function SetupChecklist() {
  const { session, can } = useSession();
  const kb = useSWR<{ published: number }>("/kb/stats");
  const widget = useSWR<{ config: WidgetConfigDto }>("/widget/config");
  const members = useSWR<unknown[]>("/team/members");
  if (!kb.data || !widget.data || !members.data) return null;

  const steps = [
    { done: kb.data.published > 0, label: "Publish a help article", detail: "The AI answers only from published articles.", href: "/app/knowledge/new" },
    { done: session.organization?.aiMode !== "off", label: "Choose how the AI helps", detail: "Suggestions, approval or automatic replies.", href: "/app/settings#ai", admin: true },
    { done: widget.data.config.allowedOrigins.length > 0, label: "Allow your website and install the chat", detail: "Add your site's address, then paste one script tag.", href: "/app/widget", admin: true },
    { done: members.data.length > 1, label: "Invite a teammate", detail: "Share the inbox with your team.", href: "/app/team", admin: true },
  ].filter((s) => !s.admin || can("admin"));
  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  return (
    <Panel title="Get set up" description={`${steps.length - remaining} of ${steps.length} done`}>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className="flex h-full gap-3 rounded-md border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              {step.done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
              ) : (
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="To do" />
              )}
              <span>
                <span className={`block text-sm font-medium ${step.done ? "text-muted line-through" : "text-text"}`}>{step.label}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{step.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
