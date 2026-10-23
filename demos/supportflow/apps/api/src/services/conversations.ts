import { and, eq, sql } from "drizzle-orm";
import {
  getPlan,
  preview,
  type MessageAuthor,
  type MessageDto,
  type WidgetMessageDto,
} from "@supportflow/shared";
import type { AppContext } from "../context";
import type { DbOrTx } from "../db/client";
import {
  aiSuggestions,
  conversations,
  messages,
  organizations,
  subscriptions,
  users,
} from "../db/schema";

type MessageRow = typeof messages.$inferSelect;

export function toMessageDto(row: MessageRow, authorName: string | null): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorType: row.authorType,
    author: row.authorUserId && authorName ? { id: row.authorUserId, name: authorName } : null,
    body: row.body,
    internal: row.internal,
    aiConfidence: row.aiConfidence,
    aiSources: row.aiSources ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** What a website visitor may see of a message. Agents are shown by first name only. */
export function toWidgetMessage(row: MessageRow, authorName: string | null): WidgetMessageDto {
  return {
    id: row.id,
    authorType: row.authorType,
    authorName:
      row.authorType === "agent"
        ? (authorName?.split(/\s+/)[0] ?? "Support")
        : row.authorType === "ai"
          ? "AI assistant"
          : null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface NewMessage {
  orgId: string;
  conversationId: string;
  authorType: MessageAuthor;
  authorUserId?: string | null;
  body: string;
  internal?: boolean;
  aiConfidence?: number | null;
  aiSources?: { articleId: string; title: string }[] | null;
}

/**
 * Inserts a message, updates the conversation's denormalized fields and notifies the
 * dashboard (and the visitor, unless it is an internal note).
 */
export async function postMessage(ctx: AppContext, input: NewMessage, db: DbOrTx = ctx.db): Promise<MessageDto> {
  const internal = input.internal ?? false;
  const [row] = await db
    .insert(messages)
    .values({
      orgId: input.orgId,
      conversationId: input.conversationId,
      authorType: input.authorType,
      authorUserId: input.authorUserId ?? null,
      body: input.body,
      internal,
      aiConfidence: input.aiConfidence ?? null,
      aiSources: input.aiSources ?? null,
    })
    .returning();
  if (!row) throw new Error("Message insert failed");

  if (!internal) {
    const isResponse = input.authorType === "agent" || input.authorType === "ai";
    await db
      .update(conversations)
      .set({
        lastMessageAt: row.createdAt,
        lastMessagePreview: preview(input.body),
        lastMessageAuthor: input.authorType,
        ...(isResponse
          ? { firstResponseAt: sql`coalesce(${conversations.firstResponseAt}, ${row.createdAt.toISOString()}::timestamptz)` }
          : {}),
        ...(input.authorType === "ai" ? { aiAssisted: true } : {}),
        // A customer writing into a resolved conversation reopens it.
        ...(input.authorType === "customer"
          ? {
              status: sql`case when ${conversations.status} = 'resolved' then 'open'::conversation_status else ${conversations.status} end`,
              resolvedAt: sql`case when ${conversations.status} = 'resolved' then null else ${conversations.resolvedAt} end`,
            }
          : {}),
      })
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)));
  }

  let authorName: string | null = null;
  if (row.authorUserId) {
    const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.authorUserId));
    authorName = author?.name ?? null;
  }
  const dto = toMessageDto(row, authorName);
  ctx.bus.publishOrg(input.orgId, { type: "message.created", conversationId: input.conversationId, message: dto });
  ctx.bus.publishOrg(input.orgId, { type: "conversation.updated", conversationId: input.conversationId });
  if (!internal) {
    ctx.bus.publishVisitor(input.conversationId, { type: "message", message: toWidgetMessage(row, authorName) });
  }
  return dto;
}

/** Moves a conversation to the human queue and stops automatic AI replies. */
export async function escalate(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  customerNotice: string | null,
): Promise<void> {
  await ctx.db
    .update(conversations)
    .set({ needsHuman: true, aiActive: false, status: "open" })
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
  if (customerNotice) {
    await postMessage(ctx, { orgId, conversationId, authorType: "system", body: customerNotice });
  } else {
    ctx.bus.publishOrg(orgId, { type: "conversation.updated", conversationId });
  }
  ctx.bus.publishVisitor(conversationId, { type: "status", status: "open", humanRequested: true });
}

export const HANDOFF_NOTICE = "I've passed this to our support team. A person will reply here as soon as they can.";

/**
 * Runs the workspace's AI mode for a new customer message. Called in the background so
 * the visitor's request returns immediately.
 */
export async function runAutomation(ctx: AppContext, orgId: string, conversationId: string): Promise<void> {
  const [row] = await ctx.db
    .select({
      aiMode: organizations.aiMode,
      threshold: organizations.aiConfidenceThreshold,
      aiActive: conversations.aiActive,
      plan: subscriptions.plan,
    })
    .from(conversations)
    .innerJoin(organizations, eq(organizations.id, conversations.orgId))
    .leftJoin(subscriptions, eq(subscriptions.orgId, conversations.orgId))
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)));
  if (!row || row.aiMode === "off" || row.aiMode === "suggest" || !row.aiActive) return;

  const plan = getPlan(row.plan);
  // Auto replies are a paid feature; on other plans the workspace falls back to approval mode.
  const auto = row.aiMode === "auto" && plan.features.autoReply;

  ctx.bus.publishVisitor(conversationId, { type: "typing", author: "ai", active: auto });
  const result = await ctx.ai.draftReply(orgId, conversationId, auto ? "auto_reply" : "draft");
  ctx.bus.publishVisitor(conversationId, { type: "typing", author: "ai", active: false });

  if (result.status !== "ok") {
    // Provider down, limit reached or disabled: never leave the customer waiting on the AI.
    if (auto) await escalate(ctx, orgId, conversationId, HANDOFF_NOTICE);
    return;
  }

  // Re-check: an agent may have taken over while the model was thinking.
  const [current] = await ctx.db
    .select({ aiActive: conversations.aiActive })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (!current?.aiActive) {
    await saveSuggestion(ctx, orgId, conversationId, result);
    return;
  }

  if (auto && !result.needsHuman && result.confidence >= row.threshold) {
    await postMessage(ctx, {
      orgId,
      conversationId,
      authorType: "ai",
      body: result.reply,
      aiConfidence: result.confidence,
      aiSources: result.sources,
    });
    return;
  }

  await saveSuggestion(ctx, orgId, conversationId, result);
  if (auto) {
    await ctx.db.update(conversations).set({ aiAssisted: true }).where(eq(conversations.id, conversationId));
    await escalate(ctx, orgId, conversationId, HANDOFF_NOTICE);
  }
}

export async function saveSuggestion(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  result: { reply: string; confidence: number; sources: { articleId: string; title: string }[]; reason: string | null },
  requestedBy: string | null = null,
) {
  // Only the newest draft stays pending.
  await ctx.db
    .update(aiSuggestions)
    .set({ status: "discarded", decidedAt: new Date() })
    .where(and(eq(aiSuggestions.conversationId, conversationId), eq(aiSuggestions.status, "pending")));
  const [suggestion] = await ctx.db
    .insert(aiSuggestions)
    .values({
      orgId,
      conversationId,
      body: result.reply,
      confidence: result.confidence,
      sources: result.sources,
      reason: result.reason,
      requestedBy,
    })
    .returning();
  await ctx.db.update(conversations).set({ aiAssisted: true }).where(eq(conversations.id, conversationId));
  ctx.bus.publishOrg(orgId, { type: "suggestion.updated", conversationId });
  return suggestion;
}
