import { and, asc, count, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import {
  articleListQuerySchema,
  articleSchema,
  articleStatusSchema,
  categorySchema,
  importArticlesSchema,
  slugify,
  updateArticleSchema,
  type ArticleDto,
  type CategoryDto,
} from "@supportflow/shared";
import { z } from "zod";
import { splitImport } from "../ai/chunk";
import { reindexArticle, retrieve } from "../ai/retrieval";
import type { AppContext } from "../context";
import type { DbOrTx } from "../db/client";
import { kbArticles, kbCategories, kbChunks, users } from "../db/schema";
import { audit } from "../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { idParam, parse } from "../lib/validate";
import { requireMember } from "../plugins/auth";
import { assertArticleCapacity } from "../services/workspace";
import { escapeLike } from "./conversations";

async function uniqueSlug(db: DbOrTx, orgId: string, title: string, exceptId?: string): Promise<string> {
  const base = slugify(title, 60);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [taken] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(and(eq(kbArticles.orgId, orgId), eq(kbArticles.slug, slug), exceptId ? ne(kbArticles.id, exceptId) : undefined));
    if (!taken) return slug;
  }
  return `${base}-${Date.now()}`;
}

async function assertCategory(db: DbOrTx, orgId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [row] = await db
    .select({ id: kbCategories.id })
    .from(kbCategories)
    .where(and(eq(kbCategories.id, categoryId), eq(kbCategories.orgId, orgId)));
  if (!row) throw badRequest("Category not found", { categoryId: "Choose a category from this workspace" });
}

function articleSelect(ctx: AppContext) {
  return ctx.db
    .select({
      a: kbArticles,
      categoryName: kbCategories.name,
      updatedByName: users.name,
      chunkCount: sql<number>`(select count(*)::int from ${kbChunks} k where k.article_id = ${kbArticles.id})`,
    })
    .from(kbArticles)
    .leftJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
    .leftJoin(users, eq(users.id, kbArticles.updatedBy));
}

type ArticleRow = Awaited<ReturnType<ReturnType<typeof articleSelect>["execute"]>>[number];

function toArticleDto(row: ArticleRow): ArticleDto {
  const a = row.a;
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    body: a.body,
    status: a.status,
    category: a.categoryId && row.categoryName ? { id: a.categoryId, name: row.categoryName } : null,
    source: a.source,
    updatedBy: row.updatedByName,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    publishedAt: a.publishedAt?.toISOString() ?? null,
    indexedAt: a.indexedAt?.toISOString() ?? null,
    chunkCount: row.chunkCount,
  };
}

async function loadArticle(ctx: AppContext, orgId: string, id: string): Promise<ArticleDto> {
  const [row] = await articleSelect(ctx).where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, orgId)));
  if (!row) throw notFound("Article");
  return toArticleDto(row);
}

export function kbRoutes(ctx: AppContext): FastifyPluginAsync {
  return async (app) => {
    // ----- Categories -----

    app.get("/kb/categories", async (request): Promise<CategoryDto[]> => {
      const member = await requireMember(ctx, request);
      const rows = await ctx.db
        .select({
          c: kbCategories,
          n: sql<number>`(select count(*)::int from ${kbArticles} a where a.category_id = ${kbCategories.id} and a.status <> 'archived')`,
        })
        .from(kbCategories)
        .where(eq(kbCategories.orgId, member.orgId))
        .orderBy(asc(kbCategories.name));
      return rows.map(({ c, n }) => ({ id: c.id, name: c.name, slug: c.slug, articleCount: n }));
    });

    app.post("/kb/categories", async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const { name } = parse(categorySchema, request.body);
      const slug = slugify(name, 60);
      const [existing] = await ctx.db
        .select({ id: kbCategories.id })
        .from(kbCategories)
        .where(and(eq(kbCategories.orgId, member.orgId), eq(kbCategories.slug, slug)));
      if (existing) throw conflict("A category with this name already exists", { name: "Already exists" });
      const [row] = await ctx.db.insert(kbCategories).values({ orgId: member.orgId, name, slug }).returning();
      return reply.status(201).send({ id: row!.id, name: row!.name, slug: row!.slug, articleCount: 0 });
    });

    app.patch("/kb/categories/:id", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Category");
      const { name } = parse(categorySchema, request.body);
      const [row] = await ctx.db
        .update(kbCategories)
        .set({ name, slug: slugify(name, 60) })
        .where(and(eq(kbCategories.id, id), eq(kbCategories.orgId, member.orgId)))
        .returning();
      if (!row) throw notFound("Category");
      return { id: row.id, name: row.name, slug: row.slug };
    });

    app.delete("/kb/categories/:id", async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Category");
      // Articles in the category are kept and become uncategorized.
      const deleted = await ctx.db
        .delete(kbCategories)
        .where(and(eq(kbCategories.id, id), eq(kbCategories.orgId, member.orgId)))
        .returning({ id: kbCategories.id });
      if (deleted.length === 0) throw notFound("Category");
      return reply.status(204).send();
    });

    // ----- Articles -----

    app.get("/kb/articles", async (request) => {
      const member = await requireMember(ctx, request);
      const query = parse(articleListQuerySchema, request.query);
      const filters: (SQL | undefined)[] = [eq(kbArticles.orgId, member.orgId)];
      if (query.status !== "all") filters.push(eq(kbArticles.status, query.status));
      if (query.categoryId) filters.push(eq(kbArticles.categoryId, query.categoryId));
      if (query.q) {
        const like = `%${escapeLike(query.q)}%`;
        filters.push(or(sql`${kbArticles.title} ilike ${like}`, sql`${kbArticles.body} ilike ${like}`));
      }
      const rows = await articleSelect(ctx)
        .where(and(...filters))
        .orderBy(desc(kbArticles.updatedAt))
        .limit(500);
      return rows.map(toArticleDto);
    });

    app.post("/kb/articles", async (request, reply) => {
      const member = await requireMember(ctx, request);
      const input = parse(articleSchema, request.body);
      await assertCategory(ctx.db, member.orgId, input.categoryId);
      await assertArticleCapacity(ctx.db, member.orgId);
      const [row] = await ctx.db
        .insert(kbArticles)
        .values({
          orgId: member.orgId,
          title: input.title,
          slug: await uniqueSlug(ctx.db, member.orgId, input.title),
          body: input.body,
          categoryId: input.categoryId ?? null,
          createdBy: member.user.id,
          updatedBy: member.user.id,
        })
        .returning();
      return reply.status(201).send(await loadArticle(ctx, member.orgId, row!.id));
    });

    app.get("/kb/articles/:id", async (request) => {
      const member = await requireMember(ctx, request);
      return loadArticle(ctx, member.orgId, idParam(request.params, "id", "Article"));
    });

    app.patch("/kb/articles/:id", async (request) => {
      const member = await requireMember(ctx, request);
      const id = idParam(request.params, "id", "Article");
      const input = parse(updateArticleSchema, request.body);
      const [current] = await ctx.db
        .select()
        .from(kbArticles)
        .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, member.orgId)));
      if (!current) throw notFound("Article");
      // Published content is what the AI answers from, so only admins may change it directly.
      if (current.status === "published" && member.role === "agent") {
        throw forbidden("Only admins can edit published articles");
      }
      if (input.categoryId !== undefined) await assertCategory(ctx.db, member.orgId, input.categoryId);
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(kbArticles)
          .set({
            ...(input.title !== undefined
              ? { title: input.title, slug: await uniqueSlug(tx, member.orgId, input.title, id) }
              : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            updatedBy: member.user.id,
            updatedAt: new Date(),
          })
          .where(eq(kbArticles.id, id));
        if (current.status === "published") {
          await reindexArticle(tx, member.orgId, id);
          await audit(tx, {
            orgId: member.orgId,
            actorUserId: member.user.id,
            action: "article.updated",
            targetType: "article",
            targetId: id,
            metadata: { title: input.title ?? current.title, reindexed: true },
            ip: request.clientIp,
          });
        }
      });
      return loadArticle(ctx, member.orgId, id);
    });

    app.post("/kb/articles/:id/status", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Article");
      const { status } = parse(articleStatusSchema, request.body);
      const [current] = await ctx.db
        .select()
        .from(kbArticles)
        .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, member.orgId)));
      if (!current) throw notFound("Article");
      if (current.status === status) return loadArticle(ctx, member.orgId, id);
      if (current.status === "archived") await assertArticleCapacity(ctx.db, member.orgId);
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(kbArticles)
          .set({
            status,
            publishedAt: status === "published" ? new Date() : current.publishedAt,
            updatedBy: member.user.id,
            updatedAt: new Date(),
          })
          .where(eq(kbArticles.id, id));
        await reindexArticle(tx, member.orgId, id);
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: `article.${status === "published" ? "published" : status === "archived" ? "archived" : "unpublished"}`,
          targetType: "article",
          targetId: id,
          metadata: { title: current.title },
          ip: request.clientIp,
        });
      });
      return loadArticle(ctx, member.orgId, id);
    });

    app.delete("/kb/articles/:id", async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const id = idParam(request.params, "id", "Article");
      const deleted = await ctx.db
        .delete(kbArticles)
        .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, member.orgId)))
        .returning({ title: kbArticles.title });
      if (deleted.length === 0) throw notFound("Article");
      await audit(ctx.db, {
        orgId: member.orgId,
        actorUserId: member.user.id,
        action: "article.deleted",
        targetType: "article",
        targetId: id,
        metadata: { title: deleted[0]!.title },
        ip: request.clientIp,
      });
      return reply.status(204).send();
    });

    app.post("/kb/import", { bodyLimit: 600_000 }, async (request, reply) => {
      const member = await requireMember(ctx, request, "admin");
      const input = parse(importArticlesSchema, request.body);
      if (!/\.(md|markdown|txt)$/i.test(input.filename)) {
        throw badRequest("Import Markdown (.md) or plain text (.txt) files", { filename: "Unsupported file type" });
      }
      await assertCategory(ctx.db, member.orgId, input.categoryId);
      const parts = splitImport(input.filename, input.content);
      if (parts.length === 0) throw badRequest("No articles found. Use # headings to separate articles.");
      if (parts.length > 100) throw badRequest("Import up to 100 articles at a time");
      await assertArticleCapacity(ctx.db, member.orgId, parts.length);
      const ids = await ctx.db.transaction(async (tx) => {
        const created: string[] = [];
        for (const part of parts) {
          const [row] = await tx
            .insert(kbArticles)
            .values({
              orgId: member.orgId,
              title: part.title,
              slug: await uniqueSlug(tx, member.orgId, part.title),
              body: part.body.slice(0, 50000),
              categoryId: input.categoryId ?? null,
              status: input.publish ? "published" : "draft",
              publishedAt: input.publish ? new Date() : null,
              source: "import",
              createdBy: member.user.id,
              updatedBy: member.user.id,
            })
            .returning({ id: kbArticles.id });
          created.push(row!.id);
          if (input.publish) await reindexArticle(tx, member.orgId, row!.id);
        }
        await audit(tx, {
          orgId: member.orgId,
          actorUserId: member.user.id,
          action: "articles.imported",
          targetType: "article",
          metadata: { filename: input.filename, count: created.length, published: input.publish },
          ip: request.clientIp,
        });
        return created;
      });
      return reply.status(201).send({ imported: ids.length, articleIds: ids });
    });

    app.post("/kb/reindex", async (request) => {
      const member = await requireMember(ctx, request, "admin");
      const published = await ctx.db
        .select({ id: kbArticles.id })
        .from(kbArticles)
        .where(and(eq(kbArticles.orgId, member.orgId), eq(kbArticles.status, "published")));
      let chunks = 0;
      await ctx.db.transaction(async (tx) => {
        for (const article of published) chunks += await reindexArticle(tx, member.orgId, article.id);
      });
      await audit(ctx.db, {
        orgId: member.orgId,
        actorUserId: member.user.id,
        action: "articles.reindexed",
        targetType: "article",
        metadata: { articles: published.length, chunks },
        ip: request.clientIp,
      });
      return { articles: published.length, chunks };
    });

    /** Shows which published passages the assistant would retrieve for a question. */
    app.post("/kb/search", async (request) => {
      const member = await requireMember(ctx, request);
      const { q } = parse(z.object({ q: z.string().trim().min(2, "Enter a question").max(500) }), request.body);
      const results = await retrieve(ctx.db, member.orgId, q, 5);
      return results.map((r) => ({
        articleId: r.articleId,
        title: r.title,
        heading: r.heading,
        excerpt: r.content.slice(0, 400),
        score: Math.round(r.rank * 1000) / 1000,
        coverage: Math.round(r.coverage * 100),
      }));
    });

    app.get("/kb/stats", async (request) => {
      const member = await requireMember(ctx, request);
      const rows = await ctx.db
        .select({ status: kbArticles.status, n: count() })
        .from(kbArticles)
        .where(eq(kbArticles.orgId, member.orgId))
        .groupBy(kbArticles.status);
      const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      return { draft: by.draft ?? 0, published: by.published ?? 0, archived: by.archived ?? 0 };
    });
  };
}
