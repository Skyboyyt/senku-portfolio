/**
 * Subscription plans. Limits are enforced by the API; the web app only reads
 * them for display. `null` means the plan has no limit for that resource.
 */
export const PLAN_IDS = ["free", "starter", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  /** Workspace members, including the owner. */
  seats: number;
  /** AI replies, drafts and summaries per calendar month (UTC). */
  aiResponsesPerMonth: number;
  /** Knowledge-base articles in any state except archived. */
  articles: number | null;
}

export interface PlanFeatures {
  /** AI may send replies to customers without an agent approving them. */
  autoReply: boolean;
  /** AI conversation summaries in the inbox. */
  summaries: boolean;
  /** Hide the "Powered by SupportFlow" line in the widget. */
  removeBranding: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in US cents. */
  priceCents: number;
  description: string;
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    description: "For trying SupportFlow on a small site.",
    limits: { seats: 2, aiResponsesPerMonth: 100, articles: 25 },
    features: { autoReply: false, summaries: false, removeBranding: false },
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceCents: 2900,
    description: "For small teams answering customers every day.",
    limits: { seats: 5, aiResponsesPerMonth: 1000, articles: 200 },
    features: { autoReply: true, summaries: false, removeBranding: false },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 7900,
    description: "For growing support teams that rely on AI drafts.",
    limits: { seats: 15, aiResponsesPerMonth: 5000, articles: 1000 },
    features: { autoReply: true, summaries: true, removeBranding: true },
  },
  business: {
    id: "business",
    name: "Business",
    priceCents: 19900,
    description: "For larger teams with higher volume.",
    limits: { seats: 50, aiResponsesPerMonth: 20000, articles: null },
    features: { autoReply: true, summaries: true, removeBranding: true },
  },
};

export function getPlan(id: string | null | undefined): Plan {
  if (id && (PLAN_IDS as readonly string[]).includes(id)) return PLANS[id as PlanId];
  return PLANS.free;
}

export function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
