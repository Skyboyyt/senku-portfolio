"use client";

import { Check, Copy, KeyRound, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import useSWR from "swr";
import { originSchema, widgetConfigSchema, type WidgetConfigDto } from "@supportflow/shared";
import { PageBody, PageHeader, Panel } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { WidgetPreview } from "@/components/app/widget-preview";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";

interface WidgetResponse {
  config: WidgetConfigDto;
  scriptUrl: string;
  apiUrl: string;
  removeBrandingAvailable: boolean;
}

export default function WidgetPage() {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, mutate } = useSWR<WidgetResponse>("/widget/config");
  const [form, setForm] = useState<WidgetConfigDto | null>(null);
  const [origin, setOrigin] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(1);
  const [copied, setCopied] = useState(false);
  const isAdmin = can("admin");

  useEffect(() => {
    if (data) setForm(data.config);
  }, [data]);

  if (error) return <PageBody><ErrorState message={errorMessage(error)} onRetry={() => void mutate()} /></PageBody>;
  if (!data || !form) {
    return (
      <>
        <PageHeader title="Chat widget" />
        <PageBody className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </PageBody>
      </>
    );
  }

  const set = <K extends keyof WidgetConfigDto>(key: K, value: WidgetConfigDto[K]) => setForm({ ...form, [key]: value });
  const dirty = JSON.stringify(form) !== JSON.stringify(data.config);
  const snippet = `<script src="${data.scriptUrl}" data-key="${data.config.publicKey}" async></script>`;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const payload = {
      enabled: form.enabled,
      brandColor: form.brandColor,
      title: form.title,
      greeting: form.greeting,
      launcherLabel: form.launcherLabel,
      position: form.position,
      allowedOrigins: form.allowedOrigins,
      requireEmail: form.requireEmail,
    };
    const parsed = widgetConfigSchema.safeParse(payload);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setSaving(true);
    try {
      await api("/widget/config", { method: "PATCH", body: parsed.data });
      await mutate();
      setErrors({});
      setVersion((v) => v + 1);
      toast("Widget saved");
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const addOrigin = () => {
    const parsed = originSchema.safeParse(origin.trim());
    if (!parsed.success) return setOriginError(parsed.error.issues[0]?.message ?? "Invalid address");
    if (form.allowedOrigins.includes(parsed.data)) return setOriginError("Already on the list");
    setOriginError(null);
    set("allowedOrigins", [...form.allowedOrigins, parsed.data]);
    setOrigin("");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy failed. Select the code and copy it manually.", "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Chat widget"
        description="Customise the chat, choose where it may run, and install it on your website."
        actions={
          isAdmin && (
            <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          )
        }
      />
      <PageBody className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Install" description="Paste this before the closing </body> tag on every page that should show the chat.">
            <div className="flex items-start gap-2">
              <pre tabIndex={0} aria-label="Install code" className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-surface-2 p-3.5 font-mono text-[12.5px] leading-relaxed text-text">
                <code>{snippet}</code>
              </pre>
              <Button variant="secondary" onClick={() => void copy()} aria-label="Copy install code">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              The key is public and only lets visitors chat; it gives no access to your dashboard. To render the chat inside
              a page element instead of a floating button, add <code className="font-mono">data-mode=&quot;inline&quot; data-target=&quot;#your-element&quot;</code>.
            </p>
            {isAdmin && (
              <div className="mt-4 border-t border-border pt-4">
                <ConfirmDialog
                  trigger={<Button variant="secondary" size="sm"><KeyRound aria-hidden /> Rotate key</Button>}
                  title="Rotate the widget key?"
                  description="The current install code stops working immediately. You'll need to update the snippet on your website."
                  confirmLabel="Rotate key"
                  tone="primary"
                  onConfirm={async () => {
                    await api("/widget/config/rotate-key", { body: {} });
                    await mutate();
                    setVersion((v) => v + 1);
                    toast("New key created. Update your website's install code.");
                  }}
                />
              </div>
            )}
          </Panel>

          <Panel title="Allowed websites" description="The chat only works on these addresses. Requests from anywhere else are refused.">
            <fieldset disabled={!isAdmin} className="space-y-3">
              <legend className="sr-only">Allowed websites</legend>
              {form.allowedOrigins.length === 0 ? (
                <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
                  No websites yet. Add your site&apos;s address so the chat can load there.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {form.allowedOrigins.map((o) => (
                    <li key={o} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="flex-1 truncate font-mono text-[13px] text-text">{o}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${o}`}
                        onClick={() => set("allowedOrigins", form.allowedOrigins.filter((x) => x !== o))}
                      >
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOrigin();
                    }
                  }}
                  placeholder="https://shop.example.com"
                  aria-label="Website address"
                  aria-invalid={originError ? true : undefined}
                  className="font-mono text-[13px]"
                />
                <Button type="button" variant="secondary" onClick={addOrigin}>
                  <Plus aria-hidden /> Add
                </Button>
              </div>
              {originError && <p className="text-[13px] font-medium text-danger">{originError}</p>}
              {errors.allowedOrigins && <p className="text-[13px] font-medium text-danger">{errors.allowedOrigins}</p>}
              <p className="text-[13px] text-muted">Use the exact scheme and host, for example both https://example.com and https://www.example.com if you use both.</p>
            </fieldset>
          </Panel>

          <Panel title="Appearance and behaviour">
            <form onSubmit={save}>
              <fieldset disabled={!isAdmin} className="space-y-5">
                <legend className="sr-only">Appearance and behaviour</legend>
                <label className="flex items-start gap-3">
                  <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Chat enabled" />
                  <span className="text-sm">
                    <span className="font-medium text-text">Chat enabled</span>
                    <span className="block text-[13px] text-muted">Turn off to hide the chat everywhere without removing the code.</span>
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title" error={errors.title}>
                    <Input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={60} />
                  </Field>
                  <Field label="Launcher label" error={errors.launcherLabel}>
                    <Input value={form.launcherLabel} onChange={(e) => set("launcherLabel", e.target.value)} maxLength={30} />
                  </Field>
                </div>
                <Field label="Greeting" error={errors.greeting}>
                  <Textarea value={form.greeting} onChange={(e) => set("greeting", e.target.value)} rows={2} maxLength={300} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Brand colour" error={errors.brandColor} hint="Text on the colour switches between white and black for contrast.">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={form.brandColor}
                        onChange={(e) => set("brandColor", e.target.value)}
                        aria-label="Pick brand colour"
                        className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1 sm:h-9"
                      />
                      <Input value={form.brandColor} onChange={(e) => set("brandColor", e.target.value)} maxLength={7} className="font-mono" aria-label="Brand colour hex code" />
                    </div>
                  </Field>
                  <Field label="Position">
                    <Select value={form.position} onChange={(e) => set("position", e.target.value as "left" | "right")}>
                      <option value="right">Bottom right</option>
                      <option value="left">Bottom left</option>
                    </Select>
                  </Field>
                </div>
                <label className="flex items-start gap-3">
                  <Switch checked={form.requireEmail} onCheckedChange={(v) => set("requireEmail", v)} aria-label="Ask for an email first" />
                  <span className="text-sm">
                    <span className="font-medium text-text">Ask for an email before the first message</span>
                    <span className="block text-[13px] text-muted">Useful if your team replies later by email. Leave off to collect as little as possible.</span>
                  </span>
                </label>
                {!data.removeBrandingAvailable && (
                  <p className="text-[13px] text-muted">The “Powered by SupportFlow” line can be removed on the Pro and Business plans.</p>
                )}
              </fieldset>
            </form>
          </Panel>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Panel title="Live preview" description={dirty ? "Save to see your changes." : "This is the real chat. Messages you send here appear in your inbox."}>
            {data.config.enabled ? (
              <WidgetPreview scriptUrl={data.scriptUrl} publicKey={data.config.publicKey} version={version} />
            ) : (
              <p className="grid h-40 place-items-center text-sm text-muted">The chat is disabled.</p>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
