"use client";

import { Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import type { ConversationListItemDto, CustomerDto } from "@supportflow/shared";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { customerLabel, formatDate, relativeTime } from "@/lib/utils";

export default function CustomersPage() {
  return (
    <Suspense>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const params = useSearchParams();
  const { can } = useSession();
  const toast = useToast();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebounced(search.trim());
  const { data, error, isLoading, mutate } = useSWR<CustomerDto[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const [viewing, setViewing] = useState<CustomerDto | null>(null);

  return (
    <>
      <PageHeader
        title="Customers"
        description="People who have chatted with you. Only what they chose to share is stored."
      />
      <PageBody className="space-y-4">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" aria-label="Search customers" className="pl-9" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
          ) : isLoading || !data ? (
            <ListSkeleton rows={5} />
          ) : data.length === 0 ? (
            <EmptyState icon={Users} title={q ? "No customers match" : "No customers yet"}>
              {q ? "Try another name or email." : "A customer record is created when someone sends their first chat message."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                  <Avatar name={customerLabel(c)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{customerLabel(c)}</p>
                    <p className="truncate text-[13px] text-muted">
                      {c.name && c.email ? c.email : !c.email ? "No email given" : ""}
                      {c.name && c.email ? " · " : ""}
                      First seen {formatDate(c.createdAt)} · last seen {relativeTime(c.lastSeenAt)}
                    </p>
                  </div>
                  <Badge>{c.conversationCount} conversation{c.conversationCount === 1 ? "" : "s"}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => setViewing(c)}>View</Button>
                  {can("admin") && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${customerLabel(c)}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      }
                      title={`Delete ${customerLabel(c)}?`}
                      description={
                        <>
                          This permanently deletes the customer and all {c.conversationCount} of their conversations and
                          messages. Linked tickets are kept without the customer. Use this for data deletion requests.
                        </>
                      }
                      confirmLabel="Delete customer and conversations"
                      onConfirm={async () => {
                        await api(`/customers/${c.id}`, { method: "DELETE" });
                        await mutate();
                        toast("Customer data deleted");
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageBody>
      <CustomerConversations customer={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function CustomerConversations({ customer, onClose }: { customer: CustomerDto | null; onClose: () => void }) {
  const { data, error } = useSWR<ConversationListItemDto[]>(customer ? `/customers/${customer.id}/conversations` : null);
  return (
    <Dialog open={Boolean(customer)} onOpenChange={(open) => !open && onClose()}>
      {customer && (
        <DialogContent title={customerLabel(customer)} description={customer.email ?? "No email given"}>
          {error ? (
            <ErrorState message={errorMessage(error)} />
          ) : !data ? (
            <ListSkeleton rows={2} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.map((conv) => (
                <li key={conv.id}>
                  <Link href={`/app/inbox/${conv.id}?view=all`} className="block px-3 py-2.5 hover:bg-surface-2">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="capitalize text-text">{conv.status}</span>
                      <span className="text-xs text-subtle">{relativeTime(conv.lastMessageAt)}</span>
                    </p>
                    <p className="truncate text-[13px] text-muted">{conv.lastMessagePreview}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
