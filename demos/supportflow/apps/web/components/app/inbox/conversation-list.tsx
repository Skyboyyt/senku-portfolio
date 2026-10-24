"use client";

import { Bot, Inbox, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { ConversationListItemDto, Paginated } from "@supportflow/shared";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn, customerLabel, relativeTime } from "@/lib/utils";
import { useRealtime } from "../realtime";
import { useSession } from "../session";

export const VIEWS = {
  open: { label: "Open", query: "status=open" },
  mine: { label: "Assigned to me", query: "status=all&assignee=me" },
  unassigned: { label: "Unassigned", query: "status=open&assignee=unassigned" },
  needsHuman: { label: "Needs a person", query: "status=open&needsHuman=true" },
  unread: { label: "Unread", query: "status=all&unread=true" },
  pending: { label: "Pending", query: "status=pending" },
  resolved: { label: "Resolved", query: "status=resolved" },
  all: { label: "All conversations", query: "status=all" },
} as const;
type View = keyof typeof VIEWS;

export function ConversationList({ selectedId }: { selectedId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: View = (params.get("view") as View) in VIEWS ? (params.get("view") as View) : "open";
  const { session } = useSession();
  const autoMode = session.organization?.aiMode === "auto";
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);

  const getKey = (index: number, previous: Paginated<ConversationListItemDto> | null) => {
    if (previous && !previous.nextCursor) return null;
    const base = `/conversations?${VIEWS[view].query}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    return index === 0 ? base : `${base}&cursor=${encodeURIComponent(previous!.nextCursor!)}`;
  };
  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<Paginated<ConversationListItemDto>>(getKey, {
    revalidateFirstPage: true,
  });
  const { subscribe } = useRealtime();
  // Revalidate the loaded pages whenever a conversation changes.
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type !== "ticket.updated") void mutate();
      }),
    [subscribe, mutate],
  );
  const items = data?.flatMap((page) => page.items) ?? [];
  const hasMore = Boolean(data?.at(-1)?.nextCursor);

  const setView = (next: string) => {
    const sp = new URLSearchParams(params);
    sp.set("view", next);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h1 className="text-base font-semibold text-text">Inbox</h1>
          <Select
            aria-label="View"
            value={view}
            onChange={(e) => setView(e.target.value)}
            className="h-10 w-auto min-w-0 text-[13px] sm:h-8"
          >
            {Object.entries(VIEWS).map(([key, v]) => (
              <option key={key} value={key}>{v.label}</option>
            ))}
          </Select>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or message"
            aria-label="Search conversations"
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" aria-busy={isValidating}>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
        ) : isLoading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title={q ? "No matches" : "Nothing here"}>
            {q
              ? "Try a different name, email or phrase."
              : view === "open"
                ? "New chats from your website appear here in real time. Install the widget to start receiving them."
                : "No conversations in this view."}
          </EmptyState>
        ) : (
          <ul aria-label={`${VIEWS[view].label} conversations`}>
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/inbox/${c.id}?view=${view}`}
                  aria-current={c.id === selectedId ? "page" : undefined}
                  className={cn(
                    "relative flex gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-surface-2",
                    c.id === selectedId && "bg-surface-3 hover:bg-surface-3",
                  )}
                >
                  {c.unread && <span aria-hidden className="absolute left-1.5 top-[22px] size-1.5 rounded-full bg-primary" />}
                  <Avatar name={customerLabel(c.customer)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className={cn("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold text-text" : "font-medium text-text")}>
                        {customerLabel(c.customer)}
                        {c.unread && <span className="sr-only"> (unread)</span>}
                      </p>
                      <time dateTime={c.lastMessageAt} className="shrink-0 text-xs text-subtle">
                        {relativeTime(c.lastMessageAt)}
                      </time>
                    </div>
                    <p className={cn("mt-0.5 line-clamp-2 text-[13px] leading-snug", c.unread ? "text-text" : "text-muted")}>
                      {c.lastMessageAuthor === "ai" && <Bot className="mr-1 inline size-3.5 align-[-2px] text-ai" aria-label="AI:" />}
                      {c.lastMessageAuthor === "agent" && <span className="text-subtle">You: </span>}
                      {c.lastMessagePreview || "No messages yet"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.needsHuman && c.status !== "resolved" && (
                        <span className="rounded-full bg-warning-soft px-1.5 py-px text-[11px] font-medium text-warning">Needs a person</span>
                      )}
                      {autoMode && c.aiActive && !c.needsHuman && c.status !== "resolved" && (
                        <span className="rounded-full bg-ai-soft px-1.5 py-px text-[11px] font-medium text-ai">AI handling</span>
                      )}
                      {c.status !== "open" && (
                        <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium capitalize text-muted">{c.status}</span>
                      )}
                      {c.assignee && <span className="truncate text-[11px] text-subtle">{c.assignee.name}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="p-3">
            <Button variant="secondary" className="w-full" loading={isValidating && size > 1} onClick={() => void setSize(size + 1)}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
