"use client";

import { Plus, Search, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { LABELS, TICKET_PRIORITIES, TICKET_STATUSES, type TicketDto } from "@supportflow/shared";
import { CreateTicketDialog } from "@/components/app/inbox/create-ticket-dialog";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PriorityBadge, TicketStatusBadge } from "@/components/app/ticket-badges";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { relativeTime } from "@/lib/utils";

export default function TicketsPage() {
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("all");
  const [owner, setOwner] = useState("any");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search.trim());
  const key = `/tickets?status=${status}&priority=${priority}&owner=${owner}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<TicketDto[]>(key);
  const filtered = status !== "active" || priority !== "all" || owner !== "any" || q;

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Follow-up work that takes longer than a single conversation."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden /> New ticket
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, email or #number" aria-label="Search tickets" className="pl-9" />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-40">
              <option value="active">Active</option>
              {TICKET_STATUSES.map((s) => <option key={s} value={s}>{LABELS.ticketStatus[s]}</option>)}
              <option value="all">All statuses</option>
            </Select>
            <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="sm:w-36">
              <option value="all">Any priority</option>
              {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{LABELS.ticketPriority[p]}</option>)}
            </Select>
            <Select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="sm:w-36">
              <option value="any">Anyone</option>
              <option value="me">Mine</option>
              <option value="unassigned">Unassigned</option>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
          ) : isLoading || !data ? (
            <ListSkeleton rows={5} />
          ) : data.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title={filtered ? "No tickets match" : "No active tickets"}
              action={!filtered && <Button variant="secondary" onClick={() => setCreating(true)}>Create a ticket</Button>}
            >
              {filtered ? "Try different filters." : "Create tickets from conversations, or from here for internal work."}
            </EmptyState>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Tickets</caption>
              <thead className="hidden border-b border-border text-left text-[13px] text-muted md:table-header-group">
                <tr>
                  <th scope="col" className="w-20 px-4 py-2.5 font-medium">#</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Title</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Priority</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Owner</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="relative block border-b border-border last:border-0 hover:bg-surface-2 md:table-row">
                    <td className="hidden px-4 py-3 font-mono text-[13px] text-subtle md:table-cell">#{t.number}</td>
                    <td className="block px-4 pt-3 md:table-cell md:py-3">
                      <Link href={`/app/tickets/${t.id}`} className="font-medium text-text after:absolute after:inset-0">
                        <span className="mr-1.5 font-mono text-[13px] text-subtle md:hidden">#{t.number}</span>
                        {t.title}
                      </Link>
                      {t.customer && <p className="text-[13px] text-muted">{t.customer.email ?? t.customer.name}</p>}
                    </td>
                    <td className="inline-block px-4 pb-3 pt-1.5 md:table-cell md:py-3"><TicketStatusBadge status={t.status} /></td>
                    <td className="inline-block pb-3 pt-1.5 md:table-cell md:px-4 md:py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {t.owner ? (
                        <span className="flex items-center gap-2"><Avatar name={t.owner.name} className="size-6 text-[10px]" />{t.owner.name}</span>
                      ) : (
                        <span className="text-subtle">Unassigned</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[13px] text-muted md:table-cell">{relativeTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>
      <CreateTicketDialog open={creating} onOpenChange={setCreating} onCreated={() => void mutate()} />
    </>
  );
}
