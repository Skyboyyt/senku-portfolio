/**
 * Cloudflare Workers entry for the SupportFlow API.
 *
 * The same Fastify app as the Node server handles every HTTP request, through the Workers
 * runtime's implementation of `node:http`, so routing, validation, auth and rate limits are
 * shared code. What differs:
 * - Postgres is reached through Hyperdrive with one short-lived client per request
 *   (Workers can't share sockets between requests); `ctx.db` reads it from async context.
 * - WebSockets are authenticated here and handed to the `RealtimeHub` Durable Object.
 * - Background work (AI replies, realtime publishes) runs in `waitUntil`.
 * - Retention and demo cleanup run from a Cron Trigger.
 * - `/widget.js` is served by Workers static assets before this code runs.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { env as workerEnv } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/postgres-js";
import { handleAsNodeRequest } from "cloudflare:node";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { WorkersAiProvider, type WorkersAiBinding } from "./ai/providers";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import type { AppContext } from "./context";
import type { Database } from "./db/client";
import * as schema from "./db/schema";
import { connectToHub, HubPublisher, rejectSocket, type HubEnv } from "./realtime/hub";
import { verifyTicket } from "./realtime/tickets";
import { authorizeVisitorSocket, widgetForSocket } from "./routes/widget-public";
import { runMaintenance } from "./services/retention";

export { RealtimeHub } from "./realtime/hub";

interface Env extends HubEnv {
  /** Workers AI, used when AI_PROVIDER=workers-ai. */
  AI?: WorkersAiBinding;
  [key: string]: unknown;
}

const requestDb = new AsyncLocalStorage<Database>();

/** Virtual port of the in-Worker Node HTTP server that Fastify listens on. */
const HTTP_PORT = 8080;

function connect(env: Env) {
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    // Hyperdrive caches connections; skipping the type lookup saves a round trip per request.
    fetch_types: false,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) as Database };
}

/**
 * The app is built while the Worker starts up: Fastify's router compiles small matcher
 * functions as routes are registered, and Workers only allow that during startup.
 */
async function createApp(env: Env): Promise<FastifyInstance> {
  const vars = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const config = loadConfig({
    NODE_ENV: "production",
    ...vars,
    // Unused here: connections come from Hyperdrive per request, whose connection string
    // can't be read during startup.
    DATABASE_URL: "postgres://hyperdrive.invalid/supportflow",
    JOBS_ENABLED: "false",
    // The fetch handler below replaces X-Forwarded-For with Cloudflare's client IP.
    TRUST_PROXY_HOPS: "1",
  });
  let app: FastifyInstance | null = null;
  const bus = new HubPublisher(env, (label, send) => app!.ctx.tasks.run(label, send));
  // The AI binding isn't usable while the Worker starts up, so look it up on each call.
  const ai: WorkersAiBinding = {
    run: (model, inputs) => {
      if (!env.AI) throw new Error('AI_PROVIDER=workers-ai needs the "ai" binding in wrangler.jsonc');
      return env.AI.run(model, inputs);
    },
  };
  app = await buildApp({
    config,
    ...(config.aiProvider === "workers-ai" ? { provider: new WorkersAiProvider(ai, config.AI_MODEL) } : {}),
    runtime: {
      resolveDb: () => {
        const db = requestDb.getStore();
        if (!db) throw new Error("No database connection for this request");
        return db;
      },
      bus,
      // Workers Logs collects console output as structured JSON.
      // eslint-disable-next-line no-console -- console output is the Workers log sink
      logStream: { write: (line) => console.log(line.trimEnd()) },
    },
  });
  await app.ready();
  return app;
}

const app = await createApp(workerEnv as unknown as Env);
app.server.listen(HTTP_PORT);

async function handleUpgrade(ctx: AppContext, env: Env, request: Request, url: URL): Promise<Response> {
  const origin = request.headers.get("origin") ?? undefined;
  if (url.pathname === "/realtime") {
    if (!origin || !ctx.config.WEB_ORIGIN.includes(origin)) return rejectSocket(4403, "origin not allowed");
    const ticket = verifyTicket(ctx.config.realtimeSecret, url.searchParams.get("ticket") ?? "");
    if (!ticket) return rejectSocket(4401, "invalid ticket");
    return connectToHub(env, `org:${ticket.o}`, { kind: "org", u: ticket.u, o: ticket.o, n: ticket.n, e: ticket.e });
  }
  const match = /^\/public\/widget\/([^/]+)\/ws$/.exec(url.pathname);
  if (match) {
    const widget = await widgetForSocket(ctx, decodeURIComponent(match[1]!), origin);
    if (!widget) return rejectSocket(4403, "widget unavailable");
    const result = await authorizeVisitorSocket(
      ctx,
      widget,
      url.searchParams.get("token"),
      url.searchParams.get("conversationId"),
    );
    if (!result.ok) return rejectSocket(result.code, result.reason);
    return connectToHub(env, `visitor:${result.conversationId}`, { kind: "visitor" });
  }
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env, executionCtx): Promise<Response> {
    const { sql, db } = connect(env);
    const close = () => sql.end({ timeout: 5 }).catch(() => undefined);
    return requestDb.run(db, async () => {
      try {
        const url = new URL(request.url);
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const response = await handleUpgrade(app.ctx, env, request, url);
          executionCtx.waitUntil(close());
          return response;
        }
        // Cloudflare sets cf-connecting-ip; any X-Forwarded-For from the client is discarded.
        const headers = new Headers(request.headers);
        headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") ?? "0.0.0.0");
        const response = await handleAsNodeRequest(HTTP_PORT, new Request(request, { headers }), env, executionCtx);
        // AI replies and realtime publishes finish after the response is sent.
        executionCtx.waitUntil(app.ctx.tasks.idle().finally(close));
        return response;
      } catch (error) {
        executionCtx.waitUntil(close());
        console.error("Unhandled worker error", error);
        return Response.json({ error: { code: "internal_error", message: "Something went wrong on our side" } }, { status: 500 });
      }
    });
  },

  async scheduled(_controller, env, executionCtx): Promise<void> {
    const { sql, db } = connect(env);
    executionCtx.waitUntil(
      requestDb
        .run(db, async () => {
            const result = await runMaintenance(db, app.ctx.config.DEMO_RETENTION_HOURS);
          app.log.info(result, "Maintenance finished");
        })
        .finally(() => sql.end({ timeout: 5 })),
    );
  },
} satisfies ExportedHandler<Env>;
