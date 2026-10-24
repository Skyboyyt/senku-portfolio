import { and, asc, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  acceptInviteSchema,
  inviteSchema,
  registerWithInviteSchema,
  updateMemberSchema,
  type InvitationDto,
  type MemberDto,
} from "@supportflow/shared";
import type { AppContext } from "../context";
import type { DbOrTx } from "../db/client";
import {
  conversations,
  invitations,
  memberships,
  organizations,
  sessions,
  tickets,
  users,
} from "../db/schema";
import { audit } from "../lib/audit";
import { hashPassword, randomToken, sha256 } from "../lib/crypto";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { idParam, parse } from "../lib/validate";
import { createSession, requireMember, requireUser } from "../plugins/auth";
import { buildSessionDto } from "../services/session-dto";
import { assertSeatAvailable } from "../services/workspace";

const INVITE_TTL_DAYS = 7;

async function ownerCount(db: DbOrTx, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  return row?.n ?? 0;
}

async function findInvitation(db: DbOrTx, token: string) {
  const [row] = await db
    .select({ invitation: invitations, orgName: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(eq(invitations.tokenHash, sha256(token)));
  if (!row || row.invitation.revokedAt || row.invitation.acceptedAt) throw notFound("Invitation");
  if (row.invitation.expiresAt < new Date()) {
    throw new AppError(410, "invitation_expired", "This invitation has expired. Ask for a new one.");
  }
  return row;
}

export function teamRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.get("/team/members", async (request) => {
      const member = await requireMember(ctx, request);
      const openCounts = ctx.db
        .select({ assigneeId: conversations.assigneeId, n: count().as("n") })
        .from(conversations)
        .where(and(eq(conversations.orgId, member.orgId), ne(conversations.status, "resolved")))
        .groupBy(conversations.assigneeId)
        .as("open_counts");
      const rows = await ctx.db
        .select({
          id: memberships.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          role: memberships.role,
          joinedAt: memberships.createdAt,
          open: sql<number>`coalesce(${openCounts.n}, 0)::int`,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(openCounts, eq(openCounts.assigneeId, memberships.userId))
        .where(eq(memberships.orgId, member.orgId))
        .orderBy(asc(memberships.createdAt));
      return rows.map(
        (r): MemberDto => ({
          id: r.id,
          userId: r.userId,
          name: r.name,
          email: r.email,
          role: r.role,
          joinedAt: r.joinedAt.toISOString(),
          openConversations: r.open,
        }),
      );
    });

    app.get("/team/invitations", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const rows = await ctx.db
        .select({ invitation: invitations, inviter: users.name })
        .from(invitations)
        .leftJoin(users, eq(users.id, invitations.invitedBy))
        .where(
          and(
            eq(invitations.orgId, member.orgId),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(invitations.createdAt));
      return rows.map(
        ({ invitation, inviter }): InvitationDto => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          invitedBy: inviter,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        }),
      );
    });

    app.post("/team/invitations", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const input = parse(inviteSchema, request.body);
      const [existing] = await ctx.db
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, member.orgId), sql`lower(${users.email}) = ${input.email}`));
      if (existing) throw conflict("This person is already a member", { email: "Already a member of this workspace" });

      const token = randomToken(32);
      const invitation = await ctx.db.transaction(async (tx) => {
        // Replace any earlier pending invitation for the same address.
        await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(invitations.orgId, member.orgId),
              eq(invitations.email, input.email),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          );
        await assertSeatAvailable(tx, member.orgId);
        const [row] = await tx
          .insert(invitations)
          .values({
            orgId: member.orgId,
            email: input.email,
            role: input.role,
            tokenHash: sha256(token),
            invitedBy: member.user.id,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000),
          })
          .returning();
        if (!row) throw new Error("Invitation insert failed");
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "member.invited",
          targetType: "invitation",
          targetId: row.id,
          metadata: { email: input.email, role: input.role },
          ip: request.clientIp,
        });
        return row;
      });
      // Email delivery is not configured: the link is returned once for the admin to share.
      return reply.status(201).send({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          invitedBy: member.user.name,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        } satisfies InvitationDto,
        inviteUrl: `${ctx.config.WEB_ORIGIN[0]}/invite/${token}`,
      });
    });

    app.delete("/team/invitations/:id", async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Invitation");
      const [row] = await ctx.db
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, id), eq(invitations.orgId, member.orgId), isNull(invitations.acceptedAt)))
        .returning();
      if (!row) throw notFound("Invitation");
      await audit(ctx.db, {
        orgId: member.orgId,
        actorUserId: member.user.id,
        action: "invitation.revoked",
        targetType: "invitation",
        targetId: id,
        metadata: { email: row.email },
        ip: request.clientIp,
      });
      return reply.status(204).send();
    });

    app.patch("/team/members/:id", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Member");
      const { role } = parse(updateMemberSchema, request.body);
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(memberships)
          .where(and(eq(memberships.id, id), eq(memberships.orgId, member.orgId)));
        if (!target) throw notFound("Member");
        if ((target.role === "owner" || role === "owner") && member.role !== "owner") {
          throw forbidden("Only an owner can grant or change the owner role");
        }
        if (target.role === "owner" && role !== "owner" && (await ownerCount(tx, member.orgId)) <= 1) {
          throw badRequest("A workspace needs at least one owner. Make someone else an owner first.");
        }
        const [updated] = await tx.update(memberships).set({ role }).where(eq(memberships.id, id)).returning();
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "member.role_changed",
          targetType: "member",
          targetId: target.userId,
          metadata: { from: target.role, to: role },
          ip: request.clientIp,
        });
        return { id: updated!.id, role: updated!.role };
      });
    });

    app.delete("/team/members/:id", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Member");
      await ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(memberships)
          .where(and(eq(memberships.id, id), eq(memberships.orgId, member.orgId)));
        if (!target) throw notFound("Member");
        const isSelf = target.userId === member.user.id;
        // Anyone may leave; removing others needs admin, and removing an owner needs owner.
        if (!isSelf && member.role === "agent") throw forbidden();
        if (!isSelf && target.role === "owner" && member.role !== "owner") {
          throw forbidden("Only an owner can remove another owner");
        }
        if (target.role === "owner" && (await ownerCount(tx, member.orgId)) <= 1) {
          throw badRequest("The last owner can't leave. Transfer ownership or delete the workspace.");
        }
        await tx.delete(memberships).where(eq(memberships.id, id));
        await tx
          .update(conversations)
          .set({ assigneeId: null })
          .where(and(eq(conversations.orgId, member.orgId), eq(conversations.assigneeId, target.userId)));
        await tx
          .update(tickets)
          .set({ ownerId: null })
          .where(and(eq(tickets.orgId, member.orgId), eq(tickets.ownerId, target.userId)));
        await tx
          .update(sessions)
          .set({ activeOrgId: null })
          .where(and(eq(sessions.userId, target.userId), eq(sessions.activeOrgId, member.orgId)));
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: isSelf ? "member.left" : "member.removed",
          targetType: "member",
          targetId: target.userId,
          metadata: { role: target.role },
          ip: request.clientIp,
        });
      });
      return reply.status(204).send();
    });

    // ----- Accepting invitations (the invitee is not yet a member) -----

    app.get("/invitations/:token", { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request) => {
      const token = String((request.params as { token: string }).token ?? "");
      if (token.length < 20 || token.length > 200) throw notFound("Invitation");
      const { invitation, orgName } = await findInvitation(ctx.db, token);
      const [account] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${invitation.email}`);
      return {
        organizationName: orgName,
        email: invitation.email,
        role: invitation.role,
        hasAccount: Boolean(account),
        expiresAt: invitation.expiresAt.toISOString(),
      };
    });

    app.post("/invitations/accept", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (request) => {
      const session = requireUser(request);
      const { token } = parse(acceptInviteSchema, request.body);
      const orgId = await ctx.db.transaction(async (tx) => {
        const { invitation } = await findInvitation(tx, token);
        if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
          throw forbidden(`This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`);
        }
        await joinFromInvitation(tx, invitation, session.user.id, request.clientIp);
        return invitation.orgId;
      });
      await ctx.db.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, session.id));
      return buildSessionDto(ctx, { ...session, activeOrgId: orgId });
    });

    app.post(
      "/invitations/register",
      { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const input = parse(registerWithInviteSchema, request.body);
        const passwordHash = await hashPassword(ctx.db, input.password);
        const result = await ctx.db.transaction(async (tx) => {
          const { invitation } = await findInvitation(tx, input.token);
          const [taken] = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.email}) = ${invitation.email}`);
          if (taken) throw conflict("An account with this email already exists. Sign in to accept the invitation.");
          const [user] = await tx
            .insert(users)
            .values({ email: invitation.email, name: input.name, passwordHash })
            .returning();
          if (!user) throw new Error("User insert failed");
          await joinFromInvitation(tx, invitation, user.id, request.clientIp);
          return { user, orgId: invitation.orgId };
        });
        await createSession(ctx, request, reply, result.user.id, result.orgId);
        return reply.status(201).send(
          await buildSessionDto(ctx, {
            id: "",
            activeOrgId: result.orgId,
            user: { id: result.user.id, email: result.user.email, name: result.user.name },
          }),
        );
      },
    );
  };
}

async function joinFromInvitation(
  tx: DbOrTx,
  invitation: typeof invitations.$inferSelect,
  userId: string,
  ip: string,
): Promise<void> {
  const [already] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, invitation.orgId), eq(memberships.userId, userId)));
  if (!already) {
    // This invitation is already counted as a pending seat, so no extra seat is needed.
    await assertSeatAvailable(tx, invitation.orgId, 0);
    await tx.insert(memberships).values({ orgId: invitation.orgId, userId, role: invitation.role });
  }
  await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invitation.id));
  await audit(tx, {
    orgId: invitation.orgId,
    actorUserId: userId,
    action: "member.joined",
    targetType: "member",
    targetId: userId,
    metadata: { role: invitation.role, invitationId: invitation.id },
    ip,
  });
}
