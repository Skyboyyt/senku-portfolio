# SupportFlow AI — progress log

Kept up to date at the end of every phase so work can resume from here. Last updated 23 October 2026.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Architecture, monorepo, design system, database schema, migrations | Done |
| 2 | Public website, responsive navigation, themes, authentication | Done |
| 3 | Workspaces, roles, dashboard shell, overview | Done |
| 4 | Unified inbox, realtime messaging, tickets, customers | Done |
| 5 | Knowledge base and AI assistant | Done |
| 6 | Embeddable widget and customisation | Done |
| 7 | Analytics, team management, billing | Done |
| 8 | Security review, testing, documentation, deployment readiness, portfolio | Done, except the deployment itself (see blockers) |

## Verification (last run)

| Check | Result |
| --- | --- |
| `pnpm -r typecheck` | Passes (strict mode, all packages) |
| `pnpm lint` | Passes |
| API tests (`apps/api`, real Postgres) | 102 passed |
| Widget tests (`packages/widget`, happy-dom) | 9 passed |
| Shared tests (`packages/shared`) | 9 passed |
| Playwright e2e (`pnpm e2e`, production builds) | 20 passed |
| `next build` (web) | Passes, 24 routes |
| API production build | `tsup` build, `dist/migrate.js` on an empty database, `dist/server.js` with `NODE_ENV=production`, `/health/ready` OK; unsafe production config refused |

## Phase notes

**Phase 1.** pnpm monorepo in `demos/supportflow`; Drizzle schema with 21 org-scoped tables and a weighted full-text index; environment validation; development seed (refuses production) and an isolated demo workspace.

**Phase 2.** Marketing site (home with a live demo on the fictional Larkspur workspace, features, how it works, pricing, contact, privacy, terms), accessible mobile menu, light/dark/system theme without flash, registration, sign-in, invitations. Server-side sessions, CSRF origin checks, rate limits.

**Phase 3.** Dashboard shell with workspace switcher, realtime status, mobile navigation; overview metrics, setup checklist from real state, plan usage, team workload; creating additional workspaces.

**Phase 4.** Inbox with views, search, unread, assignment, notes, takeover, AI drafts, summaries and realtime updates; tickets with numbering, history and comments; customers with data deletion.

**Phase 5.** Knowledge base editor (Markdown preview, publish/archive, categories, import, re-index, retrieval test). AI providers (Anthropic, OpenAI, extractive), guards, confidence threshold, approval mode, limits, token tracking and failure escalation; AI settings page.

**Phase 6.** Shadow DOM widget (≈20 KB) with launcher or inline mode, continuity, handoff, email capture, rating, realtime with re-sync and polling fallback; widget settings with allowed websites, install code, key rotation and live preview.

**Phase 7.** Analytics charts (validated colours, tooltips, table views, empty states); team roles and invitations; billing for Stripe, test and disabled modes.

**Phase 8.** Security review fixes (per-IP widget limit that can't be bypassed by minting tokens); Playwright suite; fixes for bugs it found (widget missing fast AI replies, inbox list not updating live, invite redirect, contrast and labelling issues); sitemap, robots, Open Graph image, error pages; README, architecture, API, security, deployment and case-study documents; Render blueprint and Vercel config; real screenshots; portfolio entry.

## Blockers and outstanding work

**Needs the owner (credentials or paid services):**

- **Deployment** — needs a Neon database, a Render web service (paid tier recommended for WebSockets) and a Vercel project. Steps are in `docs/DEPLOYMENT.md`. Nothing has been deployed.
- **AI provider key** — without `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` the app uses the extractive provider. LLM paths are covered by tests with a mock provider but haven't been run against a live model.
- **Stripe** — test-mode keys, three prices and a webhook are needed for real checkout. The Stripe paths are tested against a mocked Stripe API.

**Not implemented (documented as limitations):**

- Email delivery (invitation emails, password reset, email verification).
- Horizontal scaling: realtime bus and rate limits are in memory (single API instance).
- Embedding-based retrieval (current retrieval is Postgres full-text search).
- Chat attachments; multi-factor authentication; nonce-based CSP for the web app.
- Error monitoring integration (recommended in the deployment guide).

## Resuming work

1. Start Postgres and create `supportflow`, `supportflow_test` and `supportflow_e2e` databases.
2. `cp .env.example .env`, set `PROXY_SHARED_SECRET`, run `pnpm install`, `pnpm db:migrate`, `pnpm demo:setup`, `pnpm db:seed`.
3. `pnpm dev`; tests with `pnpm test` and `pnpm e2e`.
