import { BookOpenText, Gauge, Hand, Inbox, Link2Off, ShieldCheck, Tag, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, PLAN_IDS, formatPrice } from "@supportflow/shared";
import { LiveDemo } from "@/components/marketing/live-demo";
import { Container, Eyebrow } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "SupportFlow — AI-assisted customer support" },
  alternates: { canonical: "/" },
};

const FLOW = [
  {
    step: "A customer asks",
    detail: "From the chat on your website. SupportFlow keeps the conversation going if they come back later.",
  },
  {
    step: "SupportFlow looks it up",
    detail: "It searches only the help articles you've published, and drafts a reply that cites them.",
  },
  {
    step: "It answers, or hands over",
    detail:
      "Confident answers go out labelled as AI. Anything uncertain, or about refunds, billing or accounts, goes to a person.",
  },
  {
    step: "Your team takes it from there",
    detail: "The conversation lands in the shared inbox with the draft, the sources and the full history.",
  },
];

const GUARDRAILS = [
  { icon: BookOpenText, title: "Grounded in your articles", body: "Answers come from published help-centre content only. Drafts and archived articles are never used." },
  { icon: Gauge, title: "A confidence bar you set", body: "Below your threshold, the AI doesn't reply. It saves a draft for an agent instead." },
  { icon: Hand, title: "No promises, no refunds", body: "Refunds, cancellations and account changes always go to a person, even when the AI is sure." },
  { icon: Link2Off, title: "Links are checked", body: "A reply containing a link that isn't in your articles is held back for review." },
  { icon: Tag, title: "Every AI message is labelled", body: "Customers and agents can always tell what the AI wrote and what a person wrote." },
  { icon: Users, title: "Approval mode", body: "Prefer to check everything first? The AI drafts every reply and an agent sends it." },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-border">
        <Container className="grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
          <div>
            <Eyebrow>Customer support with AI on a short leash</Eyebrow>
            <h1 className="mt-4 font-display text-[2.75rem] leading-[1.04] tracking-[-0.015em] text-text sm:text-[3.75rem]">
              Answers in seconds.
              <br />
              <span className="italic text-primary">People</span> in charge.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              SupportFlow answers website chats from your own help articles, replies on its own only when it&apos;s sure,
              and hands everything else to your team with a draft ready to send.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Create a free workspace
              </Link>
              <Link href="/how-it-works" className="text-[15px] font-medium text-text underline decoration-border-strong underline-offset-[6px] hover:decoration-text">
                See how it works
              </Link>
            </div>
            <p className="mt-6 text-sm text-subtle">Free plan, no card required. Set up in about ten minutes.</p>
          </div>

          <div>
            <LiveDemo />
            <p className="mt-3 text-[13px] leading-relaxed text-subtle">
              <span className="font-medium text-muted">Live demo.</span> Larkspur Coffee Roasters is a fictional shop.
              The assistant answers from its sample help centre, and demo chats are deleted after 24 hours. No staff
              watch the demo, so handoffs aren&apos;t answered.
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="flow-heading" className="border-b border-border bg-surface">
        <Container className="py-16 sm:py-20">
          <div className="max-w-2xl">
            <Eyebrow>What happens to a message</Eyebrow>
            <h2 id="flow-heading" className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              The AI does the routine part. Your team keeps the judgement calls.
            </h2>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
            {FLOW.map((item, i) => (
              <li key={item.step} className="bg-surface p-6">
                <span className="font-mono text-[13px] text-subtle">0{i + 1}</span>
                <h3 className="mt-3 text-[15px] font-semibold text-text">{item.step}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.detail}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="inbox-heading" className="border-b border-border">
        <Container className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Eyebrow>For the team</Eyebrow>
            <h2 id="inbox-heading" className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              One inbox, with the context already there
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-muted">
              Conversations arrive in real time. Each one shows what the customer asked, what the AI suggested and why,
              and which articles it used. Take over with one click, leave internal notes, or turn it into a ticket.
            </p>
            <ul className="mt-6 space-y-2.5 text-[15px] text-text">
              {[
                "Assign, filter and search every conversation",
                "Approve, edit or discard AI drafts",
                "Tickets with priorities, owners and history",
                "AI summaries for long threads (Pro and above)",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <InboxIllustration />
        </Container>
      </section>

      <section aria-labelledby="guardrails-heading" className="border-b border-border bg-surface">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <Eyebrow>Guardrails</Eyebrow>
              <h2 id="guardrails-heading" className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2rem]">
                Rules the AI can&apos;t talk its way around
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                These checks run in code around the model, so they still hold if a message or an article tries to give the
                AI new instructions.
              </p>
            </div>
            <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {GUARDRAILS.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <dt className="flex items-center gap-2.5 text-[15px] font-semibold text-text">
                    <Icon className="size-[18px] text-primary" aria-hidden />
                    {title}
                  </dt>
                  <dd className="mt-1.5 pl-[30px] text-sm leading-relaxed text-muted">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      <section aria-labelledby="security-heading" className="border-b border-border">
        <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:items-start">
          <div>
            <Eyebrow>Security</Eyebrow>
            <h2 id="security-heading" className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2rem]">
              Every workspace is walled off
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-muted">
              Each business&apos;s conversations, customers, articles and settings are scoped to its workspace on every
              query, and checked on the server for every request. The AI only ever sees one workspace&apos;s content.
            </p>
            <Link href="/features#security" className="mt-5 inline-flex min-h-10 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline">
              Read about security
            </Link>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {[
              ["Roles", "Owner, admin and agent permissions, enforced by the API"],
              ["Sessions", "Server-side sessions in httpOnly cookies; passwords hashed with Argon2id"],
              ["Widget", "Works only on websites you allow; its public key can't open the dashboard"],
              ["Audit log", "Settings, member, article and billing changes are recorded"],
              ["Retention", "Delete resolved conversations automatically, or a customer's data on request"],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-4 px-5 py-4">
                <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-text">{title}</p>
                  <p className="mt-0.5 text-sm text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="pricing-heading" className="border-b border-border bg-surface">
        <Container className="py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Pricing</Eyebrow>
              <h2 id="pricing-heading" className="mt-3 text-[1.75rem] font-semibold tracking-[-0.02em] sm:text-[2rem]">
                Start free. Upgrade when the volume does.
              </h2>
            </div>
            <Link href="/pricing" className={buttonVariants({ variant: "secondary" })}>
              Compare plans
            </Link>
          </div>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Plans and their main limits</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-3 pr-4 font-medium">Plan</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Per month</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Seats</th>
                  <th scope="col" className="py-3 pr-4 font-medium">AI responses</th>
                  <th scope="col" className="py-3 font-medium">Automatic replies</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_IDS.map((id) => {
                  const plan = PLANS[id];
                  return (
                    <tr key={id} className="border-b border-border last:border-0">
                      <th scope="row" className="py-3.5 pr-4 font-semibold text-text">{plan.name}</th>
                      <td className="py-3.5 pr-4 font-mono text-text">{formatPrice(plan.priceCents)}</td>
                      <td className="py-3.5 pr-4 text-muted">{plan.limits.seats}</td>
                      <td className="py-3.5 pr-4 text-muted">{plan.limits.aiResponsesPerMonth.toLocaleString("en-US")}</td>
                      <td className="py-3.5 text-muted">{plan.features.autoReply ? "Included" : "Drafts only"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-20 text-center sm:py-24">
          <h2 className="mx-auto max-w-2xl font-display text-[2.25rem] leading-[1.1] tracking-[-0.01em] sm:text-[2.75rem]">
            Put your help centre to work.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-muted">
            Create a workspace, publish a few articles, and add one script tag to your website.
          </p>
          <Link href="/register" className={`${buttonVariants({ size: "lg" })} mt-8`}>
            Create a free workspace
          </Link>
        </Container>
      </section>
    </>
  );
}

/** A simplified, static rendering of the inbox to explain the layout. */
function InboxIllustration() {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-md" aria-labelledby="inbox-figure-caption">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Inbox className="size-4 text-muted" aria-hidden />
        <span className="text-sm font-medium">Inbox</span>
        <span className="ml-auto rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Needs a person · 1</span>
      </div>
      <div className="grid sm:grid-cols-[200px_1fr]">
        <ul className="hidden border-r border-border text-sm sm:block" aria-hidden>
          {[
            ["Priya", "Can I change my delivery address?", true],
            ["Tom", "Which grind for a moka pot?", false],
            ["Lena", "Is the Ethiopia roast back?", false],
          ].map(([name, text, active]) => (
            <li key={String(name)} className={`border-b border-border px-3 py-3 ${active ? "bg-surface-2" : ""}`}>
              <p className="font-medium text-text">{name}</p>
              <p className="truncate text-xs text-muted">{text}</p>
            </li>
          ))}
        </ul>
        <div className="space-y-3 p-4 text-sm" aria-hidden>
          <div className="max-w-[85%] rounded-lg bg-surface-2 px-3 py-2">Can I change my delivery address? I just ordered.</div>
          <div className="rounded-lg border border-ai-border bg-ai-soft p-3">
            <p className="text-xs font-semibold text-ai">AI draft · 41% confidence · held for review</p>
            <p className="mt-1.5 text-text">
              You can change the address until we start roasting your order. A member of the team will update it for you.
            </p>
            <p className="mt-2 text-xs text-muted">Source: Changing or cancelling an order</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg">Send</span>
              <span className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium">Edit</span>
            </div>
          </div>
        </div>
      </div>
      <figcaption id="inbox-figure-caption" className="sr-only">
        Illustration of the inbox: a conversation held for review with an AI draft, its confidence and its source article.
      </figcaption>
    </figure>
  );
}
