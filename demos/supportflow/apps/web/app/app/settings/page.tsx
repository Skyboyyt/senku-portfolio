"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import {
  AI_MODES,
  LABELS,
  changePasswordSchema,
  getPlan,
  updateProfileSchema,
  type AiMode,
  type OrgDto,
} from "@supportflow/shared";
import { PageBody, PageHeader, Panel } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";
import { cn } from "@/lib/utils";

const MODE_DETAIL: Record<AiMode, string> = {
  off: "No AI drafts or replies. Your team answers everything.",
  suggest: "Agents click “Suggest reply” to get a draft when they want one.",
  approval: "A draft is prepared for every new customer message. Nothing is sent until an agent approves it.",
  auto: "The AI replies on its own when it's confident and the topic is safe; otherwise it hands over with a draft.",
};

export default function SettingsPage() {
  const { session, can } = useSession();
  const org = session.organization!;
  const isAdmin = can("admin");
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace, AI behaviour, privacy and your account."
        actions={
          isAdmin && (
            <Link href="/app/settings/audit" className={buttonVariants({ variant: "secondary" })}>
              Audit log
            </Link>
          )
        }
      />
      <PageBody className="mx-auto max-w-3xl space-y-6">
        {!isAdmin && (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            Workspace settings can be changed by admins and owners. You can update your own account below.
          </p>
        )}
        <WorkspaceSettings org={org} disabled={!isAdmin} />
        <AiSettings org={org} disabled={!isAdmin} />
        <PrivacySettings org={org} disabled={!isAdmin} />
        <AccountSettings />
        {can("owner") && <DangerZone org={org} />}
      </PageBody>
    </>
  );
}

function useOrgUpdate() {
  const { mutate } = useSession();
  const toast = useToast();
  return async (body: Partial<OrgDto>, message = "Settings saved") => {
    try {
      await api<OrgDto>("/org", { method: "PATCH", body });
      await mutate();
      toast(message);
      return null;
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) return e.fields;
      toast(errorMessage(e), "error");
      return {};
    }
  };
}

function WorkspaceSettings({ org, disabled }: { org: OrgDto; disabled: boolean }) {
  const update = useOrgUpdate();
  const [name, setName] = useState(org.name);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  useEffect(() => setName(org.name), [org.name]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrors((await update({ name })) ?? {});
    setPending(false);
  };
  return (
    <Panel title="Workspace" id="workspace">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Workspace name" error={errors.name} className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} maxLength={80} />
        </Field>
        {!disabled && (
          <Button type="submit" variant="secondary" loading={pending} disabled={name === org.name}>Save</Button>
        )}
      </form>
    </Panel>
  );
}

function AiSettings({ org, disabled }: { org: OrgDto; disabled: boolean }) {
  const { session } = useSession();
  const update = useOrgUpdate();
  const plan = getPlan(session.plan);
  const [mode, setMode] = useState<AiMode>(org.aiMode);
  const [threshold, setThreshold] = useState(org.aiConfidenceThreshold);
  const [instructions, setInstructions] = useState(org.aiInstructions);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const dirty = mode !== org.aiMode || threshold !== org.aiConfidenceThreshold || instructions !== org.aiInstructions;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrors((await update({ aiMode: mode, aiConfidenceThreshold: threshold, aiInstructions: instructions }, "AI settings saved")) ?? {});
    setPending(false);
  };

  return (
    <Panel
      title="AI assistant"
      id="ai"
      description={
        session.ai.provider === "extractive"
          ? "This server has no language model configured, so the assistant answers with excerpts from your articles. Summaries are unavailable."
          : session.ai.available
            ? `Using ${session.ai.provider}${session.ai.model ? ` (${session.ai.model})` : ""}.`
            : "AI is disabled on this server."
      }
    >
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={disabled}>
          <legend className="text-sm font-medium text-text">How should the AI help?</legend>
          <div className="mt-3 space-y-2">
            {AI_MODES.map((m) => {
              const locked = m === "auto" && !plan.features.autoReply;
              return (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
                    mode === m ? "border-primary bg-primary-soft/50" : "border-border hover:border-border-strong",
                    locked && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="aiMode"
                    value={m}
                    checked={mode === m}
                    disabled={locked}
                    onChange={() => setMode(m)}
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium text-text">
                      {LABELS.aiMode[m]}
                      {locked && <Badge>Starter plan and above</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">{MODE_DETAIL[m]}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.aiMode && <p className="mt-2 text-[13px] text-danger">{errors.aiMode}</p>}
        </fieldset>

        <div>
          <label htmlFor="threshold" className="flex items-baseline justify-between text-sm font-medium text-text">
            Confidence needed to reply automatically
            <span className="font-mono text-sm tabular-nums text-text">{threshold}%</span>
          </label>
          <input
            id="threshold"
            type="range"
            min={30}
            max={95}
            step={5}
            value={threshold}
            disabled={disabled || mode !== "auto"}
            onChange={(e) => setThreshold(Number(e.target.value))}
            aria-describedby="threshold-hint"
            className="mt-3 h-11 w-full accent-[var(--primary)] sm:h-6"
          />
          <p id="threshold-hint" className="mt-1 text-[13px] text-muted">
            {mode === "auto" ? "" : "Applies when automatic replies are on. "}Below this, the AI saves a draft and hands the
            conversation to your team. Refunds, billing and account requests always go to a person regardless of confidence.
          </p>
        </div>

        <Field
          label="Tone and style guidance"
          optional
          hint="For example: “Friendly and concise. Sign off as the Larkspur team.” This can't override the safety rules."
          error={errors.aiInstructions}
        >
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={disabled} maxLength={1000} rows={3} />
        </Field>

        {!disabled && (
          <Button type="submit" loading={pending} disabled={!dirty}>Save AI settings</Button>
        )}
      </form>
    </Panel>
  );
}

function PrivacySettings({ org, disabled }: { org: OrgDto; disabled: boolean }) {
  const update = useOrgUpdate();
  const toast = useToast();
  const [enabled, setEnabled] = useState(org.retentionDays !== null);
  const [days, setDays] = useState(org.retentionDays ?? 365);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrors((await update({ retentionDays: enabled ? days : null }, "Retention updated")) ?? {});
    setPending(false);
  };

  return (
    <Panel title="Data and privacy" id="privacy">
      <div className="space-y-6">
        <label className="flex items-start gap-3">
          <Switch
            checked={org.collectCsat}
            disabled={disabled}
            onCheckedChange={(v) => void update({ collectCsat: v }, v ? "Ratings turned on" : "Ratings turned off")}
            aria-label="Ask customers for a rating"
          />
          <span className="text-sm">
            <span className="font-medium text-text">Ask customers for a rating</span>
            <span className="block text-[13px] text-muted">After a conversation is resolved, the chat asks for a 1–5 rating.</span>
          </span>
        </label>

        <form onSubmit={save} className="space-y-3 border-t border-border pt-5">
          <label className="flex items-start gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} aria-label="Delete old conversations automatically" />
            <span className="text-sm">
              <span className="font-medium text-text">Delete old conversations automatically</span>
              <span className="block text-[13px] text-muted">
                Resolved conversations, their messages and customers with no other conversations are deleted after the
                period you choose. Checked hourly.
              </span>
            </span>
          </label>
          {enabled && (
            <Field label="Keep resolved conversations for (days)" error={errors.retentionDays} className="max-w-xs">
              <Input type="number" min={7} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={disabled} />
            </Field>
          )}
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="secondary"
                loading={pending}
                disabled={enabled === (org.retentionDays !== null) && (!enabled || days === org.retentionDays)}
              >
                Save retention
              </Button>
              {org.retentionDays !== null && (
                <ConfirmDialog
                  trigger={<Button type="button" variant="ghost">Run now</Button>}
                  title="Delete old conversations now?"
                  description={`Resolved conversations with no activity in the last ${org.retentionDays} days are permanently deleted.`}
                  confirmLabel="Delete now"
                  onConfirm={async () => {
                    const r = await api<{ deletedConversations: number }>("/org/retention/run", { body: {} });
                    toast(`${r.deletedConversations} conversation${r.deletedConversations === 1 ? "" : "s"} deleted`);
                  }}
                />
              )}
            </div>
          )}
        </form>
        <p className="border-t border-border pt-5 text-[13px] text-muted">
          To delete one person&apos;s data on request, open{" "}
          <Link href="/app/customers" className="text-primary underline underline-offset-2">Customers</Link> and delete them.
        </p>
      </div>
    </Panel>
  );
}

function AccountSettings() {
  const { session, mutate } = useSession();
  const toast = useToast();
  const [name, setName] = useState(session.user.name);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = updateProfileSchema.safeParse({ name });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setPending("name");
    try {
      await api("/auth/profile", { method: "PATCH", body: parsed.data });
      await mutate();
      setErrors({});
      toast("Name updated");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPending(null);
    }
  };

  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (data.newPassword !== data.confirm) return setPwErrors({ confirm: "Passwords don't match" });
    const parsed = changePasswordSchema.safeParse(data);
    if (!parsed.success) return setPwErrors(fieldErrors(parsed.error));
    setPending("password");
    try {
      await api("/auth/password", { body: parsed.data });
      setPwErrors({});
      form.reset();
      toast("Password changed. Other devices have been signed out.");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setPwErrors(err.fields);
      else toast(errorMessage(err), "error");
    } finally {
      setPending(null);
    }
  };

  return (
    <Panel title="Your account" id="account" description={session.user.email}>
      <div className="space-y-6">
        <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Your name" error={errors.name} className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
          </Field>
          <Button type="submit" variant="secondary" loading={pending === "name"} disabled={name === session.user.name}>Save</Button>
        </form>
        <form onSubmit={changePassword} className="space-y-4 border-t border-border pt-5" noValidate>
          <h3 className="text-sm font-medium text-text">Change password</h3>
          <Field label="Current password" error={pwErrors.currentPassword}>
            <Input name="currentPassword" type="password" autoComplete="current-password" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" error={pwErrors.newPassword} hint="At least 10 characters.">
              <Input name="newPassword" type="password" autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" error={pwErrors.confirm}>
              <Input name="confirm" type="password" autoComplete="new-password" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" loading={pending === "password"}>Change password</Button>
        </form>
      </div>
    </Panel>
  );
}

function DangerZone({ org }: { org: OrgDto }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [confirm, setConfirm] = useState("");
  return (
    <section aria-labelledby="danger" className="rounded-lg border border-danger/30 bg-surface">
      <div className="border-b border-danger/20 px-5 py-3.5">
        <h2 id="danger" className="text-[15px] font-semibold text-danger">Delete workspace</h2>
      </div>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Permanently deletes {org.name}: every conversation, customer, ticket, article, member and setting. This can&apos;t
          be undone.
        </p>
        <ConfirmDialog
          trigger={<Button variant="danger">Delete workspace</Button>}
          title={`Delete ${org.name}?`}
          description="Everything in this workspace is deleted immediately and permanently. Members lose access. Cancel any paid subscription in Billing first."
          confirmLabel="Delete permanently"
          confirmDisabled={confirm !== org.name}
          onConfirm={async () => {
            await api("/org", { method: "DELETE", body: { confirmName: confirm } });
            await mutate(() => true, undefined, { revalidate: true });
            router.replace("/app");
          }}
        >
          <Field label={`Type “${org.name}” to confirm`}>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
        </ConfirmDialog>
      </div>
    </section>
  );
}
