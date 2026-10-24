import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { slugify } from "@supportflow/shared";
import { reindexArticle } from "../ai/retrieval";
import { createDb, type Database } from "./client";
import { kbArticles, kbCategories, organizations, subscriptions, widgetConfigs } from "./schema";
import { SAMPLE_ARTICLES, SAMPLE_BUSINESS, SAMPLE_GREETING } from "./sample-content";
import { createWorkspace } from "../services/workspace";

/**
 * Creates or refreshes the public demo workspace used by the homepage chat demo.
 *
 * The demo workspace has no members, so nobody can sign in to it; it only holds the
 * fictional help centre and the conversations visitors start on the homepage, which the
 * hourly maintenance job deletes after DEMO_RETENTION_HOURS.
 */
export async function setupDemo(db: Database, options: { slug: string; webOrigins: string[] }) {
  let [org] = await db.select().from(organizations).where(eq(organizations.slug, options.slug));
  if (!org) {
    org = await db.transaction((tx) =>
      createWorkspace(tx, { name: `${SAMPLE_BUSINESS} (demo)`, ownerId: "", isDemo: true, slug: options.slug }),
    );
  }
  if (!org.isDemo) throw new Error(`Workspace "${options.slug}" exists and is not a demo workspace`);

  await db
    .update(organizations)
    .set({ aiMode: "auto", aiConfidenceThreshold: 55, collectCsat: true, retentionDays: null })
    .where(eq(organizations.id, org.id));
  // Automatic replies need a paid-tier feature; the demo workspace is never billed.
  await db.update(subscriptions).set({ plan: "starter", provider: "none" }).where(eq(subscriptions.orgId, org.id));
  await db
    .update(widgetConfigs)
    .set({
      title: "Larkspur Coffee",
      greeting: SAMPLE_GREETING,
      launcherLabel: "Ask Larkspur",
      brandColor: "#7A4B2A",
      allowedOrigins: options.webOrigins,
      enabled: true,
    })
    .where(eq(widgetConfigs.orgId, org.id));

  for (const article of SAMPLE_ARTICLES) {
    const categorySlug = slugify(article.category);
    let [category] = await db
      .select()
      .from(kbCategories)
      .where(and(eq(kbCategories.orgId, org.id), eq(kbCategories.slug, categorySlug)));
    if (!category) {
      [category] = await db
        .insert(kbCategories)
        .values({ orgId: org.id, name: article.category, slug: categorySlug })
        .returning();
    }
    const slug = slugify(article.title);
    const [existing] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(and(eq(kbArticles.orgId, org.id), eq(kbArticles.slug, slug)));
    let id = existing?.id;
    if (id) {
      await db
        .update(kbArticles)
        .set({ title: article.title, body: article.body, status: "published", categoryId: category!.id, updatedAt: new Date() })
        .where(eq(kbArticles.id, id));
    } else {
      const [row] = await db
        .insert(kbArticles)
        .values({
          orgId: org.id,
          title: article.title,
          slug,
          body: article.body,
          status: "published",
          publishedAt: new Date(),
          categoryId: category!.id,
        })
        .returning({ id: kbArticles.id });
      id = row!.id;
    }
    await reindexArticle(db, org.id, id);
  }

  const [widget] = await db.select().from(widgetConfigs).where(eq(widgetConfigs.orgId, org.id));
  return { orgId: org.id, publicKey: widget!.publicKey };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL;
  const origins = (process.env.WEB_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!url || origins.length === 0) {
    console.error("DATABASE_URL and WEB_ORIGIN are required");
    process.exit(1);
  }
  const handle = createDb(url, 2);
  setupDemo(handle.db, { slug: process.env.DEMO_ORG_SLUG ?? "demo", webOrigins: origins })
    .then(async ({ publicKey }) => {
      console.log("Demo workspace ready.");
      console.log(`Set NEXT_PUBLIC_DEMO_WIDGET_KEY=${publicKey} for the web app.`);
      await handle.close();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await handle.close();
      process.exit(1);
    });
}
