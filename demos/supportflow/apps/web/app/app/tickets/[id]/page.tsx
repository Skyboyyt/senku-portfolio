"use client";

import { ArrowLeft, MessagesSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import {
  LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketCommentDto,
  type TicketDto,
  type TicketEventDto,
} from "@supportflow/shared";
import { PageBody } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { PriorityBadge, TicketStatusBadge } from "@/components/app/ticket-badges";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useMembers } from "@/lib/hooks";
import { formatDateTime, relativeTime } from "@/lib/utils";

interface TicketDetail {
  ticket: TicketDto;
  comments: TicketCommentDto[];
  events: TicketEventDto[];
}

function describeEvent(e: TicketEventDto): string {
  const m = e.metadata as Record<string, string | null>;
  switch (e.action) {
    case "ticket.created":
      return "created the ticket";
    case "ticket.status_changed":
      return `changed status from ${m.from} to ${m.to}`;
    case "ticket.priority_changed":
      return `changed priority to ${LABELS.ticketPriority[m.to as keyof typeof LABELS.ticketPriority] ?? m.to}`;
    case "ticket.owner_changed":
      return m.to ? `assigned it to ${m.to}` : "removed the owner";
    case "ticket.edited":
      return "edited the details";
    default:
      return e.action;
  }
}

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const { data, error, mutate } = useSWR<TicketDetail>(`/tickets/${id}`);
  const { data: members } = useMembers();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  if (error) {
    return (
      <PageBody>
        <ErrorState
          message={error instanceof ApiError && error.status === 404 ? "This ticket doesn't exist or was deleted." : errorMessage(error)}
          onRetry={() => void mutate()}
        />
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody className="space-y-4" >
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-40 w-full" />
      </PageBody>
    );
  }
  const t = data.ticket;

  const update = async (body: Record<string, unknown>, message = "Ticket updated") => {
    try {
      await api(`/tickets/${id}`, { method: "PATCH", body });
      await mutate();
      toast(message);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    await update({ title: form.title, description: form.description });
    setEditing(false);
  };

  const postComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await api(`/tickets/${id}/comments`, { body: { body: comment } });
      setComment("");
      await mutate();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPosting(false);
    }
  };

  const timeline = [
    ...data.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
    ...data.events.map((e) => ({ kind: "event" as const, at: e.createdAt, e })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <div className="border-b border-border px-4 py-5 sm:px-8">
        <Link href="/app/tickets" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4" aria-hidden /> Tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-[-0.015em] text-text">
            <span className="mr-2 font-mono text-base font-normal text-subtle">#{t.number}</span>
            {t.title}
          </h1>
          <div className="flex gap-1.5">
            <TicketStatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
          </div>
        </div>
      </div>

      <PageBody className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-8">
          <section aria-label="Description">
            {editing ? (
              <form onSubmit={saveDetails} className="space-y-3">
                <Field label="Title">
                  <Input name="title" defaultValue={t.title} required minLength={3} maxLength={200} />
                </Field>
                <Field label="Description">
                  <Textarea name="description" defaultValue={t.description} rows={6} maxLength={10000} />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">
                    {t.description || <span className="text-muted">No description.</span>}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                </div>
                <p className="mt-4 text-xs text-subtle">
                  Opened by {t.createdBy?.name ?? "a former member"} · {formatDateTime(t.createdAt)}
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="activity">
            <h2 id="activity" className="text-[15px] font-semibold text-text">Activity</h2>
            <ol className="mt-4 space-y-4">
              {timeline.map((item) =>
                item.kind === "event" ? (
                  <li key={item.e.id} className="flex gap-3 pl-1 text-[13px] text-muted">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
                    <span>
                      <span className="font-medium text-text">{item.e.actor ?? "Someone"}</span> {describeEvent(item.e)} ·{" "}
                      <time dateTime={item.e.createdAt}>{relativeTime(item.e.createdAt)}</time>
                    </span>
                  </li>
                ) : (
                  <li key={item.c.id} className="flex gap-3">
                    <Avatar name={item.c.author?.name} className="size-7" />
                    <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5">
                      <p className="text-xs text-subtle">
                        <span className="font-medium text-text">{item.c.author?.name ?? "Former member"}</span> · {formatDateTime(item.c.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text">{item.c.body}</p>
                    </div>
                  </li>
                ),
              )}
            </ol>
            <form onSubmit={postComment} className="mt-5 space-y-2">
              <label htmlFor="comment" className="text-sm font-medium text-text">Add an internal comment</label>
              <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={5000} placeholder="Visible to your team only" />
              <Button type="submit" loading={posting} disabled={!comment.trim()}>Comment</Button>
            </form>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Ticket properties">
          <Field label="Status">
            <Select value={t.status} onChange={(e) => void update({ status: e.target.value }, "Status updated")}>
              {TICKET_STATUSES.map((s) => <option key={s} value={s}>{LABELS.ticketStatus[s]}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={t.priority} onChange={(e) => void update({ priority: e.target.value }, "Priority updated")}>
              {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{LABELS.ticketPriority[p]}</option>)}
            </Select>
          </Field>
          <Field label="Owner">
            <Select value={t.owner?.id ?? ""} onChange={(e) => void update({ ownerId: e.target.value || null }, "Owner updated")}>
              <option value="">Unassigned</option>
              {members?.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </Select>
          </Field>
          {t.customer && (
            <div className="text-sm">
              <p className="font-medium text-text">Customer</p>
              <p className="mt-1 text-muted">{t.customer.name ?? t.customer.email ?? "Website visitor"}</p>
              {t.customer.name && t.customer.email && <p className="text-muted">{t.customer.email}</p>}
            </div>
          )}
          {t.conversationId && (
            <Link href={`/app/inbox/${t.conversationId}`} className={`${buttonVariants({ variant: "secondary" })} w-full`}>
              <MessagesSquare aria-hidden /> Open conversation
            </Link>
          )}
          {can("admin") && (
            <ConfirmDialog
              trigger={
                <Button variant="danger-ghost" className="w-full">
                  <Trash2 aria-hidden /> Delete ticket
                </Button>
              }
              title={`Delete ticket #${t.number}?`}
              description="The ticket, its comments and history are deleted permanently. The linked conversation is kept."
              confirmLabel="Delete ticket"
              onConfirm={async () => {
                await api(`/tickets/${id}`, { method: "DELETE" });
                toast(`Ticket #${t.number} deleted`);
                router.replace("/app/tickets");
              }}
            />
          )}
        </aside>
      </PageBody>
    </>
  );
}
