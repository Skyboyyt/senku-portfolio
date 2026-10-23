"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatDuration, type AnalyticsDto } from "@supportflow/shared";
import { ColumnChart, LineChart, StatStrip, type Datum } from "@/components/app/charts";
import { PageBody, PageHeader, Panel } from "@/components/app/page-header";
import { RangeSelect } from "@/components/app/range-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, error, mutate } = useSWR<AnalyticsDto>(`/analytics?days=${days}`);

  const points = (pick: (d: AnalyticsDto["daily"][number]) => Record<string, number | null>): Datum[] =>
    (data?.daily ?? []).map((d) => ({ label: day(d.date), tick: day(d.date), values: pick(d) }));

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Calculated from this workspace's conversations, tickets and AI usage. Dates are in UTC."
        actions={<RangeSelect value={days} onChange={setDays} />}
      />
      <PageBody className="space-y-6">
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
        ) : !data ? (
          <div className="space-y-6">
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          </div>
        ) : (
          <>
            <StatStrip
              items={[
                { label: "Conversations", value: data.daily.reduce((n, d) => n + d.conversations, 0).toLocaleString("en-US") },
                { label: "Resolved by AI alone", value: data.daily.reduce((n, d) => n + d.aiResolved, 0).toLocaleString("en-US") },
                { label: "AI responses", value: data.ai.responses.toLocaleString("en-US") },
                {
                  label: "Escalation rate",
                  value: data.escalationRate === null ? "—" : `${Math.round(data.escalationRate * 100)}%`,
                  hint: "Of automatic reply attempts",
                },
                { label: "AI errors", value: data.ai.errors.toLocaleString("en-US"), hint: data.ai.limited ? `${data.ai.limited} blocked by plan limit` : undefined },
                { label: "Tokens used", value: (data.ai.inputTokens + data.ai.outputTokens).toLocaleString("en-US"), hint: `${data.ai.inputTokens.toLocaleString("en-US")} in · ${data.ai.outputTokens.toLocaleString("en-US")} out` },
                {
                  label: "Satisfaction",
                  value: data.csat?.average ? `${data.csat.average.toFixed(1)} / 5` : "—",
                  hint: data.csat ? `${data.csat.responses} ratings` : "No ratings yet",
                },
              ]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <ColumnChart
                title="Conversation volume"
                description="New conversations per day"
                data={points((d) => ({ conversations: d.conversations }))}
                series={[{ key: "conversations", name: "Conversations", color: "var(--chart-1)" }]}
                emptyMessage="No conversations in this period. They'll appear once customers use the chat."
              />
              <ColumnChart
                title="Ticket resolution"
                description="Tickets opened and resolved per day"
                data={points((d) => ({ opened: d.ticketsOpened, resolved: d.ticketsResolved }))}
                series={[
                  { key: "opened", name: "Opened", color: "var(--chart-2)" },
                  { key: "resolved", name: "Resolved", color: "var(--chart-1)" },
                ]}
                emptyMessage="No tickets opened or resolved in this period."
              />
              <LineChart
                title="First response time"
                description="Median minutes to the first reply from the AI or a person, by day the conversation started"
                data={points((d) => ({ minutes: d.medianFirstResponseSeconds === null ? null : d.medianFirstResponseSeconds / 60 }))}
                series={[{ key: "minutes", name: "Median minutes", color: "var(--chart-1)" }]}
                format={(v) => formatDuration(v * 60)}
                emptyMessage="No replies in this period yet."
              />
              <ColumnChart
                title="AI outcomes"
                description="Conversations resolved without a person, and automatic replies handed to your team"
                data={points((d) => ({ resolved: d.aiResolved, escalated: d.escalated }))}
                series={[
                  { key: "resolved", name: "Resolved by AI", color: "var(--chart-1)" },
                  { key: "escalated", name: "Handed to a person", color: "var(--chart-2)" },
                ]}
                emptyMessage="No automatic AI replies in this period. Turn on automatic replies in Settings to see this."
              />
            </div>
            {data.csat ? (
              <ColumnChart
                title="Customer satisfaction"
                description={`${data.csat.responses} ratings from resolved conversations`}
                data={data.csat.distribution.map((n, i) => ({ label: `${i + 1} star${i ? "s" : ""}`, tick: String(i + 1), values: { ratings: n } }))}
                series={[{ key: "ratings", name: "Ratings", color: "var(--chart-1)" }]}
              />
            ) : (
              <Panel title="Customer satisfaction">
                <p className="text-sm text-muted">
                  No ratings in this period. Customers are asked for a rating after a conversation is resolved, if ratings are
                  turned on in Settings.
                </p>
              </Panel>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
