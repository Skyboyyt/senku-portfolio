import { and, eq, sql } from "drizzle-orm";
import { slugify } from "@supportflow/shared";
import { reindexArticle } from "../ai/retrieval";
import { hashPassword, randomToken, sha256 } from "../lib/crypto";
import { createWorkspace, nextTicketNumber } from "../services/workspace";
import { createDb } from "./client";
import {
  conversations,
  customers,
  kbArticles,
  kbCategories,
  memberships,
  messages,
  organizations,
  subscriptions,
  tickets,
  users,
} from "./schema";
import { SAMPLE_ARTICLES } from "./sample-content";

/**
 * Development-only sample data: one workspace with an owner and an agent, the fictional
 * Larkspur help centre, and a few conversations and tickets. Refuses to run in production.
 */
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The seed script never runs in production");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, close } = createDb(url, 2);
  const password = "supportflow-dev";
  const ownerEmail = "owner@supportflow.test";

  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${ownerEmail}`);
  if (existing) {
    console.log(`Seed data already exists. Sign in as ${ownerEmail} / ${password}`);
    await close();
    return;
  }

  const passwordHash = await hashPassword(db, password);
  const [owner] = await db.insert(users).values({ email: ownerEmail, name: "Riley Owner (sample)", passwordHash }).returning();
  const [agent] = await db
    .insert(users)
    .values({ email: "agent@supportflow.test", name: "Sam Agent (sample)", passwordHash })
    .returning();
  const org = await db.transaction((tx) => createWorkspace(tx, { name: "Larkspur Support (sample data)", ownerId: owner!.id }));
  await db.insert(memberships).values({ orgId: org.id, userId: agent!.id, role: "agent" });
  await db.update(subscriptions).set({ plan: "pro", provider: "test" }).where(eq(subscriptions.orgId, org.id));
  await db.update(organizations).set({ aiMode: "approval" }).where(eq(organizations.id, org.id));

  for (const article of SAMPLE_ARTICLES) {
    const slug = slugify(article.category);
    let [category] = await db
      .select()
      .from(kbCategories)
      .where(and(eq(kbCategories.orgId, org.id), eq(kbCategories.slug, slug)));
    if (!category) {
      [category] = await db.insert(kbCategories).values({ orgId: org.id, name: article.category, slug }).returning();
    }
    const [row] = await db
      .insert(kbArticles)
      .values({
        orgId: org.id,
        title: article.title,
        slug: slugify(article.title),
        body: article.body,
        status: "published",
        publishedAt: new Date(),
        categoryId: category!.id,
        createdBy: owner!.id,
        updatedBy: owner!.id,
      })
      .returning();
    await reindexArticle(db, org.id, row!.id);
  }

  const samples: { name: string; email: string; lines: [string, string][]; status: "open" | "pending" | "resolved" }[] = [
    {
      name: "Jordan Sample",
      email: "jordan@example.com",
      status: "open",
      lines: [["customer", "Hi, my order hasn't arrived yet. It's been four days."]],
    },
    {
      name: "Alex Sample",
      email: "alex@example.com",
      status: "pending",
      lines: [
        ["customer", "Can I pause my subscription for a month?"],
        ["agent", "Yes — you can pause it from your account page before the next roast date. Want me to walk you through it?"],
      ],
    },
    {
      name: "Casey Sample",
      email: "casey@example.com",
      status: "resolved",
      lines: [
        ["customer", "Which grind should I pick for an AeroPress?"],
        ["agent", "Choose the AeroPress grind at checkout. Whole beans also work if you have a grinder."],
        ["customer", "Perfect, thanks!"],
      ],
    },
  ];
  for (const [index, sample] of samples.entries()) {
    const [customer] = await db
      .insert(customers)
      .values({ orgId: org.id, name: sample.name, email: sample.email, visitorTokenHash: sha256(randomToken()) })
      .returning();
    const started = new Date(Date.now() - (index + 1) * 3 * 3600_000);
    const [conversation] = await db
      .insert(conversations)
      .values({
        orgId: org.id,
        customerId: customer!.id,
        status: sample.status,
        assigneeId: sample.status === "open" ? null : agent!.id,
        createdAt: started,
        lastMessageAt: started,
        resolvedAt: sample.status === "resolved" ? new Date(started.getTime() + 40 * 60_000) : null,
      })
      .returning();
    let at = started.getTime();
    for (const [author, body] of sample.lines) {
      at += 6 * 60_000;
      await db.insert(messages).values({
        orgId: org.id,
        conversationId: conversation!.id,
        authorType: author as "customer" | "agent",
        authorUserId: author === "agent" ? agent!.id : null,
        body,
        createdAt: new Date(at),
      });
    }
    const last = sample.lines.at(-1)!;
    const firstAgent = sample.lines.findIndex(([a]) => a === "agent");
    await db
      .update(conversations)
      .set({
        lastMessageAt: new Date(at),
        lastMessagePreview: last[1],
        lastMessageAuthor: last[0] as "customer" | "agent",
        firstResponseAt: firstAgent >= 0 ? new Date(started.getTime() + (firstAgent + 1) * 6 * 60_000) : null,
      })
      .where(eq(conversations.id, conversation!.id));
    if (index === 0) {
      const number = await nextTicketNumber(db, org.id);
      await db.insert(tickets).values({
        orgId: org.id,
        number,
        title: "Late delivery — check with courier",
        priority: "high",
        conversationId: conversation!.id,
        customerId: customer!.id,
        createdBy: agent!.id,
        ownerId: agent!.id,
      });
    }
  }

  console.log("Development seed created.");
  console.log(`  Owner: ${ownerEmail} / ${password}`);
  console.log(`  Agent: agent@supportflow.test / ${password}`);
  await close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
