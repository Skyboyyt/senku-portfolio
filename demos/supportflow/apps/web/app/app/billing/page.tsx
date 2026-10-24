"use client";

import { Check, Minus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { PLANS, PLAN_IDS, formatPrice, getPlan, type PlanId, type SubscriptionDto } from "@supportflow/shared";
import { Meter } from "@/components/app/charts";
import { PageBody, PageHeader, Panel } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

export default function BillingPage() {
  return (
    <Suspense>
      <Billing />
    </Suspense>
  );
}

function Billing() {
  const params = useSearchParams();
  const toast = useToast();
  const { can, mutate: mutateSession } = useSession();
  const [polling, setPolling] = useState(params.get("checkout") === "success");
  const { data, error, mutate } = useSWR<SubscriptionDto>("/billing", { refreshInterval: polling ? 2000 : 0 });
  const [pending, setPending] = useState<string | null>(null);
  const wanted = params.get("plan") as PlanId | null;
  const isOwner = can("owner");

  useEffect(() => {
    if (params.get("checkout") === "success") toast("Payment received by Stripe. Your plan updates as soon as Stripe confirms it.");
    if (params.get("checkout") === "cancelled") toast("Checkout cancelled. Nothing was charged.", "info");
    if (!polling) return;
    const stop = setTimeout(() => setPolling(false), 20_000);
    return () => clearTimeout(stop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <PageBody><ErrorState message={errorMessage(error)} onRetry={() => void mutate()} /></PageBody>;
  if (!data) {
    return (
      <>
        <PageHeader title="Billing" />
        <PageBody className="space-y-6"><Skeleton className="h-40" /><Skeleton className="h-80" /></PageBody>
      </>
    );
  }

  const current = getPlan(data.plan);
  const hasStripeSubscription = data.provider === "stripe" && data.status !== "canceled";

  const checkout = async (plan: PlanId) => {
    setPending(plan);
    try {
      const { url } = await api<{ url: string }>("/billing/checkout", { body: { plan } });
      window.location.assign(url);
    } catch (e) {
      toast(errorMessage(e), "error");
      setPending(null);
    }
  };
  const portal = async () => {
    setPending("portal");
    try {
      const { url } = await api<{ url: string }>("/billing/portal", { body: {} });
      window.location.assign(url);
    } catch (e) {
      toast(errorMessage(e), "error");
      setPending(null);
    }
  };
  const testChange = async (plan: PlanId) => {
    await api("/billing/test/change-plan", { body: { plan } });
    await Promise.all([mutate(), mutateSession()]);
    toast(`Switched to ${PLANS[plan].name} in test mode. No payment was taken.`);
  };

  return (
    <>
      <PageHeader title="Billing" description="Your plan, usage and payment details." />
      <PageBody className="space-y-6">
        {data.billingMode === "test" && (
          <p role="note" className="rounded-md border border-info/30 bg-info-soft px-3.5 py-2.5 text-sm text-info">
            <strong className="font-semibold">Test mode.</strong> This server isn&apos;t connected to a payment provider. Plan
            changes apply immediately so you can try each plan&apos;s limits, and nobody is charged.
          </p>
        )}
        {data.billingMode === "disabled" && (
          <p role="note" className="rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
            Online payments aren&apos;t enabled on this server, so plans can&apos;t be changed here.
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Panel title="Current plan">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-2xl font-semibold tracking-[-0.02em] text-text">{current.name}</p>
              <p className="text-sm text-muted">{formatPrice(current.priceCents)} / month</p>
              <Badge tone={data.status === "active" || data.status === "trialing" ? "success" : data.status === "past_due" ? "warning" : "neutral"}>
                {data.status === "past_due" ? "Payment due" : data.status === "canceled" ? "Canceled" : data.status === "trialing" ? "Trial" : "Active"}
              </Badge>
              {data.provider === "test" && <Badge tone="info">Test mode</Badge>}
            </div>
            <p className="mt-2 text-sm text-muted">
              {data.currentPeriodEnd
                ? data.cancelAtPeriodEnd
                  ? `Ends on ${formatDate(data.currentPeriodEnd)}; the workspace then moves to Free.`
                  : `Renews on ${formatDate(data.currentPeriodEnd)}.`
                : current.id === "free"
                  ? "Free forever, within its limits."
                  : ""}
            </p>
            {data.status === "past_due" && (
              <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                Stripe couldn&apos;t take the last payment. Update your card in Manage billing to keep this plan.
              </p>
            )}
            {isOwner && data.billingMode === "stripe" && hasStripeSubscription && (
              <Button className="mt-4" variant="secondary" loading={pending === "portal"} onClick={() => void portal()}>
                Manage billing
              </Button>
            )}
            {!isOwner && <p className="mt-4 text-[13px] text-subtle">Only the workspace owner can change the plan.</p>}
          </Panel>

          <Panel title="Usage this month">
            <div className="space-y-5">
              <Meter label="AI responses" value={data.usage.aiResponses} max={current.limits.aiResponsesPerMonth} />
              <Meter label="Seats" value={data.usage.seats} max={current.limits.seats} hint="Pending invitations also use a seat." />
              {current.limits.articles !== null ? (
                <Meter label="Active articles" value={data.usage.articles} max={current.limits.articles} />
              ) : (
                <p className="text-sm text-muted">{data.usage.articles} active articles · unlimited on this plan</p>
              )}
            </div>
          </Panel>
        </div>

        <section aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="mb-3 text-[15px] font-semibold text-text">Plans</h2>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              const isCurrent = id === data.plan;
              const highlight = wanted === id && !isCurrent;
              return (
                <div key={id} className={cn("flex flex-col bg-surface p-5", highlight && "bg-primary-soft/40")}>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text">{plan.name}</h3>
                    {isCurrent && <Badge tone="primary">Current</Badge>}
                  </div>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-text">
                    {formatPrice(plan.priceCents)}<span className="text-sm font-normal text-muted"> / month</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-[13px]">
                    <Item ok>{plan.limits.seats} seats</Item>
                    <Item ok>{plan.limits.aiResponsesPerMonth.toLocaleString("en-US")} AI responses</Item>
                    <Item ok>{plan.limits.articles === null ? "Unlimited articles" : `${plan.limits.articles} articles`}</Item>
                    <Item ok={plan.features.autoReply}>Automatic replies</Item>
                    <Item ok={plan.features.summaries}>AI summaries</Item>
                    <Item ok={plan.features.removeBranding}>Remove branding</Item>
                  </ul>
                  <div className="mt-5">
                    {isCurrent || !isOwner ? null : data.billingMode === "test" ? (
                      <ConfirmDialog
                        trigger={<Button variant={highlight ? "primary" : "secondary"} className="w-full">Switch to {plan.name}</Button>}
                        title={`Switch to ${plan.name}?`}
                        description="Test mode: the plan and its limits change immediately and no payment is taken."
                        confirmLabel={`Switch to ${plan.name}`}
                        tone="primary"
                        onConfirm={() => testChange(id)}
                      />
                    ) : data.billingMode === "stripe" ? (
                      id === "free" ? (
                        hasStripeSubscription && (
                          <Button variant="secondary" className="w-full" onClick={() => void portal()} loading={pending === "portal"}>
                            Cancel in Manage billing
                          </Button>
                        )
                      ) : hasStripeSubscription ? (
                        <Button variant="secondary" className="w-full" onClick={() => void portal()} loading={pending === "portal"}>
                          Change in Manage billing
                        </Button>
                      ) : (
                        <Button variant={highlight ? "primary" : "secondary"} className="w-full" onClick={() => void checkout(id)} loading={pending === id}>
                          Upgrade to {plan.name}
                        </Button>
                      )
                    ) : (
                      <Button variant="secondary" className="w-full" disabled>Unavailable</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </PageBody>
    </>
  );
}

function Item({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2", ok ? "text-text" : "text-subtle")}>
      {ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> : <Minus className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      <span>{children}{!ok && <span className="sr-only"> (not included)</span>}</span>
    </li>
  );
}
