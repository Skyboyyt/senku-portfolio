"use client";

import { Check, Copy, MailPlus, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { LABELS, ROLES, getPlan, inviteSchema, type InvitationDto, type MemberDto, type Role } from "@supportflow/shared";
import { PageBody, PageHeader, Panel } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";
import { useMembers } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including billing and deleting the workspace",
  admin: "Settings, team, widget, publishing articles and data deletion",
  agent: "Conversations, tickets, customers and article drafts",
};

export default function TeamPage() {
  const { session, can, mutate: mutateSession } = useSession();
  const router = useRouter();
  const toast = useToast();
  const members = useMembers();
  const invites = useSWR<InvitationDto[]>(can("admin") ? "/team/invitations" : null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const plan = getPlan(session.plan);
  const seatsUsed = (members.data?.length ?? 0) + (invites.data?.length ?? 0);

  const changeRole = async (m: MemberDto, role: Role) => {
    try {
      await api(`/team/members/${m.id}`, { method: "PATCH", body: { role } });
      await members.mutate();
      toast(`${m.name} is now an ${LABELS.role[role].toLowerCase()}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Team"
        description={`${seatsUsed} of ${plan.limits.seats} seats used on the ${plan.name} plan, including pending invitations.`}
        actions={
          can("admin") && (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus aria-hidden /> Invite
            </Button>
          )
        }
      />
      <PageBody className="space-y-6">
        <Panel title="Members" bodyClassName="p-0 sm:p-0">
          {members.error ? (
            <ErrorState message={errorMessage(members.error)} onRetry={() => void members.mutate()} />
          ) : !members.data ? (
            <ListSkeleton rows={3} />
          ) : (
            <ul className="divide-y divide-border">
              {members.data.map((m) => {
                const self = m.userId === session.user.id;
                const canEditRole = can("admin") && !self && (m.role !== "owner" || can("owner"));
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                    <Avatar name={m.name} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-text">
                        {m.name} {self && <Badge>You</Badge>}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {m.email} · joined {formatDate(m.joinedAt)} · {m.openConversations} open conversation{m.openConversations === 1 ? "" : "s"}
                      </p>
                    </div>
                    {canEditRole ? (
                      <Select
                        aria-label={`Role for ${m.name}`}
                        value={m.role}
                        onChange={(e) => void changeRole(m, e.target.value as Role)}
                        className="w-32"
                      >
                        {ROLES.filter((r) => r !== "owner" || can("owner")).map((r) => (
                          <option key={r} value={r}>{LABELS.role[r]}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={m.role === "owner" ? "primary" : "neutral"}>{LABELS.role[m.role]}</Badge>
                    )}
                    {(self || (can("admin") && (m.role !== "owner" || can("owner")))) && (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={self ? "Leave workspace" : `Remove ${m.name}`}>
                            <UserMinus aria-hidden />
                          </Button>
                        }
                        title={self ? `Leave ${session.organization?.name}?` : `Remove ${m.name}?`}
                        description={
                          self
                            ? "You'll lose access immediately. An admin can invite you again."
                            : `${m.name} loses access immediately. Their conversations and tickets become unassigned.`
                        }
                        confirmLabel={self ? "Leave workspace" : "Remove member"}
                        onConfirm={async () => {
                          await api(`/team/members/${m.id}`, { method: "DELETE" });
                          if (self) {
                            await mutateSession();
                            router.replace("/app");
                          } else {
                            await members.mutate();
                            toast(`${m.name} removed`);
                          }
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {can("admin") && (
          <Panel title="Pending invitations" bodyClassName="p-0 sm:p-0">
            {!invites.data ? (
              <ListSkeleton rows={1} />
            ) : invites.data.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No pending invitations.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invites.data.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text">{inv.email}</p>
                      <p className="text-[13px] text-muted">
                        {LABELS.role[inv.role]} · invited by {inv.invitedBy ?? "a former member"} · expires {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    <ConfirmDialog
                      trigger={<Button variant="ghost" size="sm">Withdraw</Button>}
                      title="Withdraw this invitation?"
                      description={`The link sent to ${inv.email} will stop working.`}
                      confirmLabel="Withdraw"
                      onConfirm={async () => {
                        await api(`/team/invitations/${inv.id}`, { method: "DELETE" });
                        await invites.mutate();
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel title="Roles">
          <dl className="grid gap-4 sm:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r}>
                <dt className="text-sm font-medium text-text">{LABELS.role[r]}</dt>
                <dd className="mt-1 text-[13px] text-muted">{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </PageBody>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={() => void invites.mutate()} />
    </>
  );
}

function InviteDialog({ open, onOpenChange, onInvited }: { open: boolean; onOpenChange: (o: boolean) => void; onInvited: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setLink(null);
      setErrors({});
      setFormError(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = inviteSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      const result = await api<{ inviteUrl: string }>("/team/invitations", { body: parsed.data });
      setLink(result.inviteUrl);
      onInvited();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else setFormError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Invite a teammate" description={link ? undefined : "They'll get access once they accept with this email address."}>
        {link ? (
          <div className="space-y-4">
            <p className="text-sm text-text">
              Invitation created. Email delivery isn&apos;t set up for this workspace, so send this link to your teammate
              yourself. It works once and expires in 7 days.
            </p>
            <div className="flex gap-2">
              <Input value={link} readOnly aria-label="Invitation link" className="font-mono text-[12.5px]" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[13px] text-muted">This link is shown only once.</p>
            <div className="flex justify-end">
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormError message={formError} />
            <Field label="Email" error={errors.email}>
              <Input name="email" type="email" autoComplete="off" required autoFocus />
            </Field>
            <Field label="Role" error={errors.role} hint="Agents handle conversations; admins also manage settings and the team.">
              <Select name="role" defaultValue="agent">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" loading={pending}>Create invitation</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
