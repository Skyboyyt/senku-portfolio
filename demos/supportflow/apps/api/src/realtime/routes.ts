import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../context";
import { memberships } from "../db/schema";
import { randomToken } from "../lib/crypto";
import { requireMember } from "../plugins/auth";

const TICKET_TTL_MS = 60_000;
const MEMBERSHIP_RECHECK_MS = 60_000;

interface Ticket {
  userId: string;
  orgId: string;
  expiresAt: number;
}

/**
 * Dashboard WebSocket. The browser connects to the API host directly (the web proxy can't
 * carry WebSockets), so it first exchanges its session cookie, via the proxy, for a
 * single-use ticket that is valid for one minute.
 */
export function realtimeRoutes(ctx: AppContext): FastifyPluginAsync {
  const tickets = new Map<string, Ticket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, ticket] of tickets) if (ticket.expiresAt < now) tickets.delete(key);
  }, 30_000);
  sweep.unref();

  return async (app) => {
    app.addHook("onClose", async () => clearInterval(sweep));

    app.post("/realtime/ticket", async (request) => {
      const member = await requireMember(ctx, request);
      const ticket = randomToken(24);
      tickets.set(ticket, { userId: member.user.id, orgId: member.orgId, expiresAt: Date.now() + TICKET_TTL_MS });
      return { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 };
    });

    app.get("/realtime", { websocket: true }, (socket, request) => {
      const origin = request.headers.origin;
      if (!origin || !ctx.config.WEB_ORIGIN.includes(origin)) {
        socket.close(4403, "origin not allowed");
        return;
      }
      const key = String((request.query as { ticket?: string } | undefined)?.ticket ?? "");
      const ticket = tickets.get(key);
      tickets.delete(key);
      if (!ticket || ticket.expiresAt < Date.now()) {
        socket.close(4401, "invalid ticket");
        return;
      }

      const unsubscribe = ctx.bus.subscribeOrg(ticket.orgId, (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
      });
      // Close the socket if the user is removed from the workspace.
      const recheck = setInterval(async () => {
        try {
          const [row] = await ctx.db
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.orgId, ticket.orgId), eq(memberships.userId, ticket.userId)));
          if (!row) socket.close(4403, "membership revoked");
          else if (socket.readyState === socket.OPEN) socket.ping();
        } catch (error) {
          request.log.warn({ err: error }, "Realtime membership check failed");
        }
      }, MEMBERSHIP_RECHECK_MS);
      socket.send(JSON.stringify({ type: "ready" }));
      socket.on("close", () => {
        clearInterval(recheck);
        unsubscribe();
      });
    });
  };
}
