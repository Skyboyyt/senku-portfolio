import type { Metadata } from "next";
import { Container, PageIntro } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What SupportFlow collects, why, how long it is kept, and your choices.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageIntro eyebrow="Legal" title="Privacy policy">
        Last updated 23 October 2026
      </PageIntro>
      <Container className="pb-20">
        <div className="prose-sf">
          <p>
            This policy explains what information SupportFlow handles, why, and the choices you have. SupportFlow is an
            independent software project designed and built by Fahad Sani. It covers two groups of people:{" "}
            <strong>workspace users</strong> (the businesses and staff who sign up) and <strong>website visitors</strong>{" "}
            who use a SupportFlow chat on a business&apos;s website.
          </p>

          <h2>Who is responsible</h2>
          <p>
            For workspace accounts, SupportFlow is responsible for your account information. For conversations with
            website visitors, the business that installed the chat decides what is collected and why; SupportFlow
            processes that information on the business&apos;s behalf. Visitors should contact that business about their
            data, and businesses can delete it from their dashboard.
          </p>

          <h2>What we collect</h2>
          <h3>Workspace users</h3>
          <ul>
            <li>Name, email address and a hashed password (Argon2id). We never store your password itself.</li>
            <li>Workspace settings, help-centre articles, tickets, notes and replies you write.</li>
            <li>Session records: a hashed session identifier, IP address, browser user agent and timestamps.</li>
            <li>An audit log of administrative actions such as role changes, setting changes and deletions.</li>
            <li>Billing status. If card billing is enabled, payments are handled by Stripe; we never see or store card numbers.</li>
          </ul>
          <h3>Website visitors</h3>
          <ul>
            <li>The messages you send in the chat and the replies you receive.</li>
            <li>Your name and email address only if you choose to give them, or if the business requires an email to reply.</li>
            <li>A random visitor identifier stored in your browser so you can continue a conversation. We store only a hash of it.</li>
            <li>A satisfaction rating and comment, if you choose to leave one.</li>
          </ul>
          <p>We do not use advertising trackers, sell personal information or build profiles across websites.</p>

          <h2>How we use it</h2>
          <ul>
            <li>To provide the service: deliver messages, show conversations to the business, and enforce plan limits.</li>
            <li>To generate AI replies, drafts and summaries when the business has turned this on (see below).</li>
            <li>To keep the service secure: rate limiting, abuse prevention and audit logs.</li>
            <li>To reply to messages sent through our contact form.</li>
          </ul>

          <h2>AI processing</h2>
          <p>
            When a business enables AI features, the visitor&apos;s recent messages and relevant passages from that
            business&apos;s published help articles are sent to the configured AI provider (for example Anthropic or
            OpenAI) to produce a reply. Internal notes are never sent. Each request contains one workspace&apos;s data only.
            Providers process this data under their API terms; we do not ask them to train models on it. Every AI-written
            message is labelled in the chat.
          </p>

          <h2>Cookies and browser storage</h2>
          <ul>
            <li><strong>sf_session</strong>: an httpOnly cookie that keeps you signed in to the dashboard. It expires after 30 days of inactivity or when you sign out.</li>
            <li><strong>sf-theme</strong>: remembers your light or dark choice in local storage.</li>
            <li>On business websites, the chat stores its visitor identifier in local storage for that website only.</li>
          </ul>

          <h2>How long we keep it</h2>
          <ul>
            <li>Conversations are kept until the business deletes them. Businesses can set automatic deletion of resolved conversations after a period they choose.</li>
            <li>Conversations in the public homepage demo are deleted after 24 hours.</li>
            <li>Expired sessions are removed automatically. Audit log entries are kept for one year.</li>
            <li>Contact form messages are deleted within 12 months.</li>
            <li>When a workspace is deleted, all of its data is deleted with it.</li>
          </ul>

          <h2>Your choices</h2>
          <ul>
            <li>Workspace users can update their name and password, leave a workspace, or ask the owner to delete it.</li>
            <li>Businesses can delete an individual customer and all of their conversations from the Customers page.</li>
            <li>Website visitors can ask the business that runs the chat to access or delete their conversations.</li>
          </ul>

          <h2>Security</h2>
          <p>
            Data is scoped to its workspace on every request, connections are encrypted in transit, and access depends on
            your role. No system is perfectly secure; if you believe you&apos;ve found a vulnerability, please tell us
            through the contact page.
          </p>

          <h2>Changes and contact</h2>
          <p>
            We&apos;ll update this page when our practices change and revise the date at the top. Questions? Use the{" "}
            <a href="/contact">contact form</a>.
          </p>
        </div>
      </Container>
    </>
  );
}
