import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------- Enums ----------

export const roleEnum = pgEnum("member_role", ["owner", "admin", "agent"]);
export const planEnum = pgEnum("plan_id", ["free", "starter", "pro", "business"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
]);
export const billingProviderEnum = pgEnum("billing_provider", ["none", "stripe", "test"]);
export const aiModeEnum = pgEnum("ai_mode", ["off", "suggest", "approval", "auto"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "pending", "resolved"]);
export const messageAuthorEnum = pgEnum("message_author", ["customer", "agent", "ai", "system"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "sent", "discarded"]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const articleStatusEnum = pgEnum("article_status", ["draft", "published", "archived"]);
export const articleSourceEnum = pgEnum("article_source", ["manual", "import"]);
export const aiUsageKindEnum = pgEnum("ai_usage_kind", ["auto_reply", "draft", "summary"]);
export const aiUsageOutcomeEnum = pgEnum("ai_usage_outcome", ["ok", "escalated", "error", "limit"]);

// ---------- Identity ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrgId: uuid("active_org_id").references(() => organizations.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------- Tenancy ----------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** The public demo workspace. It has no members and its data is purged daily. */
  isDemo: boolean("is_demo").notNull().default(false),
  aiMode: aiModeEnum("ai_mode").notNull().default("suggest"),
  /** 0–100. Auto replies below this confidence are handed to a person instead. */
  aiConfidenceThreshold: integer("ai_confidence_threshold").notNull().default(70),
  /** Extra tone/brand guidance written by an admin. Never overrides safety rules. */
  aiInstructions: text("ai_instructions").notNull().default(""),
  /** Delete resolved conversations older than this many days. Null keeps them. */
  retentionDays: integer("retention_days"),
  collectCsat: boolean("collect_csat").notNull().default(true),
  ticketSeq: integer("ticket_seq").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_unique").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

export const subscriptions = pgTable("subscriptions", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  plan: planEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  provider: billingProviderEnum("provider").notNull().default("none"),
  providerCustomerId: text("provider_customer_id").unique(),
  providerSubscriptionId: text("provider_subscription_id").unique(),
  currentPeriodEnd: ts("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Processed billing webhook events, for idempotency. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

// ---------- Customers & conversations ----------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    /** SHA-256 of the widget visitor token that identifies this browser. */
    visitorTokenHash: text("visitor_token_hash"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_org_visitor_unique").on(t.orgId, t.visitorTokenHash),
    index("customers_org_email_idx").on(t.orgId, t.email),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    status: conversationStatusEnum("status").notNull().default("open"),
    subject: text("subject"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** True while the AI may answer. Cleared permanently when a person takes over. */
    aiActive: boolean("ai_active").notNull().default(true),
    /** Set when the AI escalated or the customer asked for a person. */
    needsHuman: boolean("needs_human").notNull().default(false),
    /** True when the AI sent at least one reply or draft in this conversation. */
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    lastMessageAuthor: messageAuthorEnum("last_message_author"),
    firstResponseAt: ts("first_response_at"),
    resolvedAt: ts("resolved_at"),
    summary: text("summary"),
    summaryUpdatedAt: ts("summary_updated_at"),
    csatRating: smallint("csat_rating"),
    csatComment: text("csat_comment"),
    createdAt: createdAt(),
  },
  (t) => [
    index("conversations_org_status_last_idx").on(t.orgId, t.status, t.lastMessageAt),
    index("conversations_org_assignee_idx").on(t.orgId, t.assigneeId),
    index("conversations_org_created_idx").on(t.orgId, t.createdAt),
    index("conversations_customer_idx").on(t.customerId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorType: messageAuthorEnum("author_type").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Internal notes are visible to the team only, never to the customer. */
    internal: boolean("internal").notNull().default(false),
    aiConfidence: smallint("ai_confidence"),
    aiSources: jsonb("ai_sources").$type<{ articleId: string; title: string }[]>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_org_created_idx").on(t.orgId, t.createdAt),
    index("messages_body_search_idx").using("gin", sql`to_tsvector('simple', ${t.body})`),
  ],
);

export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    confidence: smallint("confidence").notNull(),
    sources: jsonb("sources").$type<{ articleId: string; title: string }[]>().notNull().default([]),
    /** Why the AI wanted a person to check this, if it did. */
    reason: text("reason"),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_suggestions_conversation_idx").on(t.conversationId, t.status)],
);

// ---------- Tickets ----------

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("normal"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    uniqueIndex("tickets_org_number_unique").on(t.orgId, t.number),
    index("tickets_org_status_idx").on(t.orgId, t.status, t.updatedAt),
    index("tickets_org_owner_idx").on(t.orgId, t.ownerId),
    index("tickets_conversation_idx").on(t.conversationId),
  ],
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_comments_ticket_idx").on(t.ticketId, t.createdAt)],
);

// ---------- Knowledge base ----------

export const kbCategories = pgTable(
  "kb_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("kb_categories_org_slug_unique").on(t.orgId, t.slug)],
);

export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => kbCategories.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    body: text("body").notNull(),
    status: articleStatusEnum("status").notNull().default("draft"),
    source: articleSourceEnum("source").notNull().default("manual"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    publishedAt: ts("published_at"),
    /** When the published text was last chunked for retrieval. */
    indexedAt: ts("indexed_at"),
  },
  (t) => [
    uniqueIndex("kb_articles_org_slug_unique").on(t.orgId, t.slug),
    index("kb_articles_org_status_idx").on(t.orgId, t.status),
  ],
);

/** Retrieval chunks. Only published articles have chunks, so drafts never reach the AI. */
export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => kbArticles.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading").notNull().default(""),
    content: text("content").notNull(),
    tsv: tsvector("tsv")
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', content), 'B')`,
      ),
  },
  (t) => [
    index("kb_chunks_org_idx").on(t.orgId),
    index("kb_chunks_article_idx").on(t.articleId),
    index("kb_chunks_tsv_idx").using("gin", t.tsv),
  ],
);

// ---------- AI usage ----------

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    kind: aiUsageKindEnum("kind").notNull(),
    outcome: aiUsageOutcomeEnum("outcome").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_org_created_idx").on(t.orgId, t.createdAt)],
);

// ---------- Widget ----------

export const widgetConfigs = pgTable("widget_configs", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Public identifier embedded in customer websites. Grants widget access only. */
  publicKey: text("public_key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  brandColor: text("brand_color").notNull().default("#165C4F"),
  title: text("title").notNull().default("Support"),
  greeting: text("greeting").notNull().default("Hi! Ask us anything and we'll get back to you here."),
  launcherLabel: text("launcher_label").notNull().default("Chat with us"),
  position: text("position").$type<"right" | "left">().notNull().default("right"),
  allowedOrigins: text("allowed_origins").array().notNull().default(sql`ARRAY[]::text[]`),
  requireEmail: boolean("require_email").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- Audit & contact ----------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_logs_target_idx").on(t.orgId, t.targetType, t.targetId),
  ],
);

export const contactRequests = pgTable("contact_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull().default(""),
  message: text("message").notNull(),
  ip: text("ip"),
  createdAt: createdAt(),
});
