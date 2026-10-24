# API reference

Base URL: the API service (for example `https://supportflow-api.onrender.com`). The web app reaches it through its own `/api/*` proxy, so from the browser `GET /api/conversations` maps to `GET /conversations`.

## Conventions

- **Format:** JSON request and response bodies (`Content-Type: application/json`). Other body types are rejected with `415`.
- **Authentication:** an httpOnly `sf_session` cookie, set by `/auth/register`, `/auth/login` and `/invitations/register`. Requests act on the session's active workspace.
- **CSRF:** cookie-authenticated `POST`/`PATCH`/`DELETE` requests must come from an origin listed in `WEB_ORIGIN` (checked from the `Origin` header).
- **Roles:** `agent` < `admin` < `owner`. The minimum role is listed per endpoint.
- **IDs:** UUIDs. An ID that is malformed or belongs to another workspace returns `404`.
- **Errors:** every error has the same shape:

```json
{ "error": { "code": "validation_error", "message": "Email is required", "fields": { "email": "Email is required" } } }
```

| Status | Code examples | Meaning |
| --- | --- | --- |
| 400 | `validation_error`, `bad_request` | Invalid input; `fields` holds per-field messages |
| 401 | `unauthorized`, `invalid_credentials` | Not signed in / wrong email or password |
| 402 | `plan_limit` | The workspace's plan doesn't allow this (seats, AI responses, articles, features) |
| 403 | `forbidden`, `bad_origin`, `widget_disabled` | Role too low, CSRF origin mismatch, widget not allowed |
| 404 | `not_found` | Missing or in another workspace |
| 409 | `conflict` | Duplicate (email, category name, member) |
| 410 | `invitation_expired` | |
| 429 | `rate_limited`, `duplicate_message` | Too many requests; `Retry-After` header is set |
| 503 | `ai_unavailable` | The AI provider failed; nothing was sent to the customer |

## Health

| Method & path | Auth | Description |
| --- | --- | --- |
| `GET /health` | – | Liveness: `{ "status": "ok" }` |
| `GET /health/ready` | – | Readiness: checks the database; returns `503` if unreachable. Also reports the AI provider and billing mode. |

## Auth and account

| Method & path | Auth | Body / query | Notes |
| --- | --- | --- | --- |
| `POST /auth/register` | – | `name, email, password, organizationName` | Creates user, workspace (owner), Free plan and widget. 10/hour per IP. |
| `POST /auth/login` | – | `email, password` | 10 attempts / 15 min per IP and email. |
| `POST /auth/logout` | session | – | Deletes the session. |
| `GET /auth/session` | session | – | `SessionDto`: user, active workspace, role, all workspaces, plan, AI provider. |
| `POST /auth/switch-org` | session | `organizationId` | Must be a member. |
| `PATCH /auth/profile` | session | `name` | |
| `POST /auth/password` | session | `currentPassword, newPassword` | Signs out all other sessions. |

## Workspace

| Method & path | Role | Notes |
| --- | --- | --- |
| `POST /orgs` | session | Create another workspace (caller becomes owner) and switch to it. |
| `GET /org` | agent | Workspace settings. |
| `PATCH /org` | admin | `name, aiMode, aiConfidenceThreshold, aiInstructions, retentionDays, collectCsat`. `aiMode: "auto"` needs Starter+. Audited. |
| `DELETE /org` | owner | `{ confirmName }` must equal the name. Deletes everything. |
| `GET /org/audit-logs?before=<iso>` | admin | 50 per page, newest first. |
| `POST /org/retention/run` | admin | Applies the retention period now. |

## Team

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /team/members` | agent | With open conversation counts. |
| `PATCH /team/members/:id` | admin | `{ role }`. Only owners grant or change the owner role; the last owner can't be demoted. |
| `DELETE /team/members/:id` | agent (self) / admin | Unassigns their conversations and tickets. |
| `GET /team/invitations` | admin | Pending only. |
| `POST /team/invitations` | admin | `{ email, role: "admin" \| "agent" }` → `{ invitation, inviteUrl }`. Checks seats (pending invites count). The URL is returned once. |
| `DELETE /team/invitations/:id` | admin | Revoke. |
| `GET /invitations/:token` | – | Invitation details for the accept page. |
| `POST /invitations/accept` | session | `{ token }`; the signed-in email must match. |
| `POST /invitations/register` | – | `{ token, name, password }`; creates the account with the invited email. |

## Conversations and customers

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /conversations` | agent | Query: `status` (`open`, `pending`, `resolved`, `all`), `assignee` (`me`, `unassigned`, `any`), `q`, `unread`, `needsHuman`, `cursor`, `limit` (≤100). Returns `{ items, nextCursor }`. |
| `GET /conversations/counts` | agent | Open, pending, mine, unassigned, needs-a-person and unread counts. |
| `GET /conversations/:id` | agent | Messages, pending AI draft, linked tickets, summary, rating. |
| `PATCH /conversations/:id` | agent | `status, assigneeId, subject`. Assignee must be a member. |
| `POST /conversations/:id/messages` | agent | `{ body, internal }`. A non-internal reply in auto mode takes over from the AI and assigns the conversation if unassigned. |
| `POST /conversations/:id/read` | agent | Marks read for the caller. |
| `POST /conversations/:id/takeover` | agent | Stops the AI, assigns to the caller, tells the customer a person joined. |
| `POST /conversations/:id/ai/resume` | agent | Lets the AI help again. |
| `POST /conversations/:id/suggestions` | agent | Generates an AI draft now. `402` at the monthly limit, `503` if the provider fails. |
| `POST /conversations/:id/suggestions/:sid/send` | agent | Optional `{ body }`; unedited drafts go out as AI messages, edited ones as the agent's. |
| `POST /conversations/:id/suggestions/:sid/discard` | agent | |
| `POST /conversations/:id/summary` | agent | Pro+. Needs a language model. |
| `GET /customers?q=` | agent | With conversation counts. |
| `GET /customers/:id/conversations` | agent | |
| `DELETE /customers/:id` | admin | Deletes the customer and all their conversations and messages (data deletion requests). Audited without personal data. |

## Tickets

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /tickets` | agent | Query: `status` (`active`, any status, `all`), `priority`, `owner`, `q` (title, description, customer email or `#number`). |
| `POST /tickets` | agent | `title, description, priority, ownerId, conversationId`. Numbered per workspace. |
| `GET /tickets/:id` | agent | `{ ticket, comments, events }`. |
| `PATCH /tickets/:id` | agent | `title, description, status, priority, ownerId`. Changes are recorded in the history. |
| `POST /tickets/:id/comments` | agent | `{ body }`. |
| `DELETE /tickets/:id` | admin | |

## Knowledge base

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /kb/articles` | agent | Query: `status`, `categoryId`, `q`. |
| `POST /kb/articles` | agent | `title, body, categoryId` → draft. Checks the article limit. |
| `GET /kb/articles/:id` | agent | Includes `chunkCount` and `indexedAt`. |
| `PATCH /kb/articles/:id` | agent (drafts) / admin (published) | Published edits are re-indexed and audited. |
| `POST /kb/articles/:id/status` | admin | `{ status: "draft" \| "published" \| "archived" }`; re-indexes. |
| `DELETE /kb/articles/:id` | admin | |
| `POST /kb/import` | admin | `{ filename (.md/.txt), content (≤500 KB), categoryId, publish }`; splits on `#` headings, ≤100 articles. |
| `POST /kb/reindex` | admin | Rebuilds all chunks. |
| `POST /kb/search` | agent | `{ q }` → the passages the AI would retrieve. |
| `GET /kb/stats` | agent | Counts by status. |
| `GET/POST /kb/categories`, `PATCH/DELETE /kb/categories/:id` | agent (read) / admin | Deleting keeps the articles. |

## Analytics

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /analytics/overview?days=7\|30\|90` | agent | Totals, medians (or `null`), workload, monthly usage. |
| `GET /analytics?days=7\|30\|90` | agent | Daily series, AI totals, escalation rate (`null` without automatic replies), satisfaction (`null` without ratings). |

## Widget administration

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /widget/config` | agent | Config, script URL and whether branding can be removed. |
| `PATCH /widget/config` | admin | `enabled, brandColor, title, greeting, launcherLabel, position, allowedOrigins, requireEmail`. |
| `POST /widget/config/rotate-key` | admin | New public key; the old one stops working. |

## Public widget API

All under `/public/widget/:key`. No cookies are read. Each request must carry an `Origin` that is in the widget's allowed list (or the dashboard's own origin, for the preview); responses include `Access-Control-Allow-Origin` for that origin only, without credentials. Visitors identify themselves with an `X-Visitor-Token` header.

| Method & path | Notes |
| --- | --- |
| `GET /bootstrap` | Appearance and whether the AI is answering. |
| `POST /session` | Returns a visitor token (new if none) and the visitor's current conversation and visible messages. 30/min. |
| `POST /messages` | `{ body (≤2000), name?, email?, website (honeypot) }`. 12/min per IP. More than three links, repeated messages and filled honeypots are rejected. |
| `POST /handoff` | Asks for a person. |
| `POST /csat` | `{ rating 1–5, comment? }` once, after resolution. |
| `GET /ws?token=&conversationId=` | WebSocket: `message`, `status` and `typing` events for the visitor's own conversation. |

`GET /widget.js` serves the embeddable script.

## Realtime (dashboard)

| Method & path | Notes |
| --- | --- |
| `POST /realtime/ticket` | agent; returns a single-use ticket valid for 60 seconds. |
| `GET /realtime?ticket=` | WebSocket. Origin must be in `WEB_ORIGIN`. Emits `ready`, then `conversation.updated`, `message.created`, `suggestion.updated` and `ticket.updated` for the workspace. Closes with `4403` if the member is removed. |

## Billing

| Method & path | Role | Notes |
| --- | --- | --- |
| `GET /billing` | agent | Plan, status, provider, period end, billing mode and usage. |
| `POST /billing/checkout` | owner | `{ plan }` → `{ url }` (Stripe Checkout). The plan changes only when the webhook confirms payment. |
| `POST /billing/portal` | owner | → `{ url }` (Stripe Customer Portal). |
| `POST /billing/test/change-plan` | owner | Test mode only (`BILLING_MODE=test`, never in production). |
| `POST /billing/webhook` | Stripe | Verifies `Stripe-Signature` (HMAC-SHA256, 5-minute tolerance). Handles `checkout.session.completed` and `customer.subscription.created/updated/deleted`. Idempotent by event ID. |

## Contact

| Method & path | Notes |
| --- | --- |
| `POST /contact` | `{ name, email, company?, message, website (honeypot) }`. 5/hour per IP. Optionally forwarded to `CONTACT_WEBHOOK_URL`. |
