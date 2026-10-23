import { createHmac } from "node:crypto";
import { randomToken, safeEqual } from "../lib/crypto";

export const TICKET_TTL_MS = 60_000;

export interface TicketPayload {
  /** User id */
  u: string;
  /** Workspace id */
  o: string;
  /** Expiry, epoch milliseconds */
  e: number;
  /** Nonce, consumed on first use */
  n: string;
}

/**
 * Dashboard WebSocket tickets are signed rather than stored, so any API instance (or any
 * Cloudflare Worker isolate) can verify them. Single use is enforced by recording the
 * nonce where the socket is accepted.
 */
export function signTicket(secret: string, userId: string, orgId: string, now = Date.now()): string {
  const payload: TicketPayload = { u: userId, o: orgId, e: now + TICKET_TTL_MS, n: randomToken(12) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(secret, body)}`;
}

export function verifyTicket(secret: string, ticket: string, now = Date.now()): TicketPayload | null {
  if (ticket.length > 400) return null;
  const [body, sig] = ticket.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(secret, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TicketPayload;
    if (typeof payload.u !== "string" || typeof payload.o !== "string" || typeof payload.n !== "string") return null;
    if (typeof payload.e !== "number" || payload.e < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function hmac(secret: string, body: string): string {
  return createHmac("sha256", `realtime-ticket:${secret}`).update(body).digest("base64url");
}
