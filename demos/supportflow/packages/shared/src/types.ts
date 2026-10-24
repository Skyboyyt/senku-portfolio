import type {
  AiMode,
  ArticleStatus,
  ConversationStatus,
  MessageAuthor,
  Role,
  SuggestionStatus,
  TicketPriority,
  TicketStatus,
} from "./enums";
import type { PlanId } from "./plans";

/** Shape of every API error body. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level validation messages, keyed by dotted path. */
    fields?: Record<string, string>;
  };
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
}

export interface OrgSummaryDto {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface OrgDto {
  id: string;
  name: string;
  slug: string;
  aiMode: AiMode;
  aiConfidenceThreshold: number;
  aiInstructions: string;
  retentionDays: number | null;
  collectCsat: boolean;
  createdAt: string;
}

export interface SessionDto {
  user: UserDto;
  organization: OrgDto | null;
  role: Role | null;
  organizations: OrgSummaryDto[];
  plan: PlanId;
  ai: { provider: string; model: string | null; available: boolean };
}

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  openConversations: number;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: Role;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface CustomerDto {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  lastSeenAt: string;
  conversationCount?: number;
}

export interface ConversationListItemDto {
  id: string;
  status: ConversationStatus;
  subject: string | null;
  customer: { id: string; name: string | null; email: string | null };
  assignee: { id: string; name: string } | null;
  aiActive: boolean;
  needsHuman: boolean;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageAuthor: MessageAuthor | null;
  unread: boolean;
  createdAt: string;
}

export interface MessageSourceDto {
  articleId: string;
  title: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  authorType: MessageAuthor;
  author: { id: string; name: string } | null;
  body: string;
  internal: boolean;
  aiConfidence: number | null;
  aiSources: MessageSourceDto[] | null;
  createdAt: string;
}

export interface SuggestionDto {
  id: string;
  conversationId: string;
  body: string;
  confidence: number;
  sources: MessageSourceDto[];
  status: SuggestionStatus;
  reason: string | null;
  createdAt: string;
}

export interface ConversationDetailDto extends ConversationListItemDto {
  summary: string | null;
  summaryUpdatedAt: string | null;
  csatRating: number | null;
  csatComment: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  messages: MessageDto[];
  suggestions: SuggestionDto[];
  tickets: { id: string; number: number; title: string; status: TicketStatus }[];
}

export interface TicketDto {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  owner: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  conversationId: string | null;
  customer: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface TicketCommentDto {
  id: string;
  body: string;
  author: { id: string; name: string } | null;
  createdAt: string;
}

export interface TicketEventDto {
  id: string;
  action: string;
  actor: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  articleCount: number;
}

export interface ArticleDto {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: ArticleStatus;
  category: { id: string; name: string } | null;
  source: "manual" | "import";
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  indexedAt: string | null;
  chunkCount: number;
}

export interface WidgetConfigDto {
  publicKey: string;
  enabled: boolean;
  brandColor: string;
  title: string;
  greeting: string;
  launcherLabel: string;
  position: "right" | "left";
  allowedOrigins: string[];
  requireEmail: boolean;
  showBranding: boolean;
}

export interface OverviewDto {
  range: { from: string; to: string; days: number };
  totals: {
    conversations: number;
    openConversations: number;
    aiAssistedConversations: number;
    openTickets: number;
    resolvedTickets: number;
    medianFirstResponseSeconds: number | null;
    medianResolutionSeconds: number | null;
  };
  workload: { userId: string; name: string; openConversations: number; openTickets: number }[];
  usage: { aiResponses: number; aiLimit: number; seats: number; seatLimit: number };
}

export interface AnalyticsDto {
  range: { from: string; to: string; days: number };
  daily: {
    date: string;
    conversations: number;
    aiResolved: number;
    escalated: number;
    ticketsOpened: number;
    ticketsResolved: number;
    medianFirstResponseSeconds: number | null;
  }[];
  ai: {
    responses: number;
    escalations: number;
    errors: number;
    limited: number;
    inputTokens: number;
    outputTokens: number;
  };
  escalationRate: number | null;
  csat: { responses: number; average: number | null; distribution: number[] } | null;
}

export interface SubscriptionDto {
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled";
  provider: "none" | "stripe" | "test";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingMode: "stripe" | "test" | "disabled";
  usage: { aiResponses: number; seats: number; articles: number };
}

export interface AuditLogDto {
  id: string;
  action: string;
  actor: { id: string; name: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Realtime events pushed to dashboard sockets. */
export type RealtimeEvent =
  | { type: "conversation.updated"; conversationId: string }
  | { type: "message.created"; conversationId: string; message: MessageDto }
  | { type: "suggestion.updated"; conversationId: string }
  | { type: "ticket.updated"; ticketId: string };

/** Events pushed to the widget socket. */
export type WidgetEvent =
  | { type: "message"; message: WidgetMessageDto }
  | { type: "status"; status: ConversationStatus; humanRequested: boolean }
  | { type: "typing"; author: "agent" | "ai"; active: boolean };

export interface WidgetMessageDto {
  id: string;
  authorType: Exclude<MessageAuthor, "system"> | "system";
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface WidgetBootstrapDto {
  config: {
    title: string;
    greeting: string;
    brandColor: string;
    launcherLabel: string;
    position: "right" | "left";
    requireEmail: boolean;
    showBranding: boolean;
    aiEnabled: boolean;
    collectCsat: boolean;
  };
}

export interface WidgetSessionDto {
  visitorToken: string;
  conversation: {
    id: string;
    status: ConversationStatus;
    humanRequested: boolean;
    csatRating: number | null;
  } | null;
  messages: WidgetMessageDto[];
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
