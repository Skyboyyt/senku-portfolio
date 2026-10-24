#!/usr/bin/env bash
# Starts an isolated API (port 4100) and production web build (port 3100) for Playwright.
# Resets the e2e database first; refuses any database whose name doesn't end in _e2e.
set -euo pipefail
cd "$(dirname "$0")/.."

export E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/supportflow_e2e}"
case "$E2E_DATABASE_URL" in
  *_e2e) ;;
  *) echo "Refusing to reset a database that isn't named *_e2e" >&2; exit 1 ;;
esac

SECRET="e2e-proxy-secret-0123456789abcdef0123456789"
psql "$E2E_DATABASE_URL" -q -c "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;"

export DATABASE_URL="$E2E_DATABASE_URL" WEB_ORIGIN="http://localhost:3100" API_PUBLIC_URL="http://localhost:4100"
pnpm --filter @supportflow/widget build >/dev/null
(cd apps/api && npx tsx src/db/migrate.ts)
KEY=$(cd apps/api && npx tsx src/db/demo.ts | sed -n 's/.*NEXT_PUBLIC_DEMO_WIDGET_KEY=\(pk_[A-Za-z0-9_-]*\).*/\1/p')

(cd apps/api && NODE_ENV=development PORT=4100 PROXY_SHARED_SECRET="$SECRET" AI_PROVIDER=extractive BILLING_MODE=test \
  JOBS_ENABLED=false LOG_LEVEL=warn npx tsx src/server.ts) &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT INT TERM

cd apps/web
export API_INTERNAL_URL="http://localhost:4100" NEXT_PUBLIC_API_URL="http://localhost:4100" PROXY_SHARED_SECRET="$SECRET" \
  NEXT_PUBLIC_DEMO_WIDGET_KEY="$KEY" NEXT_PUBLIC_SITE_URL="http://localhost:3100" NEXT_PUBLIC_BILLING_MODE=test
# A separate build directory so e2e builds don't disturb a running dev server.
NEXT_DIST_DIR=.next-e2e npx next build >/dev/null
NEXT_DIST_DIR=.next-e2e npx next start --port 3100
