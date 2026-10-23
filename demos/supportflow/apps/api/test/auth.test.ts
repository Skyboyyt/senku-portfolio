import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestApp, login, register, resetDatabase, uniqueEmail, WEB_ORIGIN } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
});
afterAll(async () => app.close());

describe("registration and sessions", () => {
  it("registers a user with a workspace, Free plan and owner role", async () => {
    const owner = await register(app, "Northwind Help");
    const res = await as(app, owner).get("/auth/session");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.organization.name).toBe("Northwind Help");
    expect(body.role).toBe("owner");
    expect(body.plan).toBe("free");
  });

  it("sets an httpOnly, SameSite=Lax session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Cookie", email: uniqueEmail(), password: "correct horse battery", organizationName: "Cookie Co" },
    });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("returns field errors for invalid input", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "", email: "not-an-email", password: "short", organizationName: "x" },
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe("validation_error");
    expect(Object.keys(error.fields)).toEqual(expect.arrayContaining(["name", "email", "password", "organizationName"]));
  });

  it("rejects a duplicate email regardless of case", async () => {
    const email = uniqueEmail();
    await register(app, "First", email);
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Dup", email: email.toUpperCase(), password: "correct horse battery", organizationName: "Second" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.fields.email).toBeDefined();
  });

  it("logs in with the right password and rejects the wrong one with a generic message", async () => {
    const owner = await register(app);
    expect(await login(app, owner.email)).toMatch(/^sf_session=/);
    const wrong = await app.inject({ method: "POST", url: "/auth/login", payload: { email: owner.email, password: "nope nope nope" } });
    const unknown = await app.inject({ method: "POST", url: "/auth/login", payload: { email: uniqueEmail(), password: "nope nope nope" } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it("stores only a hash of the session token", async () => {
    const owner = await register(app);
    const token = owner.cookie.split("=")[1]!;
    const rows = await app.ctx.db.execute<{ id: string }>(
      (await import("drizzle-orm")).sql`select id from sessions where user_id = ${owner.userId}`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.id !== token)).toBe(true);
  });

  it("logs out and invalidates the session", async () => {
    const owner = await register(app);
    expect((await as(app, owner).post("/auth/logout")).statusCode).toBe(204);
    expect((await as(app, owner).get("/auth/session")).statusCode).toBe(401);
  });

  it("requires a session for protected routes", async () => {
    for (const url of ["/conversations", "/tickets", "/kb/articles", "/org", "/team/members", "/analytics"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(401);
    }
  });

  it("changing the password signs out other sessions", async () => {
    const owner = await register(app);
    const other = await login(app, owner.email);
    const res = await as(app, owner).post("/auth/password", {
      currentPassword: "correct horse battery",
      newPassword: "a much better passphrase",
    });
    expect(res.statusCode).toBe(204);
    expect((await as(app, { cookie: other }).get("/auth/session")).statusCode).toBe(401);
    expect((await as(app, owner).get("/auth/session")).statusCode).toBe(200);
    await login(app, owner.email, "a much better passphrase");
  });

  it("blocks cookie-authenticated writes from other origins (CSRF)", async () => {
    const owner = await register(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { cookie: owner.cookie, origin: "https://evil.example" },
      payload: { name: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
    const ok = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { cookie: owner.cookie, origin: WEB_ORIGIN },
      payload: { name: "Renamed" },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("rejects text/plain bodies", async () => {
    const owner = await register(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { cookie: owner.cookie, "content-type": "text/plain" },
      payload: JSON.stringify({ name: "Plain" }),
    });
    expect(res.statusCode).toBe(415);
  });

  it("rate limits repeated failed logins for one address", async () => {
    const email = uniqueEmail();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "wrong password!" } });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});

describe("workspaces", () => {
  it("lets a user create and switch between workspaces", async () => {
    const owner = await register(app, "First workspace");
    const created = await as(app, owner).post("/orgs", { name: "Second workspace" });
    expect(created.statusCode).toBe(201);
    expect(created.json().organization.name).toBe("Second workspace");
    expect(created.json().organizations).toHaveLength(2);
    const back = await as(app, owner).post("/auth/switch-org", { organizationId: owner.orgId });
    expect(back.json().organization.id).toBe(owner.orgId);
  });

  it("refuses to switch into a workspace the user doesn't belong to", async () => {
    const a = await register(app);
    const b = await register(app);
    const res = await as(app, a).post("/auth/switch-org", { organizationId: b.orgId });
    expect(res.statusCode).toBe(403);
  });
});
