"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { LABELS, TICKET_PRIORITIES, createTicketSchema, type TicketDto } from "@supportflow/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";
import { useMembers } from "@/lib/hooks";

export function CreateTicketDialog({
  open,
  onOpenChange,
  conversationId,
  defaultTitle = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  defaultTitle?: string;
  onCreated?: (ticket: TicketDto) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data: members } = useMembers();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) {
      setErrors({});
      setFormError(null);
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = createTicketSchema.safeParse({
      ...raw,
      ownerId: raw.ownerId || null,
      conversationId: conversationId ?? null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const ticket = await api<TicketDto>("/tickets", { body: parsed.data });
      onOpenChange(false);
      onCreated?.(ticket);
      void mutate((key) => typeof key === "string" && key.startsWith("/tickets"));
      toast(`Ticket #${ticket.number} created`);
      if (!conversationId) router.push(`/app/tickets/${ticket.id}`);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Couldn't create the ticket");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New ticket" description={conversationId ? "Linked to this conversation and customer." : undefined}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormError message={formError} />
          <Field label="Title" error={errors.title}>
            <Input name="title" defaultValue={defaultTitle} required maxLength={200} autoFocus />
          </Field>
          <Field label="Description" optional error={errors.description}>
            <Textarea name="description" rows={4} maxLength={10000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" error={errors.priority}>
              <Select name="priority" defaultValue="normal">
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{LABELS.ticketPriority[p]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" error={errors.ownerId}>
              <Select name="ownerId" defaultValue="">
                <option value="">Unassigned</option>
                {members?.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={pending}>Create ticket</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
