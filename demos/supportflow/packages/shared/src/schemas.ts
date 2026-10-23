import { z } from "zod";
import {
  AI_MODES,
  ARTICLE_STATUSES,
  CONVERSATION_STATUSES,
  ROLES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "./enums";
import { PLAN_IDS } from "./plans";

/** Trimmed string with a required minimum length after trimming. */
const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

export const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email({ error: "Enter a valid email address" }));

export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password must be at most 200 characters");

export const uuidSchema = z.uuid({ error: "Invalid identifier" });

// ---------- Auth ----------

export const registerSchema = z.object({
  name: text(1, 80, "Your name"),
  email: emailSchema,
  password: passwordSchema,
  organizationName: text(2, 80, "Workspace name"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({ name: text(1, 80, "Name") });

export const switchOrgSchema = z.object({ organizationId: uuidSchema });

// ---------- Workspace ----------

export const createOrgSchema = z.object({ name: text(2, 80, "Workspace name") });

export const updateOrgSchema = z.object({
  name: text(2, 80, "Workspace name").optional(),
  aiMode: z.enum(AI_MODES).optional(),
  aiConfidenceThreshold: z.number().int().min(0).max(100).optional(),
  aiInstructions: z.string().trim().max(1000, "Keep instructions under 1,000 characters").optional(),
  retentionDays: z
    .number()
    .int()
    .min(7, "Keep conversations for at least 7 days")
    .max(3650)
    .nullable()
    .optional(),
  collectCsat: z.boolean().optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const deleteOrgSchema = z.object({ confirmName: z.string().trim().min(1) });

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "agent"]),
});

export const updateMemberSchema = z.object({ role: z.enum(ROLES) });

export const acceptInviteSchema = z.object({ token: z.string().min(20).max(200) });

export const registerWithInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: text(1, 80, "Your name"),
  password: passwordSchema,
});

// ---------- Conversations ----------

export const conversationListQuerySchema = z.object({
  status: z.enum([...CONVERSATION_STATUSES, "all"]).default("open"),
  assignee: z.enum(["me", "unassigned", "any"]).default("any"),
  q: z.string().trim().max(200).optional(),
  unread: z.coerce.boolean().optional(),
  needsHuman: z.coerce.boolean().optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createMessageSchema = z.object({
  body: text(1, 5000, "Message"),
  internal: z.boolean().default(false),
});

export const updateConversationSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES).optional(),
  assigneeId: uuidSchema.nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
});

export const sendSuggestionSchema = z.object({
  /** Agents may edit the AI draft before sending. */
  body: text(1, 5000, "Reply").optional(),
});

// ---------- Tickets ----------

export const createTicketSchema = z.object({
  title: text(3, 200, "Title"),
  description: z.string().trim().max(10000).default(""),
  priority: z.enum(TICKET_PRIORITIES).default("normal"),
  ownerId: uuidSchema.nullable().optional(),
  conversationId: uuidSchema.nullable().optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: text(3, 200, "Title").optional(),
  description: z.string().trim().max(10000).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  ownerId: uuidSchema.nullable().optional(),
});

export const ticketListQuerySchema = z.object({
  status: z.enum([...TICKET_STATUSES, "active", "all"]).default("active"),
  priority: z.enum([...TICKET_PRIORITIES, "all"]).default("all"),
  owner: z.enum(["me", "unassigned", "any"]).default("any"),
  q: z.string().trim().max(200).optional(),
});

export const ticketCommentSchema = z.object({ body: text(1, 5000, "Comment") });

// ---------- Knowledge base ----------

export const articleSchema = z.object({
  title: text(3, 200, "Title"),
  body: text(1, 50000, "Article body"),
  categoryId: uuidSchema.nullable().optional(),
});
export type ArticleInput = z.infer<typeof articleSchema>;

export const updateArticleSchema = articleSchema.partial();

export const articleStatusSchema = z.object({ status: z.enum(ARTICLE_STATUSES) });

export const articleListQuerySchema = z.object({
  status: z.enum([...ARTICLE_STATUSES, "all"]).default("all"),
  categoryId: uuidSchema.optional(),
  q: z.string().trim().max(200).optional(),
});

export const categorySchema = z.object({ name: text(2, 60, "Category name") });

/** Import of approved documentation: Markdown or plain text, split on top-level headings. */
export const importArticlesSchema = z.object({
  filename: z.string().trim().max(200).default("import.md"),
  content: z
    .string()
    .min(1, "The file is empty")
    .max(500_000, "Imports are limited to 500 KB of text"),
  categoryId: uuidSchema.nullable().optional(),
  publish: z.boolean().default(false),
});

// ---------- Widget ----------

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour such as #165C4F");

export const originSchema = z
  .string()
  .trim()
  .max(200)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin === value.replace(/\/$/, "") &&
        url.pathname === "/"
      );
    } catch {
      return false;
    }
  }, "Enter an origin such as https://shop.example.com (no path)")
  .transform((value) => new URL(value).origin);

export const widgetConfigSchema = z.object({
  enabled: z.boolean().optional(),
  brandColor: hexColor.optional(),
  title: text(1, 60, "Title").optional(),
  greeting: text(1, 300, "Greeting").optional(),
  launcherLabel: text(1, 30, "Launcher label").optional(),
  position: z.enum(["right", "left"]).optional(),
  allowedOrigins: z.array(originSchema).max(20, "Up to 20 origins").optional(),
  requireEmail: z.boolean().optional(),
});
export type WidgetConfigInput = z.infer<typeof widgetConfigSchema>;

/** Public widget endpoints. */
export const widgetStartSchema = z.object({
  visitorToken: z.string().min(20).max(200).optional(),
});

export const widgetMessageSchema = z.object({
  body: text(1, 2000, "Message"),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(0).optional().or(z.literal("")),
  name: z.string().trim().max(80).optional(),
  email: emailSchema.optional().or(z.literal("")),
});

export const widgetCsatSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

// ---------- Billing ----------

export const checkoutSchema = z.object({ plan: z.enum(PLAN_IDS).exclude(["free"]) });

// ---------- Contact ----------

export const contactSchema = z.object({
  name: text(1, 80, "Name"),
  email: emailSchema,
  company: z.string().trim().max(120).optional().default(""),
  message: text(10, 4000, "Message"),
  website: z.string().max(0).optional().or(z.literal("")),
});
export type ContactInput = z.infer<typeof contactSchema>;

// ---------- Analytics ----------

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), "Choose 7, 30 or 90 days").default(30),
});
