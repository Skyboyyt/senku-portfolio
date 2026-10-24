import type { Metadata } from "next";
import { Container, PageIntro } from "@/components/marketing/section";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about SupportFlow, plans or security? Send us a message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageIntro eyebrow="Contact" title="Talk to us">
        Questions about plans, security reviews or a larger rollout? Send a message and we&apos;ll reply by email.
      </PageIntro>
      <Container className="grid gap-12 pb-20 lg:grid-cols-[1.3fr_1fr]">
        <ContactForm />
        <aside className="space-y-8 text-[15px]">
          <div>
            <h2 className="font-semibold text-text">Already a customer?</h2>
            <p className="mt-1.5 text-muted">Sign in and use the chat on this site, or ask your workspace owner, who can see your plan and billing.</p>
          </div>
          <div>
            <h2 className="font-semibold text-text">Security questions</h2>
            <p className="mt-1.5 text-muted">
              Mention “security” in your message and include what you need, for example a description of data handling or
              our sub-processors.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-text">What we do with this form</h2>
            <p className="mt-1.5 text-muted">
              We store your name, email, company and message so we can reply, and delete them within 12 months. See the{" "}
              <a href="/privacy" className="text-primary underline underline-offset-4">privacy policy</a>.
            </p>
          </div>
        </aside>
      </Container>
    </>
  );
}
