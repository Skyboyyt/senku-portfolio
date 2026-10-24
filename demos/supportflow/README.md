# SupportFlow AI

A multi-tenant customer support platform: a shared inbox, help centre, tickets and an embeddable website chat, with an AI assistant that answers from each business's own published articles and hands over to people when it isn't sure — or when the topic is refunds, billing or accounts.

Designed and built by Fahad Sani as a full-stack portfolio project.

| | |
| --- | --- |
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix primitives, Motion, Lucide |
| API | Fastify 5, TypeScript, Drizzle ORM, PostgreSQL, WebSockets, Zod |
| AI | Anthropic, OpenAI or Cloudflare Workers AI, with retrieval over Postgres full-text search; a no-LLM "excerpt" mode |
| Billing | Stripe Checkout, Customer Portal and signed webhooks; dev-only test mode |
| Tests | Vitest (unit + API integration on real Postgres), Playwright (end-to-end + axe accessibility) |

## Repository layout

```
demos/supportflow/
  apps/api          Fastify API, database schema, migrations, AI, billing, realtime
  apps/web          Next.js marketing site and dashboard
  packages/shared   Zod schemas, plan limits, DTO types shared by API and web
  packages/widget   Embeddable chat script (built into apps/api/public/widget.js)
  e2e               Playwright tests
  docs              Architecture, API, security and deployment documents
  scripts           Screenshot tool and e2e server launcher
```

More detail: [Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API.md) · [Security checklist](docs/SECURITY.md) · [Deployment](docs/DEPLOYMENT.md) · [Progress log](PROGRESS.md) · [Case study](docs/CASE_STUDY.md)

## Running locally

Requirements: Node.js 22+, pnpm 10 (`corepack enable`), PostgreSQL 15+.

```bash
cd demos/supportflow
pnpm install
cp .env.example .env            # then set PROXY_SHARED_SECRET (openssl rand -hex 32)
createdb supportflow             # or create it in your Postgres tool
pnpm db:migrate                  # apply migrations
pnpm demo:setup                  # creates the homepage demo workspace; prints NEXT_PUBLIC_DEMO_WIDGET_KEY
pnpm db:seed                     # optional sample workspace (development only)
ln -s ../../.env apps/web/.env.local   # the web app reads the same file
pnpm dev                         # API on :4000, web on :3000
```

Open http://localhost:3000. With the seed loaded, sign in as `owner@supportflow.test` / `supportflow-dev` (or `agent@supportflow.test`). These accounts exist only in your local database; the seed script refuses to run with `NODE_ENV=production`.

Without an AI key the API uses the **extractive** provider: replies are excerpts of the best-matching article, clearly worded as such, and summaries are unavailable. Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` + `AI_MODEL`) to use a language model. On Cloudflare Workers, `AI_PROVIDER=workers-ai` uses Workers AI through the `AI` binding instead, with no key (Llama 3.3 70B by default; `AI_MODEL` picks another model).

`BILLING_MODE=test` lets the owner switch plans instantly without payment so plan limits can be tried. It is refused at startup when `NODE_ENV=production`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds the widget, then runs the API (tsx watch) and web (next dev) |
| `pnpm build` | Builds shared, widget, API (tsup) and web (next build) |
| `pnpm typecheck` / `pnpm lint` | TypeScript strict checks / ESLint across the workspace |
| `pnpm test` | Unit and API integration tests (needs Postgres; uses the `supportflow_test` database) |
| `pnpm e2e` | Playwright end-to-end tests (needs Postgres; resets the `supportflow_e2e` database) |
| `pnpm db:generate` | Generates a migration after changing `apps/api/src/db/schema.ts` |
| `pnpm db:migrate` | Applies pending migrations |
| `node scripts/screenshot.mjs <url> <out.png>` | Captures a real screenshot of the running app |

Test databases are reset automatically. The test runners refuse to reset any database whose name doesn't end in `_test` / `_e2e`.

If Playwright can't find a browser, point it at an installed Chromium with `CHROMIUM_PATH=/path/to/chrome pnpm e2e`.

## What is implemented

- **Accounts and workspaces:** registration, sign-in, server-side sessions, multiple workspaces per user, owner/admin/agent roles, invitations with seat limits, member removal, profile and password changes, workspace deletion, audit log.
- **Inbox:** live conversation list with views, search and unread state; replies, internal notes, assignment, statuses, takeover from the AI, AI drafts (send, edit, discard), summaries, linked tickets.
- **AI assistant:** off / suggestions / approval / automatic modes; retrieval over published articles only; JSON replies with confidence and sources; deterministic guards for refunds, billing, account and legal topics, unapproved links and promises; confidence threshold; usage limits and token tracking; escalation to a person on any failure.
- **Knowledge base:** Markdown articles, categories, drafts, publishing, archiving, import from `.md`/`.txt`, automatic re-indexing, retrieval testing.
- **Tickets:** per-workspace numbering, owners, priorities, statuses, comments, history, search and filters.
- **Website chat:** one script tag; floating or inline; brand colour, title, greeting and position; origin allow-list; conversation continuity; handoff; email capture; satisfaction rating; realtime updates with polling fallback.
- **Analytics:** volume, first-response and resolution medians, AI outcomes and escalation rate, tokens, workload, satisfaction — all from SQL, with empty states rather than invented numbers.
- **Billing:** Free/Starter/Pro/Business plans enforced by the API; Stripe Checkout, Portal and idempotent signed webhooks.
- **Privacy:** per-customer deletion, configurable automatic deletion of resolved conversations, minimal visitor data.
- **Public site:** home (with a live demo on an isolated fictional workspace), features, how it works, pricing, contact, privacy, terms, sitemap, robots, Open Graph image.

## Known limitations

These are deliberate scope limits, documented rather than faked:

- **Email delivery** isn't connected. Invitation links are shown once to the admin to share; there is no password-reset email yet.
- **Realtime** uses an in-process event bus, so the API runs as a single instance. Scaling out needs Postgres `LISTEN/NOTIFY` or Redis behind the same `RealtimeBus` interface.
- **Rate limits** are kept in memory per instance (same reason).
- **Retrieval** uses Postgres full-text search, which handles keyword overlap well but not paraphrases. Embeddings (pgvector) would improve recall; the retrieval module is isolated for that change.
- **Attachments** aren't supported in chat, so there is no file-upload surface.
- **Live** at https://supportflow-omega.vercel.app (web app on Vercel; API on Cloudflare Workers; Postgres on Neon; a Cloudflare copy of the web app runs at https://supportflow-web.sanifahad24.workers.dev) with AI replies from Cloudflare Workers AI (free daily allowance) and billing disabled. See [Deployment](docs/DEPLOYMENT.md).
