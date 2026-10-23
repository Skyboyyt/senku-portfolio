import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { AiAssistant } from "./ai/assistant";
import { createProvider } from "./ai/providers";
import type { LlmProvider } from "./ai/types";
import { BillingService } from "./billing/service";
import type { Config } from "./config";
import { TaskTracker, type AppContext } from "./context";
import { createDb, type DbHandle } from "./db/client";
import { AppError } from "./lib/errors";
import { loadSession, resolveClientIp, SESSION_COOKIE } from "./plugins/auth";
import { RealtimeBus } from "./realtime/bus";
import { realtimeRoutes } from "./realtime/routes";
import { analyticsRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { conversationRoutes } from "./routes/conversations";
import { kbRoutes } from "./routes/kb";
import { orgRoutes } from "./routes/orgs";
import { publicRoutes } from "./routes/public";
import { teamRoutes } from "./routes/team";
import { ticketRoutes } from "./routes/tickets";
import { widgetAdminRoutes } from "./routes/widget-admin";
import { widgetPublicRoutes } from "./routes/widget-public";

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

export interface BuildOptions {
  config: Config;
  db?: DbHandle;
  provider?: LlmProvider;
  fetchImpl?: typeof fetch;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL ?? (config.NODE_ENV === "test" ? "silent" : "info"),
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          'req.headers["x-sf-proxy-secret"]',
          'req.headers["x-visitor-token"]',
          'req.headers["stripe-signature"]',
        ],
        remove: true,
      },
    },
    // Trust exactly the configured number of reverse-proxy hops for request.ip.
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
    bodyLimit: 1_000_000,
    disableRequestLogging: config.NODE_ENV === "test",
  });

  const dbHandle = options.db ?? createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  const provider = options.provider ?? createProvider(config);
  const ctx: AppContext = {
    config,
    db: dbHandle.db,
    bus: new RealtimeBus(),
    ai: new AiAssistant(dbHandle.db, provider, config.AI_TIMEOUT_MS),
    billing: new BillingService(dbHandle.db, config, options.fetchImpl),
    tasks: new TaskTracker(app.log),
    log: app.log,
  };
  app.decorate("ctx", ctx);
  if (!options.db) app.addHook("onClose", async () => dbHandle.close());
  app.addHook("onClose", async () => ctx.tasks.idle());

  // Only JSON bodies are accepted. Dropping text/plain removes a CORS-"simple" content type
  // that cross-site forms could otherwise use.
  app.removeContentTypeParser("text/plain");

  await app.register(cookie);
  await app.register(helmet, {
    // The widget script and public widget API are loaded from customer websites.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    // Run after body parsing so route key generators can read the body.
    hook: "preHandler",
    keyGenerator: (request) => request.clientIp,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, "rate_limited", `Too many requests. Try again in ${context.after}.`),
  });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  app.decorateRequest("session", null);
  app.decorateRequest("clientIp", "");
  app.addHook("onRequest", async (request) => {
    request.clientIp = resolveClientIp(ctx, request);
    if (request.url.startsWith("/public/") || request.url.startsWith("/health")) return;
    request.session = await loadSession(ctx, request);
    // CSRF: cookie-authenticated writes must come from the dashboard's origin.
    const origin = request.headers.origin;
    if (
      request.cookies[SESSION_COOKIE] &&
      !SAFE_METHODS.has(request.method) &&
      origin &&
      !config.WEB_ORIGIN.includes(origin)
    ) {
      throw new AppError(403, "bad_origin", "Request origin not allowed");
    }
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
      });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "Unhandled error");
      return reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong on our side" } });
    }
    // Fastify's own 4xx errors: malformed JSON, body too large, unsupported media type.
    return reply.status(status).send({ error: { code: error.code ?? "bad_request", message: error.message } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: "not_found", message: "Route not found" } }),
  );

  await app.register(publicRoutes(ctx));
  await app.register(authRoutes(ctx));
  await app.register(orgRoutes(ctx));
  await app.register(teamRoutes(ctx));
  await app.register(conversationRoutes(ctx));
  await app.register(ticketRoutes(ctx));
  await app.register(kbRoutes(ctx));
  await app.register(analyticsRoutes(ctx));
  await app.register(widgetAdminRoutes(ctx));
  await app.register(widgetPublicRoutes(ctx));
  await app.register(billingRoutes(ctx));
  await app.register(realtimeRoutes(ctx));

  return app;
}
