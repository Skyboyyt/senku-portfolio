"use client";

import { ArrowLeft, Archive, Eye, Pencil, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import useSWR from "swr";
import { LABELS, articleSchema, type ArticleDto, type CategoryDto } from "@supportflow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, errorMessage } from "@/lib/api";
import { fieldErrors } from "@/lib/forms";
import { cn, formatDateTime } from "@/lib/utils";
import { Markdown } from "./markdown";
import { useSession } from "./session";

export function ArticleEditor({ article, onSaved }: { article?: ArticleDto; onSaved?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const { data: categories } = useSWR<CategoryDto[]>("/kb/categories");
  const [title, setTitle] = useState(article?.title ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [categoryId, setCategoryId] = useState(article?.category?.id ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!article) return;
    setTitle(article.title);
    setBody(article.body);
    setCategoryId(article.category?.id ?? "");
  }, [article]);

  const isAdmin = can("admin");
  const locked = article?.status === "published" && !isAdmin;
  const dirty = !article || title !== article.title || body !== article.body || categoryId !== (article.category?.id ?? "");

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || locked) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, locked]);

  const save = async (publish = false) => {
    const parsed = articleSchema.safeParse({ title, body, categoryId: categoryId || null });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(publish ? "publish" : "save");
    try {
      let saved: ArticleDto;
      if (article) {
        saved = dirty ? await api<ArticleDto>(`/kb/articles/${article.id}`, { method: "PATCH", body: parsed.data }) : article;
      } else {
        saved = await api<ArticleDto>("/kb/articles", { body: parsed.data });
      }
      if (publish && saved.status !== "published") {
        saved = await api<ArticleDto>(`/kb/articles/${saved.id}/status`, { body: { status: "published" } });
      }
      toast(publish ? "Published. The AI can use it now." : article?.status === "published" ? "Saved and re-indexed" : "Draft saved");
      if (!article) router.replace(`/app/knowledge/${saved.id}`);
      else onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else setFormError(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  const setStatus = async (status: "draft" | "archived" | "published") => {
    if (!article) return;
    setPending(status);
    try {
      await api(`/kb/articles/${article.id}/status`, { body: { status } });
      toast(status === "archived" ? "Archived. The AI no longer uses it." : status === "draft" ? "Moved back to drafts" : "Published");
      onSaved?.();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-dvh flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-8">
        <Link href="/app/knowledge" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4" aria-hidden /> Knowledge base
        </Link>
        {article && (
          <Badge tone={article.status === "published" ? "success" : article.status === "draft" ? "warning" : "neutral"} className="ml-1">
            {LABELS.articleStatus[article.status]}
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!locked && (
            <Button type="submit" variant="secondary" loading={pending === "save"} disabled={!dirty}>
              {article?.status === "published" ? "Save changes" : "Save draft"}
            </Button>
          )}
          {isAdmin && article?.status !== "published" && (
            <Button type="button" onClick={() => void save(true)} loading={pending === "publish"}>
              <Upload aria-hidden /> Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid flex-1 gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-4">
          <FormError message={formError} />
          {locked && (
            <p className="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info">
              This article is published, so the AI is using it. Only admins can edit published articles.
            </p>
          )}
          <Field label="Title" error={errors.title}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={locked} maxLength={200} placeholder="e.g. Shipping times and costs" className="h-12 text-base font-medium sm:h-11" />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-text" id="body-label">Article</span>
              <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-md border border-border p-0.5">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium sm:min-h-7", tab === t ? "bg-surface-3 text-text" : "text-muted")}
                  >
                    {t === "write" ? <Pencil className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                    {t === "write" ? "Write" : "Preview"}
                  </button>
                ))}
              </div>
            </div>
            {tab === "write" ? (
              <>
                <Textarea
                  aria-labelledby="body-label"
                  aria-invalid={errors.body ? true : undefined}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  readOnly={locked}
                  maxLength={50000}
                  className="min-h-[420px] font-mono text-[13.5px] leading-relaxed"
                  placeholder={"Write in Markdown.\n\n## Use headings for each topic\nThe AI reads each section on its own, so keep sections self-contained."}
                />
                {errors.body && <p className="mt-1.5 text-[13px] font-medium text-danger">{errors.body}</p>}
              </>
            ) : (
              <div className="min-h-[420px] rounded-md border border-border bg-surface p-5">
                {body.trim() ? <Markdown source={body} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5 text-sm" aria-label="Article settings">
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={locked}>
              <option value="">Uncategorized</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {article && (
            <dl className="space-y-2 rounded-md border border-border bg-surface p-3.5 text-[13px]">
              <Meta label="Updated">{formatDateTime(article.updatedAt)}{article.updatedBy ? ` by ${article.updatedBy}` : ""}</Meta>
              <Meta label="Published">{article.publishedAt ? formatDateTime(article.publishedAt) : "Not yet"}</Meta>
              <Meta label="AI index">
                {article.status === "published"
                  ? `${article.chunkCount} passage${article.chunkCount === 1 ? "" : "s"}${article.indexedAt ? `, ${formatDateTime(article.indexedAt)}` : ""}`
                  : "Not used by the AI"}
              </Meta>
              <Meta label="Source">{article.source === "import" ? "Imported" : "Written here"}</Meta>
            </dl>
          )}
          <div className="rounded-md bg-surface-2 p-3.5 text-[13px] leading-relaxed text-muted">
            <p className="font-medium text-text">Writing for the AI</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>One topic per heading; the AI reads sections separately.</li>
              <li>State policies plainly, with numbers and time limits.</li>
              <li>Include any links customers need. The AI may only share links that appear here.</li>
            </ul>
          </div>
          {isAdmin && article && (
            <div className="space-y-2 border-t border-border pt-5">
              {article.status === "published" && (
                <Button type="button" variant="secondary" className="w-full" onClick={() => void setStatus("draft")} loading={pending === "draft"}>
                  Unpublish
                </Button>
              )}
              {article.status !== "archived" ? (
                <Button type="button" variant="secondary" className="w-full" onClick={() => void setStatus("archived")} loading={pending === "archived"}>
                  <Archive aria-hidden /> Archive
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="w-full" onClick={() => void setStatus("draft")} loading={pending === "draft"}>
                  Restore as draft
                </Button>
              )}
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="danger-ghost" className="w-full">
                    <Trash2 aria-hidden /> Delete
                  </Button>
                }
                title="Delete this article?"
                description="It's removed permanently and the AI stops using it. Archive instead if you might need it again."
                confirmLabel="Delete article"
                onConfirm={async () => {
                  await api(`/kb/articles/${article.id}`, { method: "DELETE" });
                  toast("Article deleted");
                  router.replace("/app/knowledge");
                }}
              />
            </div>
          )}
        </aside>
      </div>
    </form>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-subtle">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}
