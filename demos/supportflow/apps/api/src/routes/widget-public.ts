import { and, asc, desc, eq, gt, ne, or } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  widgetCsatSchema,
  widgetMessageSchema,
  type WidgetBootstrapDto,
  type WidgetSessionDto,
} from "@supportflow/shared";
import { asksForHuman } from "../ai/guards";
import type { AppContext } from "../context";
import { conversations, customers, messages, organizations, users, widgetConfigs } from "../db/schema";
import { randomToken, sha256 } from "../lib/crypto";
import { AppError, badRequest, forbidden, notFound } from "../lib/errors";
import { parse } from "../lib/validate";
import { escalate, postMessage, runAutomation, toWidgetMessage } from "../services/conversations";
import { getOrgPlan } from "../services/workspace";

/** A resolved conversation is continued (reopened) if the visitor returns within this window. */
const CONTINUE_WINDOW_MS = 7 * 86400_000;
const MAX_LINKS = 3;

type WidgetRow = typeof widgetConfigs.$inferSelect & { aiMode: string; collectCsat: boolean };

declare module "fastify" {
  interface FastifyRequest {
    widget?: WidgetRow;
  }
}

/**
 * Checks the request's Origin against the widget's allowed origins. Browsers set Origin
 * themselves, so a page on another site cannot use this widget key from a visitor's browser.
 * The dashboard's own origin is always allowed so the in-app preview works.
 */
export function isOriginAllowed(origin: string | undefined, widget: { allowedOrigins: string[] }, webOrigins: string[]): boolean {
  if (!origin) return false;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  return widget.allowedOrigins.includes(normalized) || webOrigins.includes(normalized);
}

function setCors(reply: FastifyReply, origin: string) {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, X-Visitor-Token");
  reply.header("Access-Control-Max-Age", "600");
}

async function loadWidget(ctx: AppContext, key: string): Promise<WidgetRow | null> {
  if (!/^pk_[A-Za-z0-9_-]{10,60}$/.test(key)) return null;
  const [row] = await ctx.db
    .select({ w: widgetConfigs, aiMode: organizations.aiMode, collectCsat: organizations.collectCsat })
    .from(widgetConfigs)
    .innerJoin(organizations, eq(organizations.id, widgetConfigs.orgId))
    .where(eq(widgetConfigs.publicKey, key));
  return row ? { ...row.w, aiMode: row.aiMode, collectCsat: row.collectCsat } : null;
}

function visitorToken(request: FastifyRequest): string | null {
  const token = request.headers["x-visitor-token"];
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  return token;
}

async function findCustomer(ctx: AppContext, orgId: string, token: string | null) {
  if (!token) return null;
  const [row] = await ctx.db
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.visitorTokenHash, sha256(token))));
  return row ?? null;
}

async function currentConversation(ctx: AppContext, orgId: string, customerId: string) {
  const [row] = await ctx.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, orgId),
        eq(conversations.customerId, customerId),
        or(
          ne(conversations.status, "resolved"),
          gt(conversations.lastMessageAt, new Date(Date.now() - CONTINUE_WINDOW_MS)),
        ),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return row ?? null;
}

async function visibleMessages(ctx: AppContext, orgId: string, conversationId: string) {
  const rows = await ctx.db
    .select({ m: messages, authorName: users.name })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorUserId))
    .where(and(eq(messages.conversationId, conversationId), eq(messages.orgId, orgId), eq(messages.internal, false)))
    .orderBy(asc(messages.createdAt))
    .limit(300);
  return rows.map(({ m, authorName }) => toWidgetMessage(m, authorName));
}

export function widgetPublicRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    // Every route below is scoped to one widget key and one allowed origin.
    app.addHook("onRequest", async (request, reply) => {
      const key = (request.params as { key?: string }).key ?? "";
      const widget = await loadWidget(ctx, key);
      if (!widget) throw notFound("Widget");
      const origin = request.headers.origin;
      if (!isOriginAllowed(origin, widget, ctx.config.WEB_ORIGIN)) {
        throw forbidden("This website is not allowed to use this chat widget. Add it under Widget → Allowed websites.");
      }
      setCors(reply, new URL(origin!).origin);
      if (request.method === "OPTIONS") return reply.status(204).send();
      if (!widget.enabled) throw new AppError(403, "widget_disabled", "Chat is currently unavailable");
      request.widget = widget;
    });

    app.options("/public/widget/:key/*", async () => undefined);

    app.get("/public/widget/:key/bootstrap", async (request): Promise<WidgetBootstrapDto> => {
      const widget = request.widget!;
      const plan = await getOrgPlan(ctx.db, widget.orgId);
      return {
        config: {
          title: widget.title,
          greeting: widget.greeting,
          brandColor: widget.brandColor,
          launcherLabel: widget.launcherLabel,
          position: widget.position,
          requireEmail: widget.requireEmail,
          showBranding: !plan.features.removeBranding,
          aiEnabled: widget.aiMode === "auto" && plan.features.autoReply && ctx.ai.available,
          collectCsat: widget.collectCsat,
        },
      };
    });

    app.post(
      "/public/widget/:key/session",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (request): Promise<WidgetSessionDto> => {
        const widget = request.widget!;
        const token = visitorToken(request);
        const customer = await findCustomer(ctx, widget.orgId, token);
        if (!customer || !token) {
          // The visitor record is created with the first message, not on page view.
          return { visitorToken: randomToken(24), conversation: null, messages: [] };
        }
        await ctx.db.update(customers).set({ lastSeenAt: new Date() }).where(eq(customers.id, customer.id));
        const conversation = await currentConversation(ctx, widget.orgId, customer.id);
        return {
          visitorToken: token,
          conversation: conversation
            ? {
                id: conversation.id,
                status: conversation.status,
                humanRequested: conversation.needsHuman || !conversation.aiActive,
                csatRating: conversation.csatRating,
              }
            : null,
          messages: conversation ? await visibleMessages(ctx, widget.orgId, conversation.id) : [],
        };
      },
    );

    app.post(
      "/public/widget/:key/messages",
      {
        config: {
          rateLimit: {
            max: 12,
            timeWindow: "1 minute",
            keyGenerator: (req) => `widget-msg:${req.clientIp}:${String(req.headers["x-visitor-token"] ?? "")}`,
          },
        },
      },
      async (request, reply) => {
        const widget = request.widget!;
        const token = visitorToken(request);
        if (!token) throw badRequest("Missing visitor token");
        const input = parse(widgetMessageSchema, request.body);
        // Honeypot field and link stuffing are the most common bot signatures.
        if (input.website) throw badRequest("Your message could not be sent");
        if ((input.body.match(/https?:\/\//gi) ?? []).length > MAX_LINKS) {
          throw badRequest("Please include no more than three links in a message");
        }

        let customer = await findCustomer(ctx, widget.orgId, token);
        if (!customer) {
          if (widget.requireEmail && !input.email) {
            throw badRequest("Please enter your email so we can reply", { email: "Email is required" });
          }
          const [created] = await ctx.db
            .insert(customers)
            .values({
              orgId: widget.orgId,
              visitorTokenHash: sha256(token),
              name: input.name || null,
              email: input.email || null,
            })
            .onConflictDoNothing()
            .returning();
          customer = created ?? (await findCustomer(ctx, widget.orgId, token));
          if (!customer) throw new Error("Customer could not be created");
        } else {
          await ctx.db
            .update(customers)
            .set({
              lastSeenAt: new Date(),
              ...(input.name && !customer.name ? { name: input.name } : {}),
              ...(input.email && !customer.email ? { email: input.email } : {}),
            })
            .where(eq(customers.id, customer.id));
        }

        let conversation = await currentConversation(ctx, widget.orgId, customer.id);
        if (conversation) {
          // Drop exact repeats sent within a few seconds (double submits, simple flooding).
          const [last] = await ctx.db
            .select({ body: messages.body, createdAt: messages.createdAt })
            .from(messages)
            .where(and(eq(messages.conversationId, conversation.id), eq(messages.authorType, "customer")))
            .orderBy(desc(messages.createdAt))
            .limit(1);
          if (last && last.body === input.body && Date.now() - last.createdAt.getTime() < 10_000) {
            throw new AppError(429, "duplicate_message", "That message was already sent");
          }
        } else {
          const [created] = await ctx.db
            .insert(conversations)
            .values({ orgId: widget.orgId, customerId: customer.id })
            .returning();
          conversation = created!;
        }

        const message = await postMessage(ctx, {
          orgId: widget.orgId,
          conversationId: conversation.id,
          authorType: "customer",
          body: input.body,
        });

        if (asksForHuman(input.body) && conversation.aiActive) {
          await escalate(ctx, widget.orgId, conversation.id, "Sure — I've asked a person from our team to reply here.");
        } else {
          const orgId = widget.orgId;
          const conversationId = conversation.id;
          ctx.tasks.run("ai-automation", () => runAutomation(ctx, orgId, conversationId));
        }

        return reply.status(201).send({
          conversationId: conversation.id,
          message: {
            id: message.id,
            authorType: "customer" as const,
            authorName: null,
            body: message.body,
            createdAt: message.createdAt,
          },
        });
      },
    );

    app.post(
      "/public/widget/:key/handoff",
      { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (request) => {
        const widget = request.widget!;
        const customer = await findCustomer(ctx, widget.orgId, visitorToken(request));
        if (!customer) throw notFound("Conversation");
        const conversation = await currentConversation(ctx, widget.orgId, customer.id);
        if (!conversation) throw notFound("Conversation");
        if (!conversation.needsHuman) {
          await escalate(ctx, widget.orgId, conversation.id, "Sure — I've asked a person from our team to reply here.");
        }
        return { ok: true };
      },
    );

    app.post(
      "/public/widget/:key/csat",
      { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (request) => {
        const widget = request.widget!;
        if (!widget.collectCsat) throw badRequest("Ratings are not collected for this chat");
        const input = parse(widgetCsatSchema, request.body);
        const customer = await findCustomer(ctx, widget.orgId, visitorToken(request));
        if (!customer) throw notFound("Conversation");
        const conversation = await currentConversation(ctx, widget.orgId, customer.id);
        if (!conversation || conversation.status !== "resolved") {
          throw badRequest("You can rate a conversation once it is resolved");
        }
        if (conversation.csatRating !== null) throw badRequest("You have already rated this conversation");
        await ctx.db
          .update(conversations)
          .set({ csatRating: input.rating, csatComment: input.comment || null })
          .where(eq(conversations.id, conversation.id));
        ctx.bus.publishOrg(widget.orgId, { type: "conversation.updated", conversationId: conversation.id });
        return { ok: true };
      },
    );

    // Realtime updates for one visitor's conversation.
    app.get("/public/widget/:key/ws", { websocket: true }, async (socket, request) => {
      const widget = request.widget!;
      const { token, conversationId } = (request.query ?? {}) as { token?: string; conversationId?: string };
      const customer = await findCustomer(ctx, widget.orgId, typeof token === "string" ? token : null);
      if (!customer || typeof conversationId !== "string" || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
        socket.close(4401, "unauthorized");
        return;
      }
      const [conversation] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.orgId, widget.orgId),
            eq(conversations.customerId, customer.id),
          ),
        );
      if (!conversation) {
        socket.close(4404, "not found");
        return;
      }
      const unsubscribe = ctx.bus.subscribeVisitor(conversation.id, (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
      });
      const ping = setInterval(() => socket.readyState === socket.OPEN && socket.ping(), 25_000);
      socket.on("message", () => {
        // The widget socket is receive-only; messages are sent over HTTPS.
      });
      socket.on("close", () => {
        clearInterval(ping);
        unsubscribe();
      });
    });
  };
}
