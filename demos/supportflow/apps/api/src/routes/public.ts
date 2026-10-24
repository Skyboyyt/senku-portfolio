import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { contactSchema } from "@supportflow/shared";
import type { AppContext } from "../context";
import { contactRequests } from "../db/schema";
import { badRequest } from "../lib/errors";
import { parse } from "../lib/validate";

function widgetScriptPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../../public/widget.js"), path.resolve(here, "../public/widget.js")];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function publicRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

    app.get("/health/ready", { config: { rateLimit: false } }, async (_request, reply) => {
      try {
        await ctx.db.execute(sql`select 1`);
        return { status: "ok", database: "ok", ai: ctx.ai.provider.name, billing: ctx.billing.mode };
      } catch {
        return reply.status(503).send({ status: "error", database: "unreachable" });
      }
    });

    app.get("/widget.js", async (_request, reply) => {
      const file = widgetScriptPath();
      if (!file) return reply.status(404).type("text/plain").send("Widget script has not been built");
      reply
        .header("Content-Type", "application/javascript; charset=utf-8")
        .header("Cache-Control", "public, max-age=300")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
      return reply.send(createReadStream(file));
    });

    app.post(
      "/contact",
      { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const input = parse(contactSchema, request.body);
        if (input.website) throw badRequest("Your message could not be sent");
        await ctx.db.insert(contactRequests).values({
          name: input.name,
          email: input.email,
          company: input.company,
          message: input.message,
          ip: request.clientIp,
        });
        if (ctx.config.CONTACT_WEBHOOK_URL) {
          // Optional notification (for example a Slack incoming webhook). Failures don't lose the message.
          fetch(ctx.config.CONTACT_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `New SupportFlow contact request from ${input.name} <${input.email}>${input.company ? ` (${input.company})` : ""}:\n${input.message}`,
            }),
            signal: AbortSignal.timeout(5000),
          }).catch((error: unknown) => request.log.warn({ err: error }, "Contact webhook failed"));
        }
        return reply.status(201).send({ ok: true });
      },
    );
  };
}
