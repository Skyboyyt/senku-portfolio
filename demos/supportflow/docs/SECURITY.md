# Security checklist

Status of each control, where it lives, and how it's verified. "Tested" means an automated test covers it (`apps/api/test`, `packages/widget/test` or `e2e`).

## Identity and sessions

- [x] Passwords hashed with **argon2id** (19 MiB, t=2) — `lib/crypto.ts`. Minimum length 10.
- [x] Login doesn't reveal whether an email exists (same message, dummy hash verification for unknown emails) — tested.
- [x] Session tokens are 256-bit random values; only their **SHA-256** is stored — tested.
- [x] Cookie: `httpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/` — tested.
- [x] Sliding 30-day expiry; logout deletes the session; password change signs out other devices — tested.
- [x] Login, registration, invitation and password endpoints are rate limited — tested.
- [ ] Password reset by email and email verification — not implemented (no email provider). Documented limitation.
- [ ] Multi-factor authentication — not implemented.

## Authorization and tenant isolation

- [x] Every protected handler resolves membership from the database on each request (`requireMember`), so role changes and removals apply immediately — tested.
- [x] Every query on tenant data filters by the caller's `org_id`; foreign IDs return `404` — tested across conversations, messages, tickets, comments, articles, customers, settings, widget and audit logs.
- [x] Cross-references are re-validated (assignees and owners must be members; conversations and categories must belong to the workspace) — tested.
- [x] Owner-only actions (billing, deleting the workspace, granting ownership); last owner protected — tested.
- [x] Realtime: single-use 60-second tickets, origin check, channel per workspace, membership re-checked every minute — tested.
- [x] Agents can't edit published articles (the AI's source of truth) — tested.

## Web security

- [x] **CSRF:** cookie-authenticated writes must have an allowed `Origin`; only JSON bodies are parsed (no `text/plain` or form bodies) — tested.
- [x] **XSS:** React escapes output; the article preview renderer builds elements (no `innerHTML`); the widget sets message text with `textContent` and only links `http(s)` URLs with `rel="noopener noreferrer nofollow"` — tested.
- [x] Security headers: API via Helmet (CSP `default-src 'none'`, HSTS, `nosniff`, `frame-ancestors 'none'`); web app CSP limiting scripts and connections to itself and the API, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- [x] Post-login redirects accept only same-site relative paths (`safeNext`).
- [x] Request validation with Zod on every body and query; body size limits (1 MB, import 600 KB).
- [x] **SQL injection:** all queries are parameterised through Drizzle; full-text queries are built only from letter/digit tokens — tested.
- [ ] CSP for the web app still allows `'unsafe-inline'` scripts (needed for Next.js bootstrapping and the pre-paint theme script). A nonce-based CSP is a possible hardening step.

## Widget

- [x] Works only on allowed origins (exact scheme + host match), checked from the browser-set `Origin` header on HTTP and WebSocket — tested.
- [x] The public key only reaches `/public/widget/:key/*`; it grants no dashboard access — tested. Keys can be rotated.
- [x] Visitors can only read their own conversation (hashed visitor token) — tested.
- [x] Internal notes and AI drafts are never sent to visitors — tested.
- [x] Spam controls: per-IP rate limits, honeypot field, link limit, duplicate suppression, 2,000-character limit — tested.
- [x] No cookies or credentials are sent (`credentials: "omit"`); styles are isolated in a Shadow DOM.

## AI safety

- [x] Retrieval is scoped to the workspace and to **published** articles only — tested.
- [x] Customer messages and article text are escaped and wrapped as data in the prompt; the system prompt says to ignore instructions inside them — tested.
- [x] Deterministic guards, independent of the model: refund/billing/account/legal/security topics always go to a person; replies with links not present in the sources, or that claim to have refunded/cancelled/changed something or make guarantees, are held back — tested.
- [x] Confidence threshold per workspace; low confidence becomes a draft for an agent — tested.
- [x] Provider errors, timeouts, refusals and malformed output escalate to a person with a notice to the customer — tested.
- [x] Internal notes are never included in prompts — tested.
- [x] Monthly usage limits enforced before calling the provider; every attempt recorded with tokens — tested.
- [x] Every AI message is labelled for customers and agents.
- [x] The AI has no tools: it can't take actions such as refunds or account changes.

## Secrets and configuration

- [x] Secrets only in environment variables; `.env` is git-ignored; `.env.example` has no values.
- [x] AI and Stripe keys are used only by the API; the web app receives only `NEXT_PUBLIC_*` values that are safe to publish (API URL, demo widget key, site URL).
- [x] Logs redact cookies, authorization, proxy secret, visitor tokens and Stripe signatures.
- [x] Startup validation refuses test billing and a missing proxy secret in production — tested.
- [x] Stripe webhooks verified by signature with replay tolerance; idempotent — tested.

## Privacy and data lifecycle

- [x] Visitors don't need to give a name or email (unless the business requires an email).
- [x] Per-customer deletion of all conversations — tested.
- [x] Configurable retention for resolved conversations — tested; hourly job.
- [x] Demo conversations deleted after 24 hours; expired sessions removed; audit logs and contact messages kept one year.
- [x] Workspace deletion cascades to all of its data.
- [x] No file uploads in chat. Article import accepts only `.md`/`.txt` text, ≤500 KB, ≤100 articles, admins only.

## Operational

- [ ] Rate-limit and realtime state are in memory: fine for one instance; use Redis/Postgres for several.
- [ ] Add error monitoring (e.g. Sentry) and uptime checks on `/health/ready` after deployment.
- [ ] Run `pnpm audit` in CI and keep dependencies updated.
- [ ] Invitation links appear in URLs (single-use, 7-day expiry). Avoid logging full request paths in production log drains if that matters for your threat model.
