import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageIntro } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features",
  description: "Shared inbox, AI replies grounded in your help centre, tickets, knowledge base, website chat and analytics.",
  alternates: { canonical: "/features" },
};

const SECTIONS = [
  {
    id: "inbox",
    title: "Shared inbox",
    lead: "Every website conversation in one place, updated live.",
    points: [
      "Filter by status, assignee, unread or “needs a person”, and search names, emails and message text",
      "Assign conversations, mark them pending or resolved, and see who is handling what",
      "Internal notes that customers never see",
      "Take over from the AI at any point; the customer is told a person has joined",
      "Read and unread state per agent",
    ],
  },
  {
    id: "ai",
    title: "AI assistant",
    lead: "Choose how much the AI does, per workspace.",
    points: [
      "Off, suggestions on request, drafts for approval, or automatic replies when confident",
      "Replies grounded in your published articles, with the sources shown to agents",
      "A confidence threshold you set; below it, the AI hands over instead of replying",
      "Refunds, billing, account changes and legal questions always go to a person",
      "Conversation summaries for long threads (Pro and Business)",
      "Monthly AI response limits per plan, with token usage tracked",
      "If the AI provider is down, customers are told a person will reply, and nothing is lost",
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge base",
    lead: "The content the AI answers from, under your control.",
    points: [
      "Write articles in Markdown, organise them in categories, and search them",
      "Draft, published and archived states; only published articles are used by the AI",
      "Import approved documentation from Markdown or text files, split on headings",
      "Articles are re-indexed automatically when published or edited",
      "Test which passages the AI would find for a question before customers ask it",
    ],
  },
  {
    id: "tickets",
    title: "Tickets",
    lead: "For work that takes longer than a chat.",
    points: [
      "Create a ticket from any conversation, linked to the customer",
      "Owners, priorities (low to urgent) and statuses from open to closed",
      "Internal comments and a full change history",
      "Search by title, description, customer email or ticket number",
    ],
  },
  {
    id: "widget",
    title: "Website chat",
    lead: "One script tag, styled to your brand.",
    points: [
      "Floating launcher or inline panel; full screen on phones",
      "Your colour, title, greeting and launcher label",
      "Customers pick up where they left off when they return",
      "A clear “Talk to a person” option whenever the AI is answering",
      "Optional email capture before the first message, and a rating after resolution",
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    lead: "Numbers calculated from your own conversations.",
    points: [
      "Conversation volume, tickets opened and resolved, and median first-response time per day",
      "AI responses, escalation rate, errors and token usage",
      "Agent workload across open conversations and tickets",
      "Customer satisfaction, when you choose to collect it",
    ],
  },
  {
    id: "security",
    title: "Security and privacy",
    lead: "Built so one business can never see another's data.",
    points: [
      "Workspace-scoped queries and server-side authorization on every request",
      "Owner, admin and agent roles; removed members lose access immediately",
      "Argon2id password hashing and server-side sessions in httpOnly, SameSite cookies",
      "The widget only runs on websites you allow, and its public key grants no dashboard access",
      "Rate limits on sign-in, chat and public endpoints; spam filtering on the widget",
      "Audit log of administrative actions",
      "Automatic deletion of old resolved conversations, and per-customer deletion on request",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageIntro eyebrow="Features" title="Everything a small support team needs, and nothing it has to babysit">
        SupportFlow combines a shared inbox, a help centre, tickets and a website chat, with an AI assistant that works
        inside clear limits.
      </PageIntro>
      <Container className="pb-20">
        <nav aria-label="On this page" className="mb-12 flex flex-wrap gap-2 border-y border-border py-4">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text">
              {s.title}
            </a>
          ))}
        </nav>
        <div className="divide-y divide-border">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="grid scroll-mt-24 gap-6 py-10 md:grid-cols-[1fr_2fr] md:gap-12">
              <div>
                <h2 id={`${s.id}-h`} className="text-xl font-semibold tracking-[-0.01em] text-text">{s.title}</h2>
                <p className="mt-2 text-[15px] text-muted">{s.lead}</p>
              </div>
              <ul className="space-y-3">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-text">
                    <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-primary" />
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/register" className={buttonVariants({ size: "lg" })}>Create a free workspace</Link>
          <Link href="/pricing" className={buttonVariants({ variant: "secondary", size: "lg" })}>See pricing</Link>
        </div>
      </Container>
    </>
  );
}
