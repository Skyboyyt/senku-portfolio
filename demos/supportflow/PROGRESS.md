# SupportFlow AI — progress log

Kept up to date at the end of every phase so work can resume from here.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Architecture, monorepo, shared package, database schema, migrations | Done |
| 2 | Public website, navigation, authentication | API done; web in progress |
| 3 | Workspaces, roles, dashboard | API done; web pending |
| 4 | Inbox, realtime messaging, tickets | API done; web pending |
| 5 | Knowledge base, AI assistant | API done; web pending |
| 6 | Embeddable widget | API done; widget script pending |
| 7 | Analytics, team, billing | API done; web pending |
| 8 | Hardening, e2e tests, docs, deployment readiness | Pending |

## Phase 1 — completed

- pnpm monorepo in `demos/supportflow`: `apps/api` (Fastify 5), `apps/web` (Next.js 16), `packages/shared` (Zod schemas, plans, DTO types), `packages/widget`.
- PostgreSQL schema (Drizzle) with 21 tables, org-scoped indexes, unique constraints, a weighted full-text index for retrieval, and the initial migration in `apps/api/drizzle/`.
- Environment validation that refuses unsafe production settings (test billing, missing proxy secret).
- Development seed (`pnpm db:seed`, refuses `NODE_ENV=production`) and the isolated demo workspace (`pnpm demo:setup`).

## Backend for phases 2–7 — completed and tested

- Auth: argon2id passwords, hashed server-side sessions with sliding expiry, httpOnly SameSite=Lax cookie, CSRF origin check, login rate limiting, password change signs out other devices.
- Workspaces and roles (owner/admin/agent), invitations with seat limits, member removal, audit log.
- Inbox: filters, search, unread state, internal notes, assignment, takeover, AI resume, realtime events.
- Tickets with per-workspace numbering, history, comments, filters.
- Knowledge base: categories, drafts/publish/archive, Markdown import, reindexing, retrieval preview.
- AI: Anthropic/OpenAI/extractive providers, grounded JSON replies, confidence threshold, deterministic guards (sensitive intents, unsupported links, unauthorized commitments), approval mode, summaries, monthly limits, usage/token tracking, fallback to a person on any failure.
- Public widget API: per-key origin allow-list, CORS, rate limits, honeypot, link and duplicate filtering, visitor tokens, handoff, CSAT, realtime socket.
- Billing: Stripe Checkout/Portal with signed, idempotent webhooks; dev-only test mode; disabled mode.
- Analytics from SQL with nulls (not zeros) where there is no data.
- Retention purge, demo purge, expired-session cleanup.

Verification: `pnpm --filter @supportflow/api test` — 101 tests across auth, tenancy isolation, roles, AI failure handling, widget security, realtime, KB, tickets, billing, analytics. Typecheck, lint and `tsup` build pass. Built server boots and `/health/ready` reports the database.

## Next

- Web app: design system, marketing pages, auth pages, dashboard shell and every dashboard page.
- Widget script and its tests.
- Playwright end-to-end and accessibility tests.
- Documentation set and deployment configuration.

## Known blockers

- No AI provider key in this environment: LLM paths are tested with a mock provider; the running app uses the extractive provider.
- No Stripe keys: Stripe paths are tested against a mocked Stripe API; the running app uses test billing.
- No email provider: invitation links are shown once to the admin to share.
