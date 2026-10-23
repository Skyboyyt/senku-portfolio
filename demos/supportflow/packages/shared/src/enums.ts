export const ROLES = ["owner", "admin", "agent"] as const;
export type Role = (typeof ROLES)[number];

/** Higher number = more privileges. */
export const ROLE_RANK: Record<Role, number> = { agent: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const CONVERSATION_STATUSES = ["open", "pending", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_AUTHORS = ["customer", "agent", "ai", "system"] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/**
 * off       – AI is not used.
 * suggest   – agents can request a draft reply on demand.
 * approval  – AI drafts a reply for every new customer message; an agent must approve it.
 * auto      – AI replies on its own when confident, otherwise hands over to a person.
 */
export const AI_MODES = ["off", "suggest", "approval", "auto"] as const;
export type AiMode = (typeof AI_MODES)[number];

export const SUGGESTION_STATUSES = ["pending", "sent", "discarded"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const AI_USAGE_KINDS = ["auto_reply", "draft", "summary"] as const;
export type AiUsageKind = (typeof AI_USAGE_KINDS)[number];

export const AI_USAGE_OUTCOMES = ["ok", "escalated", "error", "limit"] as const;
export type AiUsageOutcome = (typeof AI_USAGE_OUTCOMES)[number];

export const LABELS = {
  conversationStatus: { open: "Open", pending: "Pending", resolved: "Resolved" },
  ticketStatus: {
    open: "Open",
    in_progress: "In progress",
    waiting: "Waiting on customer",
    resolved: "Resolved",
    closed: "Closed",
  },
  ticketPriority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
  articleStatus: { draft: "Draft", published: "Published", archived: "Archived" },
  role: { owner: "Owner", admin: "Admin", agent: "Agent" },
  aiMode: {
    off: "Off",
    suggest: "Suggestions on request",
    approval: "Draft every reply for approval",
    auto: "Reply automatically when confident",
  },
} as const;
