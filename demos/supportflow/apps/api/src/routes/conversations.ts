import { and, asc, count, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  conversationListQuerySchema,
  createMessageSchema,
  sendSuggestionSchema,
  updateConversationSchema,
  type ConversationDetailDto,
  type ConversationListItemDto,
  type Paginated,
  type SuggestionDto,
} from "@supportflow/shared";
import type { AppContext } from "../context";
import {
  aiSuggestions,
  conversationReads,
  conversations,
  customers,
  memberships,
  messages,
  organizations,
  tickets,
  users,
} from "../db/schema";
import { audit } from "../lib/audit";
import { AppError, badRequest, notFound, planLimit } from "../lib/errors";
import { idParam, parse } from "../lib/validate";
import { requireMember, type MemberContext } from "../plugins/auth";
import { postMessage, saveSuggestion, toMessageDto } from "../services/conversations";
import { getOrgPlan } from "../services/workspace";

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function unreadExpr() {
  return sql<boolean>`(${conversations.lastMessageAuthor} = 'customer' and (${conversationReads.lastReadAt} is null or ${conversationReads.lastReadAt} < ${conversations.lastMessageAt}))`;
}

function listSelect(ctx: AppContext, userId: string) {
  return ctx.db
    .select({
      c: conversations,
      customerName: customers.name,
      customerEmail: customers.email,
      assigneeName: users.name,
      unread: unreadExpr(),
    })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .leftJoin(users, eq(users.id, conversations.assigneeId))
    .leftJoin(
      conversationReads,
      and(eq(conversationReads.conversationId, conversations.id), eq(conversationReads.userId, userId)),
    );
}

type ListRow = Awaited<ReturnType<ReturnType<typeof listSelect>["execute"]>>[number];

function toListItem(row: ListRow): ConversationListItemDto {
  const c = row.c;
  return {
    id: c.id,
    status: c.status,
    subject: c.subject,
    customer: { id: c.customerId, name: row.customerName, email: row.customerEmail },
    assignee: c.assigneeId && row.assigneeName ? { id: c.assigneeId, name: row.assigneeName } : null,
    aiActive: c.aiActive,
    needsHuman: c.needsHuman,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessagePreview: c.lastMessagePreview,
    lastMessageAuthor: c.lastMessageAuthor,
    unread: Boolean(row.unread),
    createdAt: c.createdAt.toISOString(),
  };
}

export async function loadConversation(ctx: AppContext, orgId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.orgId, orgId)));
  if (!row) throw notFound("Conversation");
  return row;
}

function toSuggestionDto(s: typeof aiSuggestions.$inferSelect): SuggestionDto {
  return {
    id: s.id,
    conversationId: s.conversationId,
    body: s.body,
    confidence: s.confidence,
    sources: s.sources,
    status: s.status,
    reason: s.reason,
    createdAt: s.createdAt.toISOString(),
  };
}

async function markRead(ctx: AppContext, conversationId: string, userId: string) {
  await ctx.db
    .insert(conversationReads)
    .values({ conversationId, userId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [conversationReads.conversationId, conversationReads.userId],
      set: { lastReadAt: new Date() },
    });
}

/** An agent reply takes the conversation from the AI in auto mode and assigns it if unassigned. */
async function implicitTakeover(ctx: AppContext, member: MemberContext, conversation: typeof conversations.$inferSelect) {
  const [org] = await ctx.db
    .select({ aiMode: organizations.aiMode })
    .from(organizations)
    .where(eq(organizations.id, member.orgId));
  const changes: Partial<typeof conversations.$inferInsert> = { needsHuman: false };
  if (org?.aiMode === "auto") changes.aiActive = false;
  if (!conversation.assigneeId) changes.assigneeId = member.user.id;
  await ctx.db.update(conversations).set(changes).where(eq(conversations.id, conversation.id));
}

export function conversationRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    app.get("/conversations", async (request): Promise<Paginated<ConversationListItemDto>> => {
      const member = await requireMember(ctx, request);
      const query = parse(conversationListQuerySchema, request.query);
      const filters: (SQL | undefined)[] = [eq(conversations.orgId, member.orgId)];
      if (query.status !== "all") filters.push(eq(conversations.status, query.status));
      if (query.assignee === "me") filters.push(eq(conversations.assigneeId, member.user.id));
      if (query.assignee === "unassigned") filters.push(isNull(conversations.assigneeId));
      if (query.needsHuman) filters.push(eq(conversations.needsHuman, true));
      if (query.unread) filters.push(unreadExpr());
      if (query.q) {
        const like = `%${escapeLike(query.q)}%`;
        filters.push(
          or(
            sql`${customers.name} ilike ${like}`,
            sql`${customers.email} ilike ${like}`,
            sql`${conversations.subject} ilike ${like}`,
            sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.org_id = ${member.orgId} and to_tsvector('simple', m.body) @@ plainto_tsquery('simple', ${query.q}))`,
          ),
        );
      }
      if (query.cursor) {
        const [iso, id] = query.cursor.split("_");
        const at = iso ? new Date(iso) : null;
        if (at && id && !Number.isNaN(at.getTime())) {
          filters.push(
            sql`(${conversations.lastMessageAt}, ${conversations.id}) < (${at.toISOString()}::timestamptz, ${id}::uuid)`,
          );
        }
      }
      const rows = await listSelect(ctx, member.user.id)
        .where(and(...filters))
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(query.limit + 1);
      const items = rows.slice(0, query.limit).map(toListItem);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > query.limit && last ? `${last.lastMessageAt}_${last.id}` : null,
      };
    });

    app.get("/conversations/counts", async (request) => {
      const member = await requireMember(ctx, request);
      const [row] = await ctx.db
        .select({
          open: sql<number>`count(*) filter (where ${conversations.status} = 'open')::int`,
          pending: sql<number>`count(*) filter (where ${conversations.status} = 'pending')::int`,
          mine: sql<number>`count(*) filter (where ${conversations.status} <> 'resolved' and ${conversations.assigneeId} = ${member.user.id})::int`,
          unassigned: sql<number>`count(*) filter (where ${conversations.status} <> 'resolved' and ${conversations.assigneeId} is null)::int`,
          needsHuman: sql<number>`count(*) filter (where ${conversations.status} <> 'resolved' and ${conversations.needsHuman})::int`,
          unread: sql<number>`count(*) filter (where ${conversations.status} <> 'resolved' and ${unreadExpr()})::int`,
        })
        .from(conversations)
        .leftJoin(
          conversationReads,
          and(eq(conversationReads.conversationId, conversations.id), eq(conversationReads.userId, member.user.id)),
        )
        .where(eq(conversations.orgId, member.orgId));
      return row ?? { open: 0, pending: 0, mine: 0, unassigned: 0, needsHuman: 0, unread: 0 };
    });

    app.get("/conversations/:id", async (request): Promise<ConversationDetailDto> => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      const [row] = await listSelect(ctx, member.user.id).where(
        and(eq(conversations.id, id), eq(conversations.orgId, member.orgId)),
      );
      if (!row) throw notFound("Conversation");
      const messageRows = await ctx.db
        .select({ m: messages, authorName: users.name })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.authorUserId))
        .where(and(eq(messages.conversationId, id), eq(messages.orgId, member.orgId)))
        .orderBy(asc(messages.createdAt))
        .limit(1000);
      const suggestions = await ctx.db
        .select()
        .from(aiSuggestions)
        .where(
          and(eq(aiSuggestions.conversationId, id), eq(aiSuggestions.orgId, member.orgId), eq(aiSuggestions.status, "pending")),
        )
        .orderBy(desc(aiSuggestions.createdAt))
        .limit(1);
      const linked = await ctx.db
        .select({ id: tickets.id, number: tickets.number, title: tickets.title, status: tickets.status })
        .from(tickets)
        .where(and(eq(tickets.conversationId, id), eq(tickets.orgId, member.orgId)))
        .orderBy(desc(tickets.createdAt));
      const c = row.c;
      return {
        ...toListItem(row),
        summary: c.summary,
        summaryUpdatedAt: c.summaryUpdatedAt?.toISOString() ?? null,
        csatRating: c.csatRating,
        csatComment: c.csatComment,
        firstResponseAt: c.firstResponseAt?.toISOString() ?? null,
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
        messages: messageRows.map(({ m, authorName }) => toMessageDto(m, authorName)),
        suggestions: suggestions.map(toSuggestionDto),
        tickets: linked,
      };
    });

    app.post("/conversations/:id/read", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      await loadConversation(ctx, member.orgId, id);
      await markRead(ctx, id, member.user.id);
      return reply.status(204).send();
    });

    app.post("/conversations/:id/messages", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      const input = parse(createMessageSchema, request.body);
      const conversation = await loadConversation(ctx, member.orgId, id);
      if (!input.internal) await implicitTakeover(ctx, member, conversation);
      const message = await postMessage(ctx, {
        orgId: member.orgId,
        conversationId: id,
        authorType: "agent",
        authorUserId: member.user.id,
        body: input.body,
        internal: input.internal,
      });
      await markRead(ctx, id, member.user.id);
      return reply.status(201).send(message);
    });

    app.patch("/conversations/:id", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      const input = parse(updateConversationSchema, request.body);
      const conversation = await loadConversation(ctx, member.orgId, id);
      const changes: Partial<typeof conversations.$inferInsert> = {};
      if (input.assigneeId !== undefined) {
        if (input.assigneeId) {
          const [assignee] = await ctx.db
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.orgId, member.orgId), eq(memberships.userId, input.assigneeId)));
          if (!assignee) throw badRequest("The assignee must be a member of this workspace", { assigneeId: "Not a member" });
        }
        changes.assigneeId = input.assigneeId;
      }
      if (input.subject !== undefined) changes.subject = input.subject || null;
      if (input.status && input.status !== conversation.status) {
        changes.status = input.status;
        changes.resolvedAt = input.status === "resolved" ? new Date() : null;
        if (input.status === "resolved") changes.needsHuman = false;
      }
      if (Object.keys(changes).length > 0) {
        await ctx.db.update(conversations).set(changes).where(eq(conversations.id, id));
      }
      ctx.bus.publishOrg(member.orgId, { type: "conversation.updated", conversationId: id });
      if (changes.status) {
        ctx.bus.publishVisitor(id, {
          type: "status",
          status: changes.status,
          humanRequested: conversation.needsHuman && changes.status !== "resolved",
        });
      }
      return { ok: true };
    });

    app.post("/conversations/:id/takeover", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      await loadConversation(ctx, member.orgId, id);
      await ctx.db
        .update(conversations)
        .set({ aiActive: false, needsHuman: false, assigneeId: member.user.id, status: "open" })
        .where(eq(conversations.id, id));
      // Discard drafts so a stale AI suggestion isn't sent after the handover.
      await ctx.db
        .update(aiSuggestions)
        .set({ status: "discarded", decidedBy: member.user.id, decidedAt: new Date() })
        .where(and(eq(aiSuggestions.conversationId, id), eq(aiSuggestions.status, "pending")));
      const firstName = member.user.name.split(/\s+/)[0] ?? "A teammate";
      await postMessage(ctx, {
        orgId: member.orgId,
        conversationId: id,
        authorType: "system",
        body: `${firstName} from the support team joined the conversation.`,
      });
      ctx.bus.publishVisitor(id, { type: "status", status: "open", humanRequested: false });
      return { ok: true };
    });

    app.post("/conversations/:id/ai/resume", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      await loadConversation(ctx, member.orgId, id);
      await ctx.db.update(conversations).set({ aiActive: true, needsHuman: false }).where(eq(conversations.id, id));
      ctx.bus.publishOrg(member.orgId, { type: "conversation.updated", conversationId: id });
      return { ok: true };
    });

    app.post(
      "/conversations/:id/suggestions",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const member = await requireMember(ctx, request);
        const id = idParam(request.params, "id", "Conversation");
        await loadConversation(ctx, member.orgId, id);
        const [org] = await ctx.db
          .select({ aiMode: organizations.aiMode })
          .from(organizations)
          .where(eq(organizations.id, member.orgId));
        if (org?.aiMode === "off") throw badRequest("AI is turned off for this workspace. An admin can enable it in Settings.");
        const result = await ctx.ai.draftReply(member.orgId, id, "draft");
        if (result.status === "limit") throw planLimit(result.reason);
        if (result.status !== "ok") throw new AppError(503, "ai_unavailable", result.reason);
        const suggestion = await saveSuggestion(ctx, member.orgId, id, result, member.user.id);
        return reply.status(201).send(toSuggestionDto(suggestion!));
      },
    );

    app.post("/conversations/:id/suggestions/:suggestionId/send", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      const suggestionId = idParam(request.params, "suggestionId", "Suggestion");
      const input = parse(sendSuggestionSchema, request.body);
      const conversation = await loadConversation(ctx, member.orgId, id);
      const [suggestion] = await ctx.db
        .update(aiSuggestions)
        .set({ status: "sent", decidedBy: member.user.id, decidedAt: new Date() })
        .where(
          and(
            eq(aiSuggestions.id, suggestionId),
            eq(aiSuggestions.conversationId, id),
            eq(aiSuggestions.orgId, member.orgId),
            eq(aiSuggestions.status, "pending"),
          ),
        )
        .returning();
      if (!suggestion) throw notFound("Suggestion");
      const edited = input.body !== undefined && input.body.trim() !== suggestion.body.trim();
      if (!conversation.assigneeId) {
        await ctx.db.update(conversations).set({ assigneeId: member.user.id }).where(eq(conversations.id, id));
      }
      // An unedited draft goes out labelled as AI (approved by the agent); an edited one is the agent's message.
      const message = await postMessage(ctx, {
        orgId: member.orgId,
        conversationId: id,
        authorType: edited ? "agent" : "ai",
        authorUserId: member.user.id,
        body: edited ? input.body! : suggestion.body,
        aiConfidence: edited ? null : suggestion.confidence,
        aiSources: edited ? null : suggestion.sources,
      });
      await ctx.db.update(conversations).set({ needsHuman: false }).where(eq(conversations.id, id));
      ctx.bus.publishOrg(member.orgId, { type: "suggestion.updated", conversationId: id });
      return reply.status(201).send(message);
    });

    app.post("/conversations/:id/suggestions/:suggestionId/discard", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Conversation");
      const suggestionId = idParam(request.params, "suggestionId", "Suggestion");
      const [row] = await ctx.db
        .update(aiSuggestions)
        .set({ status: "discarded", decidedBy: member.user.id, decidedAt: new Date() })
        .where(
          and(
            eq(aiSuggestions.id, suggestionId),
            eq(aiSuggestions.conversationId, id),
            eq(aiSuggestions.orgId, member.orgId),
            eq(aiSuggestions.status, "pending"),
          ),
        )
        .returning();
      if (!row) throw notFound("Suggestion");
      ctx.bus.publishOrg(member.orgId, { type: "suggestion.updated", conversationId: id });
      return reply.status(204).send();
    });

    app.post(
      "/conversations/:id/summary",
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
      async (request) => {
        const member = await requireMember(ctx, request);
        const id = idParam(request.params, "id", "Conversation");
        await loadConversation(ctx, member.orgId, id);
        const plan = await getOrgPlan(ctx.db, member.orgId);
        if (!plan.features.summaries) {
          throw planLimit(`AI summaries are included from the Pro plan. You're on ${plan.name}.`);
        }
        const result = await ctx.ai.summarize(member.orgId, id);
        if (result.status === "limit") throw planLimit(result.reason);
        if (result.status !== "ok") throw new AppError(503, "ai_unavailable", result.reason);
        const now = new Date();
        await ctx.db
          .update(conversations)
          .set({ summary: result.summary, summaryUpdatedAt: now })
          .where(eq(conversations.id, id));
        ctx.bus.publishOrg(member.orgId, { type: "conversation.updated", conversationId: id });
        return { summary: result.summary, summaryUpdatedAt: now.toISOString() };
      },
    );

    // Customers ----------------------------------------------------------

    app.get("/customers", async (request) => {
      const member = await requireMember(ctx, request);
      const { q } = (request.query ?? {}) as { q?: string };
      const search = typeof q === "string" ? q.trim().slice(0, 200) : "";
      const like = `%${escapeLike(search)}%`;
      const rows = await ctx.db
        .select({
          c: customers,
          conversations: sql<number>`(select count(*)::int from ${conversations} v where v.customer_id = ${customers.id})`,
        })
        .from(customers)
        .where(
          and(
            eq(customers.orgId, member.orgId),
            search ? or(sql`${customers.name} ilike ${like}`, sql`${customers.email} ilike ${like}`) : undefined,
          ),
        )
        .orderBy(desc(customers.lastSeenAt))
        .limit(200);
      return rows.map(({ c, conversations: n }) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        createdAt: c.createdAt.toISOString(),
        lastSeenAt: c.lastSeenAt.toISOString(),
        conversationCount: n,
      }));
    });

    app.delete("/customers/:id", async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Customer");
      const [counts] = await ctx.db
        .select({ n: count() })
        .from(conversations)
        .where(and(eq(conversations.customerId, id), eq(conversations.orgId, member.orgId)));
      const deleted = await ctx.db
        .delete(customers)
        .where(and(eq(customers.id, id), eq(customers.orgId, member.orgId)))
        .returning({ id: customers.id });
      if (deleted.length === 0) throw notFound("Customer");
      // No personal data is copied into the audit log.
      await audit(ctx.db, {
        orgId: member.orgId,
        actorUserId: member.user.id,
        action: "customer.deleted",
        targetType: "customer",
        targetId: id,
        metadata: { conversationsDeleted: counts?.n ?? 0 },
        ip: request.clientIp,
      });
      return reply.status(204).send();
    });

    app.get("/customers/:id/conversations", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Customer");
      const rows = await listSelect(ctx, member.user.id)
        .where(and(eq(conversations.customerId, id), eq(conversations.orgId, member.orgId)))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(100);
      return rows.map(toListItem);
    });
  };
}

