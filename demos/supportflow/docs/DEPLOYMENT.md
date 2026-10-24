# Deployment

Two supported setups:

- **A. Cloudflare Workers + Neon** — both apps on Workers, Postgres on Neon, reached through Hyperdrive. Fits the free plans of both.
- **B. Render + Vercel + Neon** — the API as a Node service, the web app on Vercel.

Setup A is live at **https://supportflow-web.sanifahad24.workers.dev** (API: `https://supportflow-api.sanifahad24.workers.dev`), deployed on 23 October 2026 with the extractive AI provider and billing disabled. Against the live site, 19 of the 20 Playwright tests pass; the one failure is the billing step noted under [A4](#a4-verify), and the same workflow with that step replaced by a database plan change passes end to end. Setup B's production build, migrations and startup checks have been verified locally but it isn't deployed.

## A. Cloudflare Workers + Neon

You need a Cloudflare account (free plan), a Neon project (free plan) and, on the machine you deploy from, either `npx wrangler login` or a `CLOUDFLARE_API_TOKEN` with **Workers Scripts: Edit** and **Hyperdrive: Edit**, plus `CLOUDFLARE_ACCOUNT_ID`. Your `workers.dev` subdomain is under **Workers & Pages → Settings**; the URLs below use `<sub>` for it.

### A1. Database

1. In Neon, create a project (Postgres 16+) and copy the **direct** connection string (not the `-pooler` host; Hyperdrive does the pooling). It must end with `?sslmode=require`.
2. Apply migrations and create the homepage demo workspace from your machine:
   ```bash
   cd demos/supportflow
   DATABASE_URL="postgres://…?sslmode=require" pnpm db:migrate
   DATABASE_URL="postgres://…?sslmode=require" pnpm demo:setup   # prints NEXT_PUBLIC_DEMO_WIDGET_KEY=pk_…
   ```
   Migration `0001` enables `pgcrypto`, which Neon supports. Never run `pnpm db:seed` against production.
   These scripts connect on port 5432. If your network only allows HTTPS, run the same migrations and `setupDemo` through Neon's WebSocket driver (`drizzle-orm/neon-serverless` with `@neondatabase/serverless`) instead; that's how the live deployment was set up.
3. Create the Hyperdrive config and copy its id into `apps/api/wrangler.jsonc` (`hyperdrive[0].id`):
   ```bash
   cd apps/api
   npx wrangler hyperdrive create supportflow-db --connection-string="postgres://…?sslmode=require"
   ```

### A2. API Worker

1. In `apps/api/wrangler.jsonc`, set `vars.WEB_ORIGIN` to `https://supportflow-web.<sub>.workers.dev` and `vars.API_PUBLIC_URL` to `https://supportflow-api.<sub>.workers.dev`.
2. Set secrets (each command prompts for the value):
   ```bash
   openssl rand -base64 32          # use this for PROXY_SHARED_SECRET
   npx wrangler secret put PROXY_SHARED_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY   # optional; without it the extractive fallback answers from articles
   ```
   With no AI key the API uses the extractive fallback automatically. Billing stays `disabled` unless you configure [Stripe](#stripe-optional) (the same variables, set as secrets).
   The Worker checks its configuration at startup, so on the **first** deploy, before the Worker exists, pass the secret with the deploy instead: put `{"PROXY_SHARED_SECRET":"…"}` in a file outside the repository and add `--secrets-file <path>` to the deploy command below (and to the web Worker's deploy in A3, `pnpm exec opennextjs-cloudflare deploy -- --secrets-file <path>` after `pnpm cf:build`).
3. Build the widget and deploy:
   ```bash
   cd demos/supportflow && pnpm --filter @supportflow/widget build
   cd apps/api && pnpm worker:deploy
   ```
   This deploys the Worker, the `RealtimeHub` Durable Object (SQLite-backed, available on the free plan), static `widget.js`, and the hourly Cron Trigger.
4. Check `https://supportflow-api.<sub>.workers.dev/health/ready` returns `{"status":"ok","database":"ok",…}`.

### A3. Web Worker

1. In `apps/web/wrangler.jsonc`, set `vars.API_INTERNAL_URL` to the API Worker URL.
2. `cd apps/web && npx wrangler secret put PROXY_SHARED_SECRET` (the same value as the API).
3. Build and deploy. `NEXT_PUBLIC_*` values are baked in at build time:
   ```bash
   NEXT_PUBLIC_API_URL=https://supportflow-api.<sub>.workers.dev \
   NEXT_PUBLIC_SITE_URL=https://supportflow-web.<sub>.workers.dev \
   NEXT_PUBLIC_DEMO_WIDGET_KEY=pk_… NEXT_PUBLIC_BILLING_MODE=disabled \
   pnpm cf:deploy
   ```

### A4. Verify

- Run the end-to-end suite against the live site: `E2E_BASE_URL=https://supportflow-web.<sub>.workers.dev npx playwright test`. Note that it creates test workspaces in the database, and the billing tests expect `BILLING_MODE=test`, which production refuses, so expect those to fail there.
- By hand: register a workspace, publish an article, open **Chat widget**, send a message from the preview, and watch it arrive in the inbox in real time.

### Trying it locally in the Workers runtime

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill in PROXY_SHARED_SECRET
cp apps/web/.dev.vars.example apps/web/.dev.vars   # same secret
cd apps/api && pnpm worker:dev                     # http://localhost:8787, uses local Postgres via localConnectionString
cd apps/web && NEXT_PUBLIC_API_URL=http://127.0.0.1:8787 NEXT_PUBLIC_DEMO_WIDGET_KEY=pk_… \
  NEXT_PUBLIC_SITE_URL=http://localhost:8788 NEXT_PUBLIC_BILLING_MODE=test pnpm cf:build && npx wrangler dev --port 8788
E2E_BASE_URL=http://localhost:8788 npx playwright test
```

### Free-plan limits to know

- **Workers:** 100,000 requests a day across both Workers, and 10 ms of CPU per request. Password hashing runs in Postgres for this reason. Measured on the live deployment during the test runs (about 1,400 requests across both Workers): median CPU time about 24 ms and p99 about 530 ms, with no request rejected for exceeding its limit. That's above the nominal 10 ms, so keep an eye on the Workers metrics for `exceededResources` errors (error 1102) and move to the paid plan (30 s of CPU per request) if they appear.
- **Durable Objects:** one request per realtime event per channel, and WebSocket messages count toward the daily request allowance.
- **Neon:** the database suspends when idle, so the first request after a quiet period takes longer.
- **Rate limits** are kept per isolate, so they are looser than on a single Node server (see `docs/SECURITY.md`).

## Web app on Vercel with the API on Workers

The web app also runs on Vercel at **https://supportflow-omega.vercel.app** (project `supportflow`, root directory `demos/supportflow/apps/web`, "Include files outside the root directory" on), using the API Worker from setup A, so no Render service is needed.

- Vercel environment variables: `API_INTERNAL_URL` and `NEXT_PUBLIC_API_URL` set to the API Worker URL, `NEXT_PUBLIC_SITE_URL` set to the Vercel URL, `NEXT_PUBLIC_DEMO_WIDGET_KEY`, `NEXT_PUBLIC_BILLING_MODE=disabled`, `CLIENT_IP_HEADER=x-real-ip`, and `PROXY_SHARED_SECRET` (sensitive, the same value as both Workers; see the next point).
- The Vercel origin is added to the API's `WEB_ORIGIN` in `apps/api/wrangler.jsonc` and to the demo widget's allowed websites (re-run `demo:setup` with both origins in `WEB_ORIGIN`).
- Without `PROXY_SHARED_SECRET` on Vercel the site still works, but the API can't trust the forwarded visitor IP, so rate limits apply per Vercel server instead of per visitor. It is set on the live project. To rotate it, put a new value on both Workers (`wrangler secret put PROXY_SHARED_SECRET` in `apps/api` and `apps/web`) and on Vercel, then redeploy the Vercel project.
- The `WEB_ORIGIN` list puts the Vercel origin first because invitation links and billing return URLs use the first entry.

## B. Render + Vercel + Neon

### B1. Database — Neon

1. Create a Neon project (Postgres 16+) and a database, for example `supportflow`.
2. Copy the **pooled** connection string and make sure it ends with `?sslmode=require`. This is `DATABASE_URL`.
3. Migrations run automatically on each Render deploy (step B2). To run them by hand:
   ```bash
   cd demos/supportflow
   DATABASE_URL="postgres://…?sslmode=require" pnpm db:migrate
   ```
4. Never run `pnpm db:seed` against production; it refuses when `NODE_ENV=production`.

### B2. API — Render

1. In Render choose **New → Blueprint**, select this repository and set the blueprint path to `demos/supportflow/render.yaml`.
2. Fill in the values marked "sync: false":

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL with `sslmode=require` |
| `WEB_ORIGIN` | The Vercel URL, e.g. `https://supportflow.vercel.app` (comma-separate several, such as a custom domain) |
| `API_PUBLIC_URL` | This service's URL, e.g. `https://supportflow-api.onrender.com` |
| `PROXY_SHARED_SECRET` | Generated by the blueprint; copy it to Vercel |
| `AI_PROVIDER` | `anthropic`, `openai` or `extractive` (no key needed) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | As needed. For OpenAI also set `AI_MODEL`. Anthropic defaults to `claude-opus-5-5`; set `AI_MODEL` to change it. |
| `BILLING_MODE` | `disabled` until Stripe is configured, then `stripe`. `test` is refused in production. |
| `STRIPE_*` | See [Stripe](#stripe-optional) |

3. Deploy. The build runs `pnpm install`, builds the widget and the API; `preDeployCommand` applies migrations; the health check uses `/health/ready`.
4. Create the homepage demo workspace once (Render shell):
   ```bash
   node apps/api/dist/demo.js
   ```
   It prints `NEXT_PUBLIC_DEMO_WIDGET_KEY=pk_…`. The demo workspace has no members and its conversations are deleted after 24 hours.

The API holds WebSocket connections and in-memory rate limits, so run **one instance** (or add Redis / Postgres `LISTEN/NOTIFY` first; see the architecture document). Render's free plan sleeps when idle, which drops WebSockets and delays the first request; use a paid instance for real traffic.

### B3. Web — Vercel

1. Import the repository in Vercel. Set **Root Directory** to `demos/supportflow/apps/web` and enable "Include files outside the root directory". `vercel.json` installs from the workspace root with pnpm.
2. Environment variables (Production and Preview):

| Variable | Value |
| --- | --- |
| `API_INTERNAL_URL` | The Render API URL (used server-side by the `/api` proxy) |
| `NEXT_PUBLIC_API_URL` | The Render API URL (WebSockets and the widget script) |
| `PROXY_SHARED_SECRET` | Same value as on Render |
| `NEXT_PUBLIC_DEMO_WIDGET_KEY` | From step B2.4 |
| `NEXT_PUBLIC_SITE_URL` | The public site URL (metadata, sitemap) |
| `NEXT_PUBLIC_BILLING_MODE` | `stripe` or `disabled` (controls the note on the pricing page) |

3. Deploy, then add the final Vercel URL to `WEB_ORIGIN` on Render if it changed, and redeploy the API.

## Stripe (optional)

1. In Stripe test mode, create three recurring monthly prices (Starter $29, Pro $79, Business $199) and copy their price IDs into `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS`.
2. Add a webhook endpoint `https://<api>/billing/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Set `STRIPE_SECRET_KEY` and `BILLING_MODE=stripe`, then redeploy.
4. Enable the Customer Portal in Stripe settings (plan changes and cancellation).
5. Verify with a test card (`4242 4242 4242 4242`): the plan should change on the Billing page only after the webhook arrives. Use live keys only after reviewing pricing, tax and terms.

## Verify a Render + Vercel deployment

- `GET https://<api>/health/ready` → `{"status":"ok","database":"ok",…}`
- Open the site, register a workspace, publish an article, add the site's origin under **Chat widget**, and send a message from the widget preview; it should appear in the inbox in real time.
- The homepage demo should answer "How long does shipping take to Europe?" from the "Shipping times and costs" article. (The extractive fallback hands loosely matched questions to the team rather than guessing; an AI key answers more freely.)
- Run the e2e suite against staging with `E2E_BASE_URL=https://… npx playwright test`.

## Logging and monitoring recommendations

- **Logs:** the API logs JSON (pino) with cookies, tokens and signatures redacted. Ship them with a Render log stream (Better Stack, Datadog, etc.). Set `LOG_LEVEL=info` (default).
- **Uptime:** monitor `/health/ready` every minute and alert on two failures.
- **Errors:** add Sentry (or similar) to both apps; the API's error handler is the single place to report unhandled 5xx errors.
- **AI:** watch `ai_usage` for rising `error` or `limit` outcomes and latency; it records provider, model, tokens and latency per attempt.
- **Database:** enable Neon's monitoring; the heaviest queries are analytics aggregates, which use the `(org_id, created_at)` indexes.
- **Backups:** Neon provides point-in-time restore; confirm the retention window for your plan.

## Costs

Cloudflare Workers (with Durable Objects and Hyperdrive) and Neon have free plans that cover a demo (setup A). Vercel has a free tier too; Render web services that stay awake and support WebSockets are paid. AI providers and Stripe bill per use. Nothing in this repository creates paid resources automatically.
