import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../context";
import { memberships } from "../db/schema";
import { requireMember } from "../plugins/auth";
import type { RealtimeBus } from "./bus";
import { TICKET_TTL_MS, signTicket, verifyTicket } from "./tickets";

const MEMBERSHIP_RECHECK_MS = 60_000;

/**
 * Dashboard WebSocket. The browser connects to the API host directly (the web proxy can't
 * carry WebSockets), so it first exchanges its session cookie, via the proxy, for a signed,
 * single-use ticket that is valid for one minute.
 *
 * `localBus` is the in-process bus of the Node server. On Cloudflare Workers sockets are
 * accepted by a Durable Object instead (see `worker.ts`), so only the ticket route is used.
 */
export function realtimeRoutes(ctx: AppContext, localBus: RealtimeBus | null): FastifyPluginAsync {
  const usedNonces = new Map<string, number>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [nonce, expires] of usedNonces) if (expires < now) usedNonces.delete(nonce);
  }, 30_000);
  sweep.unref?.();

  return async (app) => {
    app.addHook("onClose", async () => clearInterval(sweep));

    app.post("/realtime/ticket", async (request) => {
      const member = await requireMember(ctx, request);
      return {
        ticket: signTicket(ctx.config.realtimeSecret, member.user.id, member.orgId),
        expiresInSeconds: TICKET_TTL_MS / 1000,
      };
    });

    if (!localBus) return;

    app.get("/realtime", { websocket: true }, (socket, request) => {
      const origin = request.headers.origin;
      if (!origin || !ctx.config.WEB_ORIGIN.includes(origin)) {
        socket.close(4403, "origin not allowed");
        return;
      }
      const ticket = verifyTicket(ctx.config.realtimeSecret, String((request.query as { ticket?: string } | undefined)?.ticket ?? ""));
      if (!ticket || usedNonces.has(ticket.n)) {
        socket.close(4401, "invalid ticket");
        return;
      }
      usedNonces.set(ticket.n, ticket.e);

      const unsubscribe = localBus.subscribeOrg(ticket.o, (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
      });
      // Close the socket if the user is removed from the workspace.
      const recheck = setInterval(async () => {
        try {
          const [row] = await ctx.db
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.orgId, ticket.o), eq(memberships.userId, ticket.u)));
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
