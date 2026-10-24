"use client";

import { Sparkles, TicketPlus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LABELS, formatDuration, getPlan, type ConversationDetailDto } from "@supportflow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { customerLabel, formatDateTime } from "@/lib/utils";
import { useSession } from "../session";

export function ConversationDetails({
  conversation: c,
  onChange,
  onClose,
  onCreateTicket,
}: {
  conversation: ConversationDetailDto;
  onChange: () => void;
  onClose: () => void;
  onCreateTicket: () => void;
}) {
  const { session } = useSession();
  const toast = useToast();
  const [summarizing, setSummarizing] = useState(false);
  const plan = getPlan(session.plan);
  const firstResponse = c.firstResponseAt
    ? (new Date(c.firstResponseAt).getTime() - new Date(c.createdAt).getTime()) / 1000
    : null;

  const summarize = async () => {
    setSummarizing(true);
    try {
      await api(`/conversations/${c.id}/summary`, { body: {} });
      onChange();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="divide-y divide-border text-sm">
      <div className="flex items-center justify-between px-5 py-3.5">
        <h2 className="font-semibold text-text">Details</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="xl:hidden" aria-label="Close details">
          <X aria-hidden />
        </Button>
      </div>

      <section className="space-y-2.5 px-5 py-4" aria-label="Customer">
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-subtle">Customer</h3>
        <p className="font-medium text-text">{customerLabel(c.customer)}</p>
        <dl className="space-y-1.5 text-[13px]">
          <Row label="Email">{c.customer.email ?? "Not given"}</Row>
          <Row label="Status">{LABELS.conversationStatus[c.status]}</Row>
          <Row label="Assignee">{c.assignee?.name ?? "Unassigned"}</Row>
          <Row label="Started">{formatDateTime(c.createdAt)}</Row>
          <Row label="First response">{firstResponse === null ? "Waiting" : formatDuration(firstResponse)}</Row>
          {c.resolvedAt && <Row label="Resolved">{formatDateTime(c.resolvedAt)}</Row>}
          {c.csatRating !== null && (
            <Row label="Rating">
              {c.csatRating} / 5{c.csatComment ? ` — “${c.csatComment}”` : ""}
            </Row>
          )}
        </dl>
        <Link href={`/app/customers?q=${encodeURIComponent(c.customer.email ?? c.customer.name ?? "")}`} className="inline-flex min-h-9 items-center text-[13px] font-medium text-primary underline-offset-4 hover:underline">
          View customer
        </Link>
      </section>

      <section className="space-y-2.5 px-5 py-4" aria-label="Summary">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-subtle">AI summary</h3>
          {plan.features.summaries && (
            <Button variant="ghost" size="sm" onClick={() => void summarize()} loading={summarizing} className="-mr-2 text-ai">
              <Sparkles aria-hidden /> {c.summary ? "Refresh" : "Summarize"}
            </Button>
          )}
        </div>
        {c.summary ? (
          <>
            <p className="leading-relaxed text-text">{c.summary}</p>
            <p className="text-xs text-subtle">
              <Badge tone="ai">AI</Badge> {c.summaryUpdatedAt && `Updated ${formatDateTime(c.summaryUpdatedAt)}`}
            </p>
          </>
        ) : plan.features.summaries ? (
          <p className="text-[13px] text-muted">Summarize long conversations before handing them to a teammate.</p>
        ) : (
          <p className="text-[13px] text-muted">
            Summaries are included from the Pro plan.{" "}
            <Link href="/app/billing" className="text-primary underline underline-offset-2">See plans</Link>
          </p>
        )}
      </section>

      <section className="space-y-2.5 px-5 py-4" aria-label="Tickets">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-subtle">Tickets</h3>
          <Button variant="ghost" size="sm" onClick={onCreateTicket} className="-mr-2">
            <TicketPlus aria-hidden /> New
          </Button>
        </div>
        {c.tickets.length === 0 ? (
          <p className="text-[13px] text-muted">No tickets yet. Create one for work that takes longer than this chat.</p>
        ) : (
          <ul className="space-y-1.5">
            {c.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/app/tickets/${t.id}`} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-surface-2">
                  <span className="font-mono text-xs text-subtle">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate text-text">{t.title}</span>
                  <Badge>{LABELS.ticketStatus[t.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}
