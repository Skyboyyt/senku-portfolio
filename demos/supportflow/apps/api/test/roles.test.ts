import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, as, createTestApp, nextIp, publishArticle, register, resetDatabase, uniqueEmail, type Actor } from "./helpers";

let app: FastifyInstance;
let owner: Actor;
let admin: Actor;
let agent: Actor;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  owner = await register(app, "Roles Inc");
  // Free has 2 seats; move to Business (test billing) to have room for the role matrix.
  await as(app, owner).post("/billing/test/change-plan", { plan: "business" });
  admin = await addMember(app, owner, "admin");
  agent = await addMember(app, owner, "agent");
});
afterAll(async () => app.close());

describe("role-based authorization", () => {
  it("agents can work conversations but not change settings", async () => {
    const asAgent = as(app, agent);
    expect((await asAgent.get("/conversations")).statusCode).toBe(200);
    expect((await asAgent.patch("/org", { name: "Agent rename" })).statusCode).toBe(403);
    expect((await asAgent.post("/team/invitations", { email: uniqueEmail(), role: "agent" })).statusCode).toBe(403);
    expect((await asAgent.patch("/widget/config", { title: "Nope" })).statusCode).toBe(403);
    expect((await asAgent.get("/org/audit-logs")).statusCode).toBe(403);
    expect((await asAgent.post("/billing/test/change-plan", { plan: "free" })).statusCode).toBe(403);
  });

  it("agents can draft articles; only admins publish or edit published content", async () => {
    const draft = await as(app, agent).post("/kb/articles", { title: "Agent draft", body: "Draft body" });
    expect(draft.statusCode).toBe(201);
    const id = draft.json().id;
    expect((await as(app, agent).post(`/kb/articles/${id}/status`, { status: "published" })).statusCode).toBe(403);
    expect((await as(app, admin).post(`/kb/articles/${id}/status`, { status: "published" })).statusCode).toBe(200);
    expect((await as(app, agent).patch(`/kb/articles/${id}`, { body: "Changed" })).statusCode).toBe(403);
    expect((await as(app, admin).patch(`/kb/articles/${id}`, { body: "Changed by admin" })).statusCode).toBe(200);
  });

  it("admins manage settings but cannot delete the workspace or touch billing", async () => {
    expect((await as(app, admin).patch("/org", { aiConfidenceThreshold: 80 })).statusCode).toBe(200);
    expect((await as(app, admin).delete("/org", { confirmName: "Roles Inc" })).statusCode).toBe(403);
    expect((await as(app, admin).post("/billing/test/change-plan", { plan: "pro" })).statusCode).toBe(403);
  });

  it("only owners grant the owner role, and the last owner can't be demoted", async () => {
    const members = (await as(app, owner).get("/team/members")).json();
    const agentMembership = members.find((m: { userId: string }) => m.userId === agent.userId);
    const ownerMembership = members.find((m: { userId: string }) => m.userId === owner.userId);
    expect((await as(app, admin).patch(`/team/members/${agentMembership.id}`, { role: "owner" })).statusCode).toBe(403);
    expect((await as(app, admin).patch(`/team/members/${ownerMembership.id}`, { role: "agent" })).statusCode).toBe(403);
    expect((await as(app, owner).patch(`/team/members/${ownerMembership.id}`, { role: "admin" })).statusCode).toBe(400);
    expect((await as(app, admin).patch(`/team/members/${agentMembership.id}`, { role: "admin" })).statusCode).toBe(200);
    expect((await as(app, admin).patch(`/team/members/${agentMembership.id}`, { role: "agent" })).statusCode).toBe(200);
  });

  it("removing a member revokes access immediately", async () => {
    const temp = await addMember(app, owner, "agent");
    expect((await as(app, temp).get("/conversations")).statusCode).toBe(200);
    const members = (await as(app, owner).get("/team/members")).json();
    const m = members.find((x: { userId: string }) => x.userId === temp.userId);
    expect((await as(app, agent).delete(`/team/members/${m.id}`)).statusCode).toBe(403);
    expect((await as(app, admin).delete(`/team/members/${m.id}`)).statusCode).toBe(204);
    expect((await as(app, temp).get("/conversations")).statusCode).toBe(403);
  });

  it("records administrative actions in the audit log", async () => {
    const logs = (await as(app, owner).get("/org/audit-logs")).json().items.map((l: { action: string }) => l.action);
    expect(logs).toEqual(expect.arrayContaining(["member.invited", "member.joined", "member.role_changed", "member.removed", "settings.updated", "article.published", "billing.plan_changed"]));
  });

  it("the owner can delete the workspace after confirming its name", async () => {
    const solo = await register(app, "Delete Me");
    await publishArticle(app, solo, "Gone soon", "This article will be deleted with the workspace.");
    expect((await as(app, solo).delete("/org", { confirmName: "Wrong" })).statusCode).toBe(400);
    expect((await as(app, solo).delete("/org", { confirmName: "Delete Me" })).statusCode).toBe(204);
    expect((await as(app, solo).get("/org")).statusCode).toBe(403);
  });
});

describe("invitations and seat limits", () => {
  it("enforces the Free plan's two seats, counting pending invitations", async () => {
    const free = await register(app, "Small Shop");
    const first = await as(app, free).post("/team/invitations", { email: uniqueEmail(), role: "agent" });
    expect(first.statusCode).toBe(201);
    const second = await as(app, free).post("/team/invitations", { email: uniqueEmail(), role: "agent" });
    expect(second.statusCode).toBe(402);
    expect(second.json().error.code).toBe("plan_limit");
  });

  it("only the invited address can accept, and tokens are single-use", async () => {
    const shop = await register(app, "Invite Shop");
    const invitedEmail = uniqueEmail("invitee");
    const invite = await as(app, shop).post("/team/invitations", { email: invitedEmail, role: "agent" });
    const token = invite.json().inviteUrl.split("/invite/")[1];

    const info = await app.inject({ method: "GET", url: `/invitations/${token}` });
    expect(info.json()).toMatchObject({ organizationName: "Invite Shop", email: invitedEmail, hasAccount: false });

    const stranger = await register(app, "Stranger Org");
    expect((await as(app, stranger).post("/invitations/accept", { token })).statusCode).toBe(403);

    const joined = await app.inject({
      method: "POST",
      url: "/invitations/register",
      remoteAddress: nextIp(),
      payload: { token, name: "Invitee", password: "correct horse battery" },
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json().role).toBe("agent");
    const again = await app.inject({
      method: "POST",
      url: "/invitations/register",
      remoteAddress: nextIp(),
      payload: { token, name: "Invitee", password: "correct horse battery" },
    });
    expect(again.statusCode).toBe(404);
  });

  it("revoked invitations can't be used", async () => {
    const shop = await register(app, "Revoke Shop");
    const invite = await as(app, shop).post("/team/invitations", { email: uniqueEmail(), role: "agent" });
    const token = invite.json().inviteUrl.split("/invite/")[1];
    expect((await as(app, shop).delete(`/team/invitations/${invite.json().invitation.id}`)).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/invitations/${token}` })).statusCode).toBe(404);
  });
});
