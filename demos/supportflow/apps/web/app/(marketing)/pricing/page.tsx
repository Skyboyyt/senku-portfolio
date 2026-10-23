import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, PLAN_IDS, formatPrice } from "@supportflow/shared";
import { Container, PageIntro } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free, Starter, Pro and Business plans for SupportFlow, with seats, AI responses and article limits.",
  alternates: { canonical: "/pricing" },
};

const BILLING_MODE = process.env.NEXT_PUBLIC_BILLING_MODE ?? "test";

const FAQ = [
  ["What counts as an AI response?", "Each automatic reply, draft or summary the AI produces. Attempts that fail because the AI provider is down still count, because they still use the provider. When you reach your monthly limit, the AI stops and conversations go straight to your team."],
  ["What happens if we go over our seats?", "You can't invite more people until you upgrade or remove a member. Pending invitations count as seats."],
  ["Can we change plans later?", "Yes. Upgrades apply as soon as payment is confirmed. If you downgrade, existing members and articles stay, but you can't add more until you're within the new limits."],
  ["Is there a contract?", "No. Plans are monthly and you can cancel at any time from the billing page."],
];

export default function PricingPage() {
  return (
    <>
      <PageIntro eyebrow="Pricing" title="Simple plans that grow with your volume">
        Every plan includes the shared inbox, tickets, knowledge base, website chat and analytics. Prices are in US dollars
        per workspace per month.
      </PageIntro>
      <Container className="pb-20">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const featured = id === "pro";
            return (
              <section key={id} aria-labelledby={`plan-${id}`} className={cn("flex flex-col bg-surface p-6", featured && "bg-primary-soft/40")}>
                <div className="flex items-center justify-between">
                  <h2 id={`plan-${id}`} className="text-base font-semibold text-text">{plan.name}</h2>
                  {featured && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg">Most teams</span>}
                </div>
                <p className="mt-1 min-h-10 text-sm text-muted">{plan.description}</p>
                <p className="mt-5">
                  <span className="font-display text-[2.75rem] leading-none text-text">{formatPrice(plan.priceCents)}</span>
                  <span className="ml-1 text-sm text-muted">/ month</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  <Row ok>{plan.limits.seats} seats</Row>
                  <Row ok>{plan.limits.aiResponsesPerMonth.toLocaleString("en-US")} AI responses a month</Row>
                  <Row ok>{plan.limits.articles === null ? "Unlimited articles" : `${plan.limits.articles} articles`}</Row>
                  <Row ok={plan.features.autoReply}>Automatic AI replies</Row>
                  <Row ok={plan.features.summaries}>AI conversation summaries</Row>
                  <Row ok={plan.features.removeBranding}>Remove “Powered by SupportFlow”</Row>
                </ul>
                <Link
                  href={`/register${id === "free" ? "" : `?plan=${id}`}`}
                  className={cn(buttonVariants({ variant: featured ? "primary" : "secondary" }), "mt-8 w-full")}
                >
                  {id === "free" ? "Start free" : `Start with ${plan.name}`}
                </Link>
              </section>
            );
          })}
        </div>
        <p className="mt-4 text-[13px] text-subtle">
          {BILLING_MODE === "stripe"
            ? "Payments are processed by Stripe. Paid plans start on the Free plan; upgrade from Billing in your dashboard."
            : "Every workspace starts on Free. Card payments are not enabled on this deployment, so no one is charged."}
        </p>

        <section aria-labelledby="faq" className="mt-20 max-w-3xl">
          <h2 id="faq" className="text-[1.75rem] font-semibold tracking-[-0.02em]">Questions</h2>
          <dl className="mt-6 divide-y divide-border border-y border-border">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-5">
                <dt className="font-medium text-text">{q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Container>
    </>
  );
}

function Row({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2.5", ok ? "text-text" : "text-subtle")}>
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>
        {children}
        {!ok && <span className="sr-only"> (not included)</span>}
      </span>
    </li>
  );
}
