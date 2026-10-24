import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { roleAtLeast, type Role } from "@supportflow/shared";
import type { AppContext } from "../context";
import { memberships, sessions, users } from "../db/schema";
import { randomToken, safeEqual, sha256 } from "../lib/crypto";
import { forbidden, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "sf_session";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface SessionState {
  id: string;
  user: AuthUser;
  activeOrgId: string | null;
}

export interface MemberContext {
  user: AuthUser;
  sessionId: string;
  orgId: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    session: SessionState | null;
    clientIp: string;
  }
}

/**
 * The client IP for rate limiting and audit logs. Requests relayed by the web app's /api
 * proxy carry the browser's IP in a header that is trusted only with the shared secret.
 */
export function resolveClientIp(ctx: AppContext, request: FastifyRequest): string {
  const secret = ctx.config.PROXY_SHARED_SECRET;
  const provided = request.headers["x-sf-proxy-secret"];
  const forwarded = request.headers["x-sf-client-ip"];
  if (secret && typeof provided === "string" && safeEqual(provided, secret) && typeof forwarded === "string") {
    return forwarded.split(",")[0]!.trim().slice(0, 64);
  }
  return request.ip;
}

const TOUCH_INTERVAL_MS = 5 * 60_000;

export async function loadSession(ctx: AppContext, request: FastifyRequest): Promise<SessionState | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const now = new Date();
  const [row] = await ctx.db
    .select({
      id: sessions.id,
      activeOrgId: sessions.activeOrgId,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    // Sliding expiry: active sessions stay signed in.
    const expiresAt = new Date(now.getTime() + ctx.config.SESSION_TTL_DAYS * 86400_000);
    await ctx.db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
  }
  return {
    id: row.id,
    activeOrgId: row.activeOrgId,
    user: { id: row.userId, email: row.email, name: row.name },
  };
}

export async function createSession(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  activeOrgId: string | null,
): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ctx.config.SESSION_TTL_DAYS * 86400_000);
  await ctx.db.insert(sessions).values({
    id: sha256(token),
    userId,
    activeOrgId,
    expiresAt,
    ip: request.clientIp,
    userAgent: (request.headers["user-agent"] ?? "").slice(0, 300),
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, secure: ctx.config.cookieSecure, sameSite: "lax" });
}

export function requireUser(request: FastifyRequest): SessionState {
  if (!request.session) throw unauthorized();
  return request.session;
}

/**
 * Resolves the caller's active workspace and checks their role. Membership is read from
 * the database on every request, so removed members and role changes take effect at once.
 */
export async function requireMember(
  ctx: AppContext,
  request: FastifyRequest,
  minimum: Role = "agent",
): Promise<MemberContext> {
  const session = requireUser(request);
  if (!session.activeOrgId) throw forbidden("Choose a workspace first");
  const [membership] = await ctx.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, session.activeOrgId), eq(memberships.userId, session.user.id)));
  if (!membership) throw forbidden("You are not a member of this workspace");
  if (!roleAtLeast(membership.role, minimum)) {
    throw forbidden(`This action needs the ${minimum} role or higher`);
  }
  return { user: session.user, sessionId: session.id, orgId: session.activeOrgId, role: membership.role };
}
