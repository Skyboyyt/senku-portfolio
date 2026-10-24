import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageIntro } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description: "Set up SupportFlow in five steps and see exactly what the AI will and won't do.",
  alternates: { canonical: "/how-it-works" },
};

const STEPS = [
  { title: "Create a workspace", body: "Sign up and name your workspace. Invite teammates as admins or agents when you're ready." },
  { title: "Add your help articles", body: "Write articles or import your existing documentation, then publish the ones the AI may use." },
  { title: "Choose the AI mode", body: "Start with suggestions or approval mode, then move to automatic replies with a confidence threshold that suits you." },
  { title: "Install the chat", body: "Add your website to the allowed list and paste one script tag before the closing body tag." },
  { title: "Work the inbox", body: "Conversations arrive live. Send or edit drafts, take over, add notes, and open tickets for longer work." },
];

const WILL = [
  "Answer questions your published articles cover",
  "Tell the customer when it is passing them to a person",
  "Cite the articles it used, for your team",
  "Draft replies for an agent to approve",
  "Summarise long conversations for your team",
];
const WONT = [
  "Issue refunds, credits or discounts",
  "Cancel or change orders or subscriptions",
  "Change account details or passwords",
  "Make promises or guarantees",
  "Use draft articles, internal notes or other workspaces' content",
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro eyebrow="How it works" title="From sign-up to your first AI-assisted reply">
        Most teams are answering real customers within an afternoon. Here is the whole process, and the rules the assistant
        follows.
      </PageIntro>
      <Container className="pb-20">
        <ol className="relative space-y-10 border-l border-border pl-8 sm:pl-10">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="absolute -left-[45px] top-0 grid size-7 place-items-center rounded-full border border-border bg-surface font-mono text-xs text-muted sm:-left-[53px]">
                {i + 1}
              </span>
              <h2 className="text-lg font-semibold text-text">{step.title}</h2>
              <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{step.body}</p>
              {i === 3 && (
                <pre tabIndex={0} aria-label="Example install code" className="mt-4 max-w-2xl overflow-x-auto rounded-lg border border-border bg-surface-2 p-4 font-mono text-[13px] leading-relaxed text-text">
                  <code>{`<script
  src="https://api.your-supportflow-host/widget.js"
  data-key="pk_your_public_key"
  async
></script>`}</code>
                </pre>
              )}
            </li>
          ))}
        </ol>

        <section aria-labelledby="rules" className="mt-20">
          <h2 id="rules" className="text-[1.75rem] font-semibold tracking-[-0.02em]">What the AI will and won&apos;t do</h2>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">
            The limits on the right are enforced in code, not only in the AI&apos;s instructions, so a cleverly worded message
            can&apos;t change them.
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            <div className="bg-surface p-6">
              <h3 className="text-sm font-semibold text-success">It will</h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-text">
                {WILL.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
            <div className="bg-surface p-6">
              <h3 className="text-sm font-semibold text-danger">It won&apos;t</h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-text">
                {WONT.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="modes" className="mt-20">
          <h2 id="modes" className="text-[1.75rem] font-semibold tracking-[-0.02em]">AI modes</h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {[
              ["Off", "No AI. Your team answers everything."],
              ["Suggestions on request", "Agents click “Suggest reply” when they want a draft."],
              ["Draft every reply for approval", "A draft is ready for each new message; nothing reaches the customer until an agent sends it."],
              ["Reply automatically when confident", "The AI replies when it is above your threshold and the topic is safe. Otherwise it hands over with a draft. Starter plan and above."],
            ].map(([term, desc]) => (
              <div key={term} className="grid gap-1 py-5 sm:grid-cols-[260px_1fr]">
                <dt className="font-medium text-text">{term}</dt>
                <dd className="text-[15px] text-muted">{desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-14">
          <Link href="/register" className={buttonVariants({ size: "lg" })}>Create a free workspace</Link>
        </div>
      </Container>
    </>
  );
}
