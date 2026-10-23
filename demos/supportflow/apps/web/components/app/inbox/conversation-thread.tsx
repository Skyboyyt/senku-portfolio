"use client";

import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  FileText,
  Hand,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
  Sparkles,
  StickyNote,
  TicketPlus,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import useSWR from "swr";
import {
  type ConversationDetailDto,
  type ConversationStatus,
  type MessageDto,
  type SuggestionDto,
} from "@supportflow/shared";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useMembers } from "@/lib/hooks";
import { cn, customerLabel, formatDateTime, relativeTime } from "@/lib/utils";
import { useSession } from "../session";
import { CreateTicketDialog } from "./create-ticket-dialog";
import { ConversationDetails } from "./conversation-details";

export function ConversationThread({ id }: { id: string }) {
  const params = useSearchParams();
  const { session } = useSession();
  const toast = useToast();
  const { data, error, mutate } = useSWR<ConversationDetailDto>(`/conversations/${id}`);
  const { data: members } = useMembers();
  const [showDetails, setShowDetails] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // Mark as read on open and whenever new messages arrive while it's open.
  const messageCount = data?.messages.length ?? 0;
  useEffect(() => {
    if (!data) return;
    if (data.unread) void api(`/conversations/${id}/read`, { body: {} }).then(() => mutate());
  }, [id, data?.unread, messageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const log = logRef.current;
    if (!log || messageCount === lastCount.current) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
    if (lastCount.current === 0 || nearBottom) log.scrollTop = log.scrollHeight;
    lastCount.current = messageCount;
  }, [messageCount]);

  const act = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      await mutate();
      if (success) toast(success);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="grid h-full place-items-center">
        <ErrorState
          message={notFound ? "This conversation doesn't exist or was deleted." : errorMessage(error)}
          onRetry={notFound ? undefined : () => void mutate()}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6" role="status" aria-label="Loading conversation">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-1/2" />
        <Skeleton className="h-16 w-3/5" />
      </div>
    );
  }

  const c = data;
  const view = params.get("view") ?? "open";
  const aiMode = session.organization?.aiMode ?? "off";
  const suggestion = c.suggestions[0] ?? null;

  const setStatus = (status: ConversationStatus) =>
    act(() => api(`/conversations/${id}`, { method: "PATCH", body: { status } }), status === "resolved" ? "Conversation resolved" : undefined);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-5">
          <Link href={`/app/inbox?view=${view}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")} aria-label="Back to inbox">
            <ArrowLeft aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-text">{customerLabel(c.customer)}</h2>
            <p className="truncate text-xs text-subtle">
              {c.customer.email ?? "No email given"} · started {relativeTime(c.createdAt)}
            </p>
          </div>
          <Select
            aria-label="Assignee"
            value={c.assignee?.id ?? ""}
            onChange={(e) =>
              void act(() => api(`/conversations/${id}`, { method: "PATCH", body: { assigneeId: e.target.value || null } }), "Assignee updated")
            }
            className="hidden h-8 w-40 text-[13px] lg:block"
          >
            <option value="">Unassigned</option>
            {members?.map((m) => (
              <option key={m.userId} value={m.userId}>{m.userId === session.user.id ? `${m.name} (you)` : m.name}</option>
            ))}
          </Select>
          {c.status !== "resolved" ? (
            <Button size="sm" variant="secondary" onClick={() => void setStatus("resolved")}>
              <CheckCircle2 aria-hidden /> <span className="hidden sm:inline">Resolve</span>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => void setStatus("open")}>
              <RotateCcw aria-hidden /> <span className="hidden sm:inline">Reopen</span>
            </Button>
          )}
          <Dropdown>
            <DropdownTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="More actions">
              <MoreHorizontal aria-hidden />
            </DropdownTrigger>
            <DropdownContent>
              {c.status === "open" && (
                <DropdownItem onSelect={() => void setStatus("pending")}>Mark as pending</DropdownItem>
              )}
              {c.status === "pending" && <DropdownItem onSelect={() => void setStatus("open")}>Mark as open</DropdownItem>}
              {c.aiActive ? (
                <DropdownItem onSelect={() => void act(() => api(`/conversations/${id}/takeover`, { body: {} }), "You've taken over")}>
                  <Hand /> Take over from AI
                </DropdownItem>
              ) : (
                aiMode !== "off" && (
                  <DropdownItem onSelect={() => void act(() => api(`/conversations/${id}/ai/resume`, { body: {} }), "AI can help again")}>
                    <Bot /> Let AI help again
                  </DropdownItem>
                )
              )}
              <DropdownItem onSelect={() => setTicketOpen(true)}>
                <TicketPlus /> Create ticket
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onSelect={() => setShowDetails((v) => !v)} className="xl:hidden">
                <PanelRight /> {showDetails ? "Hide details" : "Show details"}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>

        {/* AI state */}
        {c.status !== "resolved" && (c.needsHuman || c.aiActive) && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 text-[13px] sm:px-5",
              c.needsHuman ? "border-warning/25 bg-warning-soft text-warning" : "border-ai-border bg-ai-soft text-ai",
            )}
          >
            {c.needsHuman ? <Hand className="size-4 shrink-0" aria-hidden /> : <Bot className="size-4 shrink-0" aria-hidden />}
            <p className="flex-1 font-medium">
              {c.needsHuman
                ? "Waiting for a person. The AI has stopped replying."
                : aiMode === "auto"
                  ? "The AI is answering this conversation and will hand over when unsure."
                  : aiMode === "approval"
                    ? "The AI drafts each reply for your approval."
                    : "AI drafts are available on request."}
            </p>
            {c.aiActive && aiMode === "auto" && (
              <Button size="sm" variant="secondary" onClick={() => void act(() => api(`/conversations/${id}/takeover`, { body: {} }), "You've taken over")}>
                Take over
              </Button>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-label="Messages" aria-live="polite">
          <ol className="mx-auto flex max-w-3xl flex-col gap-4">
            {c.messages.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
          </ol>
        </div>

        {suggestion && <SuggestionCard conversationId={id} suggestion={suggestion} onDone={() => void mutate()} />}

        <Composer conversationId={id} aiAvailable={aiMode !== "off"} hasSuggestion={Boolean(suggestion)} onSent={() => void mutate()} />
      </div>

      <aside
        aria-label="Conversation details"
        className={cn(
          "w-[300px] shrink-0 overflow-y-auto border-l border-border bg-bg",
          showDetails ? "fixed inset-y-0 right-0 z-40 shadow-lg xl:static xl:shadow-none" : "hidden xl:block",
        )}
      >
        <ConversationDetails conversation={c} onChange={() => void mutate()} onClose={() => setShowDetails(false)} onCreateTicket={() => setTicketOpen(true)} />
      </aside>

      <CreateTicketDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        conversationId={id}
        defaultTitle={c.lastMessagePreview.slice(0, 120)}
        onCreated={() => void mutate()}
      />
      <span className="sr-only" aria-live="polite">{c.status === "resolved" ? "Conversation resolved" : ""}</span>
    </div>
  );
}

function MessageItem({ message: m }: { message: MessageDto }) {
  if (m.authorType === "system") {
    return (
      <li className="flex justify-center">
        <p className={cn("max-w-md text-center text-xs text-subtle", m.internal && "italic")}>
          {m.body} · {formatDateTime(m.createdAt)}
        </p>
      </li>
    );
  }
  const fromCustomer = m.authorType === "customer";
  const isAi = m.authorType === "ai";
  return (
    <li className={cn("flex gap-2.5", !fromCustomer && "flex-row-reverse")}>
      {fromCustomer ? (
        <Avatar name="Customer" className="mt-5 size-7" />
      ) : isAi ? (
        <span className="mt-5 grid size-7 shrink-0 place-items-center rounded-full bg-ai-soft text-ai ring-1 ring-ai-border" aria-hidden>
          <Bot className="size-3.5" />
        </span>
      ) : (
        <Avatar name={m.author?.name} className="mt-5 size-7" />
      )}
      <div className={cn("flex min-w-0 max-w-[80%] flex-col", !fromCustomer && "items-end")}>
        <p className="mb-1 flex flex-wrap items-center gap-1.5 px-1 text-xs text-subtle">
          {isAi ? (
            <>
              <Badge tone="ai">AI</Badge>
              <span>{m.author ? `Approved by ${m.author.name}` : "Sent automatically"}</span>
              {m.aiConfidence !== null && <span>· {m.aiConfidence}% confidence</span>}
            </>
          ) : m.internal ? (
            <>
              <StickyNote className="size-3.5" aria-hidden /> Internal note · {m.author?.name}
            </>
          ) : (
            <span>{fromCustomer ? "Customer" : m.author?.name}</span>
          )}
          <time dateTime={m.createdAt}>· {formatDateTime(m.createdAt)}</time>
        </p>
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-lg px-3.5 py-2.5 text-[14.5px] leading-relaxed",
            fromCustomer && "rounded-tl-sm bg-surface-2 text-text",
            m.authorType === "agent" && !m.internal && "rounded-tr-sm bg-primary text-primary-fg",
            m.internal && "rounded-tr-sm border border-dashed border-warning/50 bg-warning-soft text-text",
            isAi && "rounded-tr-sm border border-ai-border bg-ai-soft text-text",
          )}
        >
          {m.body}
        </div>
        {isAi && m.aiSources && m.aiSources.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1 px-1 text-xs text-subtle">
            <FileText className="size-3" aria-hidden /> Sources:
            {m.aiSources.map((s, i) => (
              <Link key={s.articleId} href={`/app/knowledge/${s.articleId}`} className="underline underline-offset-2 hover:text-text">
                {s.title}
                {i < m.aiSources!.length - 1 ? "," : ""}
              </Link>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

function SuggestionCard({ conversationId, suggestion, onDone }: { conversationId: string; suggestion: SuggestionDto; onDone: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(suggestion.body);
  const [pending, setPending] = useState<"send" | "discard" | null>(null);
  useEffect(() => setBody(suggestion.body), [suggestion.id, suggestion.body]);

  const send = async () => {
    setPending("send");
    try {
      await api(`/conversations/${conversationId}/suggestions/${suggestion.id}/send`, { body: editing ? { body } : {} });
      toast(editing ? "Edited reply sent" : "AI reply sent");
      onDone();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPending(null);
    }
  };
  const discard = async () => {
    setPending("discard");
    try {
      await api(`/conversations/${conversationId}/suggestions/${suggestion.id}/discard`, { body: {} });
      onDone();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPending(null);
    }
  };

  const low = suggestion.confidence < 50;
  return (
    <section aria-label="AI draft" className="border-t border-ai-border bg-ai-soft/60 px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="ai">
            <Sparkles aria-hidden /> AI draft
          </Badge>
          <span className={cn("font-medium", low ? "text-warning" : "text-ai")}>{suggestion.confidence}% confidence</span>
          {suggestion.reason && <span className="text-muted">· {suggestion.reason}</span>}
        </div>
        {editing ? (
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-2 min-h-28 bg-surface" aria-label="Edit AI draft" maxLength={5000} />
        ) : (
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[14.5px] leading-relaxed text-text">{suggestion.body}</p>
        )}
        {suggestion.sources.length > 0 && (
          <p className="mt-1.5 text-xs text-muted">Based on: {suggestion.sources.map((s) => s.title).join(", ")}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void send()} loading={pending === "send"} disabled={editing && !body.trim()}>
            {editing ? "Send edited reply" : "Send"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel edit" : "Edit"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void discard()} loading={pending === "discard"}>
            Discard
          </Button>
        </div>
      </div>
    </section>
  );
}

function Composer({
  conversationId,
  aiAvailable,
  hasSuggestion,
  onSent,
}: {
  conversationId: string;
  aiAvailable: boolean;
  hasSuggestion: boolean;
  onSent: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await api(`/conversations/${conversationId}/messages`, { body: { body, internal: mode === "note" } });
      setBody("");
      onSent();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const suggest = async () => {
    setDrafting(true);
    try {
      await api(`/conversations/${conversationId}/suggestions`, { body: {} });
      onSent();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDrafting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Message type">
          {(["reply", "note"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "min-h-10 rounded-md px-3 text-[13px] font-medium sm:min-h-8",
                mode === m ? (m === "note" ? "bg-warning-soft text-warning" : "bg-surface-3 text-text") : "text-muted hover:text-text",
              )}
            >
              {m === "reply" ? "Reply to customer" : "Internal note"}
            </button>
          ))}
          {aiAvailable && !hasSuggestion && mode === "reply" && (
            <Tooltip content="Draft a reply from your published articles">
              <Button variant="ghost" size="sm" className="ml-auto text-ai hover:bg-ai-soft hover:text-ai" onClick={() => void suggest()} loading={drafting}>
                <Sparkles aria-hidden /> Suggest reply
              </Button>
            </Tooltip>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === "note" ? "Only your team will see this note" : "Write a reply…"}
            aria-label={mode === "note" ? "Internal note" : "Reply"}
            maxLength={5000}
            className={cn("min-h-20 resize-y", mode === "note" && "border-warning/40 bg-warning-soft/40")}
          />
          {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="hidden text-xs text-subtle sm:block">
              <kbd className="font-sans">Ctrl</kbd> + <kbd className="font-sans">Enter</kbd> to send
            </p>
            <Button type="submit" loading={sending} disabled={!body.trim()} className="ml-auto">
              {mode === "note" ? "Add note" : "Send reply"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

