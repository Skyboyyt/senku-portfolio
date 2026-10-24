import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { kbArticles, kbChunks } from "../db/schema";
import { chunkArticle } from "./chunk";

export interface RetrievedChunk {
  chunkId: string;
  articleId: string;
  title: string;
  heading: string;
  content: string;
  rank: number;
  /** Share of the query's distinct terms that appear in the chunk (0–1). */
  coverage: number;
}

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from have how i if in is it me my of on or our so that the this to was we what when where which who why will with you your hi hello hey please thanks thank".split(
    " ",
  ),
);

/** Lowercase search terms with punctuation and stopwords removed. */
export function queryTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  for (const word of words) {
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    seen.add(word);
    if (seen.size >= 16) break;
  }
  return [...seen];
}

/**
 * Full-text retrieval over published knowledge-base chunks of ONE organization.
 * The org filter is part of the SQL, so another tenant's content can never be returned.
 */
export async function retrieve(
  db: DbOrTx,
  orgId: string,
  text: string,
  limit = 5,
): Promise<RetrievedChunk[]> {
  const terms = queryTerms(text);
  if (terms.length === 0) return [];
  // Terms contain only letters and digits, so the OR query is always valid tsquery syntax.
  const tsquery = terms.map((t) => `${t}:*`).join(" | ");
  const rows = await db
    .select({
      chunkId: kbChunks.id,
      articleId: kbChunks.articleId,
      title: kbArticles.title,
      heading: kbChunks.heading,
      content: kbChunks.content,
      rank: sql<number>`ts_rank_cd(${kbChunks.tsv}, to_tsquery('english', ${tsquery}), 32)`,
    })
    .from(kbChunks)
    .innerJoin(
      kbArticles,
      and(eq(kbArticles.id, kbChunks.articleId), eq(kbArticles.orgId, kbChunks.orgId)),
    )
    .where(
      and(
        eq(kbChunks.orgId, orgId),
        eq(kbArticles.status, "published"),
        sql`${kbChunks.tsv} @@ to_tsquery('english', ${tsquery})`,
      ),
    )
    .orderBy(sql`4 desc`)
    .limit(limit);

  return rows
    .map((row) => {
      const haystack = `${row.heading} ${row.content}`.toLowerCase();
      const matched = terms.filter((t) => haystack.includes(t.length > 4 ? t.slice(0, -1) : t)).length;
      return { ...row, rank: Number(row.rank), coverage: matched / terms.length };
    })
    .sort((a, b) => b.rank - a.rank);
}

/** Rebuilds the retrieval chunks of one article. Drafts and archived articles get none. */
export async function reindexArticle(db: DbOrTx, orgId: string, articleId: string): Promise<number> {
  const [article] = await db
    .select()
    .from(kbArticles)
    .where(and(eq(kbArticles.id, articleId), eq(kbArticles.orgId, orgId)));
  if (!article) return 0;
  await db.delete(kbChunks).where(and(eq(kbChunks.articleId, articleId), eq(kbChunks.orgId, orgId)));
  if (article.status !== "published") {
    await db.update(kbArticles).set({ indexedAt: null }).where(eq(kbArticles.id, articleId));
    return 0;
  }
  const chunks = chunkArticle(article.title, article.body);
  if (chunks.length > 0) {
    await db.insert(kbChunks).values(
      chunks.map((chunk, ordinal) => ({
        orgId,
        articleId,
        ordinal,
        heading: chunk.heading,
        content: chunk.content,
      })),
    );
  }
  await db.update(kbArticles).set({ indexedAt: new Date() }).where(eq(kbArticles.id, articleId));
  return chunks.length;
}
