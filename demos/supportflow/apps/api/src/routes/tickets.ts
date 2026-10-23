import { aliasedTable, and, asc, desc, eq, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  LABELS,
  createTicketSchema,
  ticketCommentSchema,
  ticketListQuerySchema,
  updateTicketSchema,
  type TicketCommentDto,
  type TicketDto,
  type TicketEventDto,
} from "@supportflow/shared";
import type { AppContext } from "../context";
import { auditLogs, conversations, customers, memberships, ticketComments, tickets, users } from "../db/schema";
import { audit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { idParam, parse } from "../lib/validate";
import { requireMember } from "../plugins/auth";
import { postMessage } from "../services/conversations";
import { nextTicketNumber } from "../services/workspace";
import { escapeLike } from "./conversations";

const owners = aliasedTable(users, "owners");
const creators = aliasedTable(users, "creators");

function ticketSelect(ctx: AppContext) {
  return ctx.db
    .select({
      t: tickets,
      ownerName: owners.name,
      creatorName: creators.name,
      customerName: customers.name,
      customerEmail: customers.email,
    })
    .from(tickets)
    .leftJoin(owners, eq(owners.id, tickets.ownerId))
    .leftJoin(creators, eq(creators.id, tickets.createdBy))
    .leftJoin(customers, eq(customers.id, tickets.customerId));
}

type TicketRow = Awaited<ReturnType<ReturnType<typeof ticketSelect>["execute"]>>[number];

function toTicketDto(row: TicketRow): TicketDto {
  const t = row.t;
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    owner: t.ownerId && row.ownerName ? { id: t.ownerId, name: row.ownerName } : null,
    createdBy: t.createdBy && row.creatorName ? { id: t.createdBy, name: row.creatorName } : null,
    conversationId: t.conversationId,
    customer: t.customerId ? { id: t.customerId, name: row.customerName, email: row.customerEmail } : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
  };
}

async function assertMember(ctx: AppContext, orgId: string, userId: string) {
  const [row] = await ctx.db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  if (!row) throw badRequest("The owner must be a member of this workspace", { ownerId: "Not a member" });
}

export function ticketRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.get("/tickets", async (request) => {
      const member = await requireMember(ctx, request);
      const query = parse(ticketListQuerySchema, request.query);
      const filters: (SQL | undefined)[] = [eq(tickets.orgId, member.orgId)];
      if (query.status === "active") filters.push(notInArray(tickets.status, ["resolved", "closed"]));
      else if (query.status !== "all") filters.push(eq(tickets.status, query.status));
      if (query.priority !== "all") filters.push(eq(tickets.priority, query.priority));
      if (query.owner === "me") filters.push(eq(tickets.ownerId, member.user.id));
      if (query.owner === "unassigned") filters.push(isNull(tickets.ownerId));
      if (query.q) {
        const like = `%${escapeLike(query.q)}%`;
        const asNumber = /^#?(\d{1,9})$/.exec(query.q)?.[1];
        filters.push(
          or(
            sql`${tickets.title} ilike ${like}`,
            sql`${tickets.description} ilike ${like}`,
            sql`${customers.email} ilike ${like}`,
            asNumber ? eq(tickets.number, Number(asNumber)) : undefined,
          ),
        );
      }
      const rows = await ticketSelect(ctx)
        .where(and(...filters))
        .orderBy(
          sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
          desc(tickets.updatedAt),
        )
        .limit(300);
      return rows.map(toTicketDto);
    });

    app.post("/tickets", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const input = parse(createTicketSchema, request.body);
      if (input.ownerId) await assertMember(ctx, member.orgId, input.ownerId);
      let customerId: string | null = null;
      if (input.conversationId) {
        const [conversation] = await ctx.db
          .select({ customerId: conversations.customerId })
          .from(conversations)
          .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, member.orgId)));
        if (!conversation) throw notFound("Conversation");
        customerId = conversation.customerId;
      }
      const ticket = await ctx.db.transaction(async (tx) => {
        const number = await nextTicketNumber(tx, member.orgId);
        const [row] = await tx
          .insert(tickets)
          .values({
            orgId: member.orgId,
            number,
            title: input.title,
            description: input.description,
            priority: input.priority,
            ownerId: input.ownerId ?? null,
            createdBy: member.user.id,
            conversationId: input.conversationId ?? null,
            customerId,
          })
          .returning();
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "ticket.created",
          targetType: "ticket",
          targetId: row!.id,
          metadata: { number, priority: input.priority },
          ip: request.clientIp,
        });
        return row!;
      });
      if (input.conversationId) {
        await postMessage(ctx, {
          orgId: member.orgId,
          conversationId: input.conversationId,
          authorType: "system",
          authorUserId: member.user.id,
          body: `Ticket #${ticket.number} created: ${ticket.title}`,
          internal: true,
        });
      }
      ctx.bus.publishOrg(member.orgId, { type: "ticket.updated", ticketId: ticket.id });
      const [row] = await ticketSelect(ctx).where(eq(tickets.id, ticket.id));
      return reply.status(201).send(toTicketDto(row!));
    });

    app.get("/tickets/:id", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Ticket");
      const [row] = await ticketSelect(ctx).where(and(eq(tickets.id, id), eq(tickets.orgId, member.orgId)));
      if (!row) throw notFound("Ticket");
      const comments = await ctx.db
        .select({ c: ticketComments, authorName: users.name })
        .from(ticketComments)
        .leftJoin(users, eq(users.id, ticketComments.authorId))
        .where(and(eq(ticketComments.ticketId, id), eq(ticketComments.orgId, member.orgId)))
        .orderBy(asc(ticketComments.createdAt));
      const events = await ctx.db
        .select({ e: auditLogs, actorName: users.name })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(
          and(eq(auditLogs.orgId, member.orgId), eq(auditLogs.targetType, "ticket"), eq(auditLogs.targetId, id)),
        )
        .orderBy(asc(auditLogs.createdAt))
        .limit(200);
      return {
        ticket: toTicketDto(row),
        comments: comments.map(
          ({ c, authorName }): TicketCommentDto => ({
            id: c.id,
            body: c.body,
            author: c.authorId && authorName ? { id: c.authorId, name: authorName } : null,
            createdAt: c.createdAt.toISOString(),
          }),
        ),
        events: events.map(
          ({ e, actorName }): TicketEventDto => ({
            id: e.id,
            action: e.action,
            actor: actorName,
            metadata: e.metadata,
            createdAt: e.createdAt.toISOString(),
          }),
        ),
      };
    });

    app.patch("/tickets/:id", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Ticket");
      const input = parse(updateTicketSchema, request.body);
      if (input.ownerId) await assertMember(ctx, member.orgId, input.ownerId);
      const [current] = await ctx.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.orgId, member.orgId)));
      if (!current) throw notFound("Ticket");

      const changes: Partial<typeof tickets.$inferInsert> = {};
      const events: { action: string; metadata: Record<string, unknown> }[] = [];
      if (input.title !== undefined && input.title !== current.title) changes.title = input.title;
      if (input.description !== undefined && input.description !== current.description) changes.description = input.description;
      if (input.priority && input.priority !== current.priority) {
        changes.priority = input.priority;
        events.push({ action: "ticket.priority_changed", metadata: { from: current.priority, to: input.priority } });
      }
      if (input.status && input.status !== current.status) {
        changes.status = input.status;
        const done = input.status === "resolved" || input.status === "closed";
        changes.resolvedAt = done ? (current.resolvedAt ?? new Date()) : null;
        events.push({
          action: "ticket.status_changed",
          metadata: { from: LABELS.ticketStatus[current.status], to: LABELS.ticketStatus[input.status] },
        });
      }
      if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
        changes.ownerId = input.ownerId;
        let ownerName: string | null = null;
        if (input.ownerId) {
          const [owner] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, input.ownerId));
          ownerName = owner?.name ?? null;
        }
        events.push({ action: "ticket.owner_changed", metadata: { to: ownerName } });
      }
      if ((changes.title || changes.description !== undefined) && events.length === 0) {
        events.push({ action: "ticket.edited", metadata: {} });
      }
      if (Object.keys(changes).length > 0) {
        await ctx.db.transaction(async (tx) => {
          await tx.update(tickets).set({ ...changes, updatedAt: new Date() }).where(eq(tickets.id, id));
          for (const event of events) {
            await audit(tx, {
              orgId: member.orgId,
              actorUserId: member.user.id,
              action: event.action,
              targetType: "ticket",
              targetId: id,
              metadata: event.metadata,
              ip: request.clientIp,
            });
          }
        });
        ctx.bus.publishOrg(member.orgId, { type: "ticket.updated", ticketId: id });
      }
      const [row] = await ticketSelect(ctx).where(eq(tickets.id, id));
      return toTicketDto(row!);
    });

    app.post("/tickets/:id/comments", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Ticket");
      const { body } = parse(ticketCommentSchema, request.body);
      const [ticket] = await ctx.db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.orgId, member.orgId)));
      if (!ticket) throw notFound("Ticket");
      const [comment] = await ctx.db
        .insert(ticketComments)
        .values({ orgId: member.orgId, ticketId: id, authorId: member.user.id, body })
        .returning();
      await ctx.db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, id));
      ctx.bus.publishOrg(member.orgId, { type: "ticket.updated", ticketId: id });
      return reply.status(201).send({
        id: comment!.id,
        body: comment!.body,
        author: { id: member.user.id, name: member.user.name },
        createdAt: comment!.createdAt.toISOString(),
      } satisfies TicketCommentDto);
    });

    app.delete("/tickets/:id", async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Ticket");
      const deleted = await ctx.db
        .delete(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.orgId, member.orgId)))
        .returning({ number: tickets.number });
      if (deleted.length === 0) throw notFound("Ticket");
      await audit(ctx.db, {
        orgId: member.orgId,
        actorUserId: member.user.id,
        action: "ticket.deleted",
        targetType: "ticket",
        targetId: id,
        metadata: { number: deleted[0]!.number },
        ip: request.clientIp,
      });
      ctx.bus.publishOrg(member.orgId, { type: "ticket.updated", ticketId: id });
      return reply.status(204).send();
    });
  };
}

