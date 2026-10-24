import { randomBytes } from "node:crypto";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const list = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

    /** Origins of the dashboard web app (comma-separated). Used for CSRF and CORS. */
    WEB_ORIGIN: list.pipe(z.array(z.url()).min(1, "WEB_ORIGIN is required")),
    /** Public base URL of this API, used in widget install snippets. */
    API_PUBLIC_URL: z.url().default("http://localhost:4000"),

    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    COOKIE_SECURE: bool.optional(),
    /** Shared secret proving a request came through the web app's /api proxy. */
    PROXY_SHARED_SECRET: z.string().min(32).optional(),
    /** Number of reverse proxies in front of the API (for the client IP). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

    AI_PROVIDER: z.enum(["anthropic", "openai", "extractive", "none"]).optional(),
    AI_MODEL: z.string().optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(25000),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    BILLING_MODE: z.enum(["stripe", "test", "disabled"]).default("disabled"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_PRICE_BUSINESS: z.string().optional(),

    CONTACT_WEBHOOK_URL: z.url().optional(),
    DEMO_ORG_SLUG: z.string().default("demo"),
    /** How long demo conversations are kept before the hourly purge. */
    DEMO_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    JOBS_ENABLED: bool.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (env.BILLING_MODE === "test") {
        ctx.addIssue({
          code: "custom",
          path: ["BILLING_MODE"],
          message: "Test billing changes plans without payment and is not allowed in production",
        });
      }
      if (!env.PROXY_SHARED_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["PROXY_SHARED_SECRET"],
          message: "PROXY_SHARED_SECRET is required in production",
        });
      }
    }
    if (env.BILLING_MODE === "stripe") {
      for (const key of [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_STARTER",
        "STRIPE_PRICE_PRO",
        "STRIPE_PRICE_BUSINESS",
      ] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when BILLING_MODE=stripe` });
      }
    }
    if (env.AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "ANTHROPIC_API_KEY is required for AI_PROVIDER=anthropic" });
    }
    if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "OPENAI_API_KEY is required for AI_PROVIDER=openai" });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface Config extends Env {
  isProduction: boolean;
  cookieSecure: boolean;
  aiProvider: "anthropic" | "openai" | "extractive" | "none";
  /** Signs dashboard WebSocket tickets. Shared across instances when PROXY_SHARED_SECRET is set. */
  realtimeSecret: string;
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  // Blank values (KEY= in a .env file) mean "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const env = parsed.data;
  const aiProvider =
    env.AI_PROVIDER ??
    (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : "extractive");
  return {
    ...env,
    isProduction: env.NODE_ENV === "production",
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    aiProvider,
    realtimeSecret: env.PROXY_SHARED_SECRET ?? randomBytes(32).toString("base64url"),
  };
}
