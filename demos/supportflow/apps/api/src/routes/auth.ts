import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  switchOrgSchema,
  updateProfileSchema,
} from "@supportflow/shared";
import type { AppContext } from "../context";
import { memberships, sessions, users } from "../db/schema";
import { getDummyHash, hashPassword, verifyPassword } from "../lib/crypto";
import { AppError, conflict, forbidden, isUniqueViolation } from "../lib/errors";
import { parse } from "../lib/validate";
import { clearSessionCookie, createSession, requireUser } from "../plugins/auth";
import { buildSessionDto } from "../services/session-dto";
import { createWorkspace } from "../services/workspace";

export function authRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.post(
      "/auth/register",
      { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const input = parse(registerSchema, request.body);
        const passwordHash = await hashPassword(input.password);
        let created: { userId: string; orgId: string };
        try {
          created = await ctx.db.transaction(async (tx) => {
            const [user] = await tx
              .insert(users)
              .values({ email: input.email, name: input.name, passwordHash })
              .returning({ id: users.id });
            if (!user) throw new Error("User insert failed");
            const org = await createWorkspace(tx, {
              name: input.organizationName,
              ownerId: user.id,
              ip: request.clientIp,
            });
            return { userId: user.id, orgId: org.id };
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw conflict("An account with this email already exists", {
              email: "An account with this email already exists. Sign in instead.",
            });
          }
          throw error;
        }
        await createSession(ctx, request, reply, created.userId, created.orgId);
        const dto = await buildSessionDto(ctx, {
          id: "",
          activeOrgId: created.orgId,
          user: { id: created.userId, email: input.email, name: input.name },
        });
        return reply.status(201).send(dto);
      },
    );

    app.post(
      "/auth/login",
      {
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "15 minutes",
            keyGenerator: (req) => {
              const email = (req.body as { email?: unknown } | undefined)?.email;
              return `login:${req.clientIp}:${typeof email === "string" ? email.toLowerCase().slice(0, 254) : ""}`;
            },
          },
        },
      },
      async (request, reply) => {
        const input = parse(loginSchema, request.body);
        const [user] = await ctx.db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${input.email}`);
        // Verify against a dummy hash when the user doesn't exist, so timing doesn't reveal accounts.
        const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
        if (!user || !valid) {
          throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
        }
        const [latest] = await ctx.db
          .select({ orgId: memberships.orgId })
          .from(memberships)
          .where(eq(memberships.userId, user.id))
          .orderBy(desc(memberships.createdAt))
          .limit(1);
        await createSession(ctx, request, reply, user.id, latest?.orgId ?? null);
        return buildSessionDto(ctx, {
          id: "",
          activeOrgId: latest?.orgId ?? null,
          user: { id: user.id, email: user.email, name: user.name },
        });
      },
    );

    app.post("/auth/logout", async (request, reply) => {
      if (request.session) await ctx.db.delete(sessions).where(eq(sessions.id, request.session.id));
      clearSessionCookie(ctx, reply);
      return reply.status(204).send();
    });

    app.get("/auth/session", async (request) => buildSessionDto(ctx, requireUser(request)));

    app.post("/auth/switch-org", async (request) => {
      const session = requireUser(request);
      const { organizationId } = parse(switchOrgSchema, request.body);
      const [membership] = await ctx.db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.orgId, organizationId), eq(memberships.userId, session.user.id)));
      if (!membership) throw forbidden("You are not a member of that workspace");
      await ctx.db.update(sessions).set({ activeOrgId: organizationId }).where(eq(sessions.id, session.id));
      return buildSessionDto(ctx, { ...session, activeOrgId: organizationId });
    });

    app.patch("/auth/profile", async (request) => {
      const session = requireUser(request);
      const { name } = parse(updateProfileSchema, request.body);
      await ctx.db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, session.user.id));
      return buildSessionDto(ctx, { ...session, user: { ...session.user, name } });
    });

    app.post(
      "/auth/password",
      { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
      async (request, reply) => {
        const session = requireUser(request);
        const input = parse(changePasswordSchema, request.body);
        const [user] = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
        if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
          throw new AppError(400, "invalid_password", "Current password is incorrect", {
            currentPassword: "Current password is incorrect",
          });
        }
        await ctx.db
          .update(users)
          .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
          .where(eq(users.id, user.id));
        // Sign out every other device.
        await ctx.db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, session.id)));
        return reply.status(204).send();
      },
    );
  };
}
