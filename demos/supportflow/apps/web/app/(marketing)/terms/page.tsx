import type { Metadata } from "next";
import { Container, PageIntro } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms that apply when you use SupportFlow.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <PageIntro eyebrow="Legal" title="Terms of service">
        Last updated 23 October 2026
      </PageIntro>
      <Container className="pb-20">
        <div className="prose-sf">
          <p>
            These terms apply when you create a SupportFlow workspace or use the service. SupportFlow is an independent
            software project designed and built by Fahad Sani. By creating an account you agree to them.
          </p>

          <h2>Your account</h2>
          <ul>
            <li>You must give accurate information and keep your password secure.</li>
            <li>The workspace owner controls the workspace, its members and its data, and is responsible for the people they invite.</li>
            <li>You must be old enough to form a binding contract where you live.</li>
          </ul>

          <h2>Your content and your customers</h2>
          <p>
            You own the content you add, including help articles, replies and customer conversations. You give us
            permission to store and process it only to provide the service to you. You are responsible for having a
            lawful basis to collect your customers&apos; information, and for telling them about the chat on your website.
          </p>

          <h2>AI features</h2>
          <ul>
            <li>AI replies are generated from your published articles and can still be wrong. You decide which AI mode to use and are responsible for the content you publish.</li>
            <li>The assistant is designed not to issue refunds, change accounts or make commitments; those requests are passed to your team.</li>
            <li>AI usage counts towards your plan&apos;s monthly limit.</li>
          </ul>

          <h2>Acceptable use</h2>
          <p>Don&apos;t use SupportFlow to:</p>
          <ul>
            <li>send spam, malware or unlawful content, or harass people;</li>
            <li>attempt to access another workspace&apos;s data, probe or overload the service, or get around plan limits;</li>
            <li>collect sensitive information such as card numbers or passwords through the chat.</li>
          </ul>
          <p>We may suspend workspaces that break these rules or put other customers at risk.</p>

          <h2>Plans and billing</h2>
          <ul>
            <li>Paid plans are billed monthly in advance through Stripe when card billing is enabled. You can cancel at any time; your plan stays active until the end of the paid period.</li>
            <li>Plan limits (seats, AI responses and articles) are enforced automatically.</li>
            <li>We&apos;ll give at least 30 days&apos; notice of price changes for existing subscriptions.</li>
          </ul>

          <h2>Availability</h2>
          <p>
            We work to keep SupportFlow available and your data safe, but the service is provided “as is”, without a
            guaranteed uptime commitment. Keep your own copies of anything critical.
          </p>

          <h2>Ending your use</h2>
          <p>
            You can delete your workspace at any time from Settings. Deletion is permanent and removes all of the
            workspace&apos;s data.
          </p>

          <h2>Liability</h2>
          <p>
            To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability
            is limited to the amount you paid for the service in the 12 months before the claim. Nothing in these terms
            limits liability that can&apos;t be limited by law.
          </p>

          <h2>Changes and contact</h2>
          <p>
            We may update these terms and will revise the date above. Questions? Use the{" "}
            <a href="/contact">contact form</a>.
          </p>
        </div>
      </Container>
    </>
  );
}
