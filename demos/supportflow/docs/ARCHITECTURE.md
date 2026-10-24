# Architecture

## Overview

```
                        ┌──────────────────────────── Vercel ─────────────────────────────┐
 Browser (dashboard) ──▶│ Next.js web app                                                 │
                        │  • marketing pages (static)                                     │
                        │  • dashboard (client components + SWR)                          │
                        │  • /api/* route handler ── proxies to the API, adds             │
                        │    x-sf-proxy-secret + x-sf-client-ip                           │
                        └───────────────┬─────────────────────────────────────────────────┘
                                        │ HTTPS (server to server)
                        ┌───────────────▼──────────────────── Render ─────────────────────┐
 Browser (dashboard) ──▶│ Fastify API                                                      │
   WebSocket /realtime  │  • auth, workspaces, inbox, tickets, KB, analytics, billing      │
                        │  • public widget API /public/widget/:key/*  (CORS, origin check) │
 Customer website ─────▶│  • /widget.js (static)                                           │
   widget.js + XHR + WS │  • realtime bus (in-process) · background AI tasks · hourly jobs │
                        └──────┬───────────────────────┬─────────────────────┬────────────┘
                               │                       │                     │
                        ┌──────▼──────┐        ┌───────▼───────┐     ┌───────▼──────┐
                        │ PostgreSQL  │        │ AI provider   │     │ Stripe       │
                        │ (Neon)      │        │ Anthropic /   │     │ Checkout,    │
                        │             │        │ OpenAI        │     │ webhooks     │
                        └─────────────┘        └───────────────┘     └──────────────┘
```

## Key decisions

| Decision | Why |
| --- | --- |
| **Separate Fastify API** instead of Next.js route handlers | The API holds long-lived WebSockets, background AI work and hourly jobs, which don't fit serverless functions. It can scale independently of the web app. |
| **Same-origin `/api` proxy** in the web app | The session cookie is first-party to the web domain, so it isn't blocked as a third-party cookie and CSRF exposure is limited to one origin. The proxy forwards the visitor's IP with a shared secret so per-person rate limits still work. |
| **Ticketed WebSocket** for the dashboard | Serverless proxies can't carry WebSockets. The browser exchanges its cookie (through the proxy) for a single-use, 60-second ticket and connects to the API directly. |
| **Server-side sessions in Postgres** | Revocable (logout, password change signs out other devices, member removal applies immediately). Only a SHA-256 of the token is stored. |
| **Drizzle ORM** | Typed SQL close to the database, plain SQL migrations, and easy raw SQL for analytics. |
| **Postgres full-text search for retrieval** | Works on Neon without extensions or a vector store, filters by workspace in the same query, and is explainable to users ("80% of terms matched"). |
| **Provider-agnostic AI interface** | `LlmProvider.complete()` hides Anthropic/OpenAI differences. The assistant asks for JSON matching a schema and validates it with Zod. |
| **Guards outside the model** | Refund/billing/account detection, link checking and promise detection are deterministic code, so prompt injection can't switch them off. |
| **Shadow DOM widget**, no iframe | One small script (≈20 KB), styles isolated from the host page, and the browser's own `Origin` header enforces the allow-list. Message text is only ever set with `textContent`. |
| **Plan limits enforced in the API** | The web app only displays limits; every limit is checked server-side. |

## Packages

- **packages/shared** – Zod request schemas (used for client-side validation and by the API), plan definitions, enums and DTO types. The web app and API can't drift apart on validation rules.
- **apps/api** – `src/app.ts` builds the Fastify instance from injected dependencies (database, AI provider, fetch), which the tests use directly.
  - `routes/` – one module per area. Every protected handler starts with `requireMember(ctx, request, role)`.
  - `services/` – message posting, AI automation, workspace creation and limits, retention.
  - `ai/` – providers, retrieval and chunking, guards, the assistant.
  - `billing/` – Stripe REST client, webhook signature verification.
  - `realtime/` – event bus and WebSocket routes.
  - `db/` – schema, migrations runner, demo and seed scripts.
- **apps/web** – `app/(marketing)`, `app/(auth)` and `app/app` (the dashboard). Dashboard pages are client components using SWR; realtime events revalidate the affected queries.
- **packages/widget** – built with esbuild into `apps/api/public/widget.js`.

## Multi-tenancy

Every tenant-owned table has an `org_id` column with an index that starts with it. Handlers resolve the caller's workspace from the session and membership table on each request, and every query filters by that `org_id` — including lookups by primary key, so a valid ID from another workspace returns 404, not 403. Child records are re-checked against the parent's workspace (for example, a ticket's conversation, an assignee's membership, an article's category).

Retrieval adds `kb_chunks.org_id = $org` *and* joins `kb_articles` on the same org, so the AI prompt can only ever contain the calling workspace's published content.

The public widget identifies a workspace by its public key, which only reaches `/public/widget/:key/*`. Those routes don't read cookies and can only act on the visitor's own conversation (looked up by a hashed visitor token).

## Data model

| Table | Purpose |
| --- | --- |
| `users`, `sessions` | Accounts (bcrypt hashes made by `pgcrypto`) and hashed session tokens with sliding expiry |
| `organizations` | Workspaces, AI settings, retention, ticket counter |
| `memberships`, `invitations` | Roles per workspace; hashed single-use invitation tokens |
| `subscriptions`, `billing_events` | Plan and provider state; processed webhook IDs for idempotency |
| `customers` | Website visitors (name/email optional, hashed visitor token) |
| `conversations`, `messages`, `conversation_reads` | Conversations with denormalised list fields; messages (customer, agent, AI, system; internal notes); per-agent read state |
| `ai_suggestions` | AI drafts with confidence, sources and status |
| `tickets`, `ticket_comments` | Tickets with per-workspace numbers |
| `kb_categories`, `kb_articles`, `kb_chunks` | Articles and their retrieval chunks with a weighted `tsvector` (GIN index) |
| `ai_usage` | One row per AI attempt: kind, outcome, provider, tokens, latency |
| `widget_configs` | Public key, appearance, allowed origins |
| `audit_logs` | Administrative actions; also the ticket history |
| `contact_requests` | Marketing contact form |

Migrations live in `apps/api/drizzle/` and are generated with `pnpm db:generate`.

## Message flow

1. The widget posts a message to `/public/widget/:key/messages`. The API checks the origin, rate limit and spam rules, creates the customer and conversation if needed, stores the message and publishes it to the workspace's realtime channel.
2. If the customer asked for a person, the conversation is escalated immediately. Otherwise `runAutomation` is queued in the background.
3. Depending on the workspace's AI mode and plan, the assistant drafts a reply: it retrieves up to five passages, builds a prompt in which every untrusted string is escaped inside data tags, and asks the provider for JSON (`reply`, `confidence`, `needs_human`, `reason`, `source_ids`).
4. Guards adjust the result (sensitive topics, unsupported links, commitments, no sources). In automatic mode, a confident and safe reply is posted as an AI message; anything else is saved as a draft and the conversation is escalated with a notice to the customer. Provider errors, timeouts, refusals, malformed output and limit exhaustion all escalate.
5. Agents see the conversation update live and can send, edit or discard drafts, reply, add notes, take over or create tickets. Replies are pushed to the visitor's WebSocket; internal notes never are.

## Realtime

Realtime events go through a `RealtimePublisher` with two channel types: `org:<id>` (dashboard) and `visitor:<conversationId>` (widget). On Node it is `RealtimeBus`, an in-process `EventEmitter`; on Cloudflare Workers it is `HubPublisher`, which posts each event to the channel's `RealtimeHub` Durable Object (see below). Dashboard events are hints ("conversation X changed"); the client refetches through the authorised API, so authorization stays in one place. The widget re-syncs over HTTPS whenever its socket opens and polls while the socket is down.

To run more than one Node instance, replace the bus with Postgres `LISTEN/NOTIFY` (or Redis pub/sub) and move rate-limit state to Redis. The Workers runtime already fans out across instances.

## Background work

- AI automation runs on a `TaskTracker` so shutdown and tests can wait for it. On Workers, each request hands `tasks.idle()` to `waitUntil`, so AI replies and realtime publishes finish after the response is sent.
- An hourly job (a timer on Node, a Cron Trigger on Workers) applies each workspace's retention policy, purges demo conversations older than 24 hours, deletes expired sessions, and drops audit-log and contact-form entries older than a year.

## Runtimes: Node and Cloudflare Workers

The same Fastify app runs in two places. `src/server.ts` starts it as a Node server (Render, Docker, local development); `src/worker.ts` runs it on Cloudflare Workers. Route handlers, validation, auth and tenancy checks are shared; only the edges differ:

| Concern | Node (`server.ts`) | Cloudflare Workers (`worker.ts`) |
| --- | --- | --- |
| HTTP | `app.listen()` | The app is built at startup (Fastify compiles route matchers, which Workers only allow then) and listens on the runtime's `node:http` implementation; `handleAsNodeRequest` passes each request to it. |
| Database | One postgres.js pool | One short-lived client per request through **Hyperdrive** (Workers can't share sockets between requests). `ctx.db` reads it from `AsyncLocalStorage`, so handlers don't change. |
| Passwords | bcrypt in Postgres (`pgcrypto`) | Same. Hashing in the database keeps it inside the 10 ms CPU limit. |
| WebSockets | `@fastify/websocket` + `RealtimeBus` | The Worker authorises the upgrade, then hands the socket to the channel's **`RealtimeHub` Durable Object** (hibernating WebSockets). Close codes match Node. |
| Socket tickets | HMAC-signed, nonce kept in memory | HMAC-signed, nonce kept in the workspace's Durable Object |
| `/widget.js` | Served by Fastify | Workers static assets (`public/_headers` sets CORS-friendly headers) |
| Jobs | `setInterval` | Cron Trigger (`scheduled` handler) |
| Logs | pino to stdout | pino to `console`, collected by Workers Logs |

The web app runs on Workers too, built with OpenNext (`apps/web/wrangler.jsonc`). Its `/api` proxy calls the API Worker over HTTPS; `global_fetch_strictly_public` allows one `workers.dev` Worker to call another.
