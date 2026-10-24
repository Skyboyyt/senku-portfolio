import type { FastifyInstance, InjectOptions } from "fastify";
import { sql } from "drizzle-orm";
import { buildApp } from "../src/app";
import type { CompletionRequest, CompletionResult, LlmProvider } from "../src/ai/types";
import { loadConfig, type Config } from "../src/config";
import { createDb, type DbHandle } from "../src/db/client";
import { TEST_DATABASE_URL } from "./global-setup";

export const WEB_ORIGIN = "http://localhost:3000";
export const CUSTOMER_SITE = "https://shop.example.com";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    WEB_ORIGIN,
    API_PUBLIC_URL: "http://localhost:4000",
    AI_PROVIDER: "extractive",
    BILLING_MODE: "test",
    JOBS_ENABLED: "false",
    ...overrides,
  });
}

/** Scriptable stand-in for an LLM provider. Records every request it receives. */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock-model";
  readonly generative = true;
  readonly requests: CompletionRequest[] = [];
  handler: (request: CompletionRequest) => Promise<CompletionResult> | CompletionResult = () =>
    this.reply({ reply: "Mock reply", confidence: 0.9, needs_human: false, reason: "", source_ids: [1] });

  reply(body: Record<string, unknown>): CompletionResult {
    return { text: JSON.stringify(body), inputTokens: 120, outputTokens: 40 };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(request);
    return this.handler(request);
  }
}

let shared: DbHandle | null = null;
function db(): DbHandle {
  shared ??= createDb(TEST_DATABASE_URL, 5);
  return shared;
}

export async function resetDatabase(): Promise<void> {
  const tables = await db().db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (list) await db().db.execute(sql.raw(`truncate ${list} restart identity cascade`));
}

export async function createTestApp(
  options: { provider?: LlmProvider; config?: Record<string, string>; fetchImpl?: typeof fetch } = {},
): Promise<FastifyInstance> {
  const app = await buildApp({
    config: testConfig(options.config),
    db: db(),
    provider: options.provider,
    fetchImpl: options.fetchImpl,
  });
  await app.ready();
  return app;
}

export interface Actor {
  cookie: string;
  userId: string;
  orgId: string;
  email: string;
}

let counter = 0;
/** A distinct client address per call, so per-IP rate limits don't couple unrelated tests. */
export function nextIp(): string {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
}

export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

function sessionCookie(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = values.map((v) => v.split(";")[0]!).find((v) => v.startsWith("sf_session="));
  if (!match) throw new Error("No session cookie in response");
  return match;
}

export async function register(app: FastifyInstance, org = "Acme Support", email = uniqueEmail()): Promise<Actor> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    remoteAddress: nextIp(),
    payload: { name: "Test Owner", email, password: "correct horse battery", organizationName: org },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { cookie: sessionCookie(res.headers["set-cookie"]), userId: body.user.id, orgId: body.organization.id, email };
}

export async function login(app: FastifyInstance, email: string, password = "correct horse battery"): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/auth/login", remoteAddress: nextIp(), payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return sessionCookie(res.headers["set-cookie"]);
}

/** Authenticated JSON request as the dashboard would send it. */
export function as(app: FastifyInstance, actor: { cookie: string }) {
  const send = (method: InjectOptions["method"], url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { cookie: actor.cookie, origin: WEB_ORIGIN },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });
  return {
    get: (url: string) => send("GET", url),
    post: (url: string, payload: unknown = {}) => send("POST", url, payload),
    patch: (url: string, payload: unknown) => send("PATCH", url, payload),
    delete: (url: string, payload?: unknown) => send("DELETE", url, payload),
  };
}

/** Adds a second member to an actor's workspace through the real invitation flow. */
export async function addMember(app: FastifyInstance, owner: Actor, role: "admin" | "agent"): Promise<Actor> {
  const email = uniqueEmail(role);
  const invite = await as(app, owner).post("/team/invitations", { email, role });
  if (invite.statusCode !== 201) throw new Error(`invite failed: ${invite.body}`);
  const token = (invite.json().inviteUrl as string).split("/invite/")[1]!;
  const res = await app.inject({
    method: "POST",
    url: "/invitations/register",
    remoteAddress: nextIp(),
    payload: { token, name: `Test ${role}`, password: "correct horse battery" },
  });
  if (res.statusCode !== 201) throw new Error(`invite register failed: ${res.body}`);
  return { cookie: sessionCookie(res.headers["set-cookie"]), userId: res.json().user.id, orgId: owner.orgId, email };
}

export async function widgetKey(app: FastifyInstance, actor: Actor): Promise<string> {
  const res = await as(app, actor).get("/widget/config");
  return res.json().config.publicKey as string;
}

const visitorIps = new Map<string, string>();
/** Each simulated visitor keeps one address across their messages. */
function ipForToken(token: string): string {
  if (!visitorIps.has(token)) visitorIps.set(token, nextIp());
  return visitorIps.get(token)!;
}

/** Sends a message as a website visitor through the public widget API. */
export async function visitorSays(
  app: FastifyInstance,
  key: string,
  body: string,
  token = `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  origin = WEB_ORIGIN,
) {
  const res = await app.inject({
    method: "POST",
    url: `/public/widget/${key}/messages`,
    remoteAddress: ipForToken(token),
    headers: { origin, "x-visitor-token": token },
    payload: { body },
  });
  return { res, token, conversationId: res.statusCode === 201 ? (res.json().conversationId as string) : null };
}

export async function publishArticle(app: FastifyInstance, actor: Actor, title: string, body: string): Promise<string> {
  const created = await as(app, actor).post("/kb/articles", { title, body });
  if (created.statusCode !== 201) throw new Error(`article failed: ${created.body}`);
  const id = created.json().id as string;
  const published = await as(app, actor).post(`/kb/articles/${id}/status`, { status: "published" });
  if (published.statusCode !== 200) throw new Error(`publish failed: ${published.body}`);
  return id;
}
