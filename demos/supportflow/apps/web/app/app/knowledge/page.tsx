"use client";

import { BookOpen, FlaskConical, FolderCog, Plus, RefreshCcw, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { LABELS, type ArticleDto, type CategoryDto } from "@supportflow/shared";
import { CategoriesDialog, ImportDialog, RetrievalTestDialog } from "@/components/app/knowledge-dialogs";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Input, Select } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn, relativeTime } from "@/lib/utils";

const TABS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
];

export default function KnowledgePage() {
  const { can } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [dialog, setDialog] = useState<"categories" | "import" | "test" | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const categories = useSWR<CategoryDto[]>("/kb/categories");
  const stats = useSWR<{ draft: number; published: number; archived: number }>("/kb/stats");
  const key = `/kb/articles?status=${status}${category ? `&categoryId=${category}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<ArticleDto[]>(key);

  const refreshAll = () => {
    void mutate();
    void categories.mutate();
    void stats.mutate();
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const result = await api<{ articles: number; chunks: number }>("/kb/reindex", { body: {} });
      toast(`Re-indexed ${result.articles} published articles (${result.chunks} passages)`);
      refreshAll();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setReindexing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="The AI answers only from published articles. Drafts and archived articles are never used."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog("test")}>
              <FlaskConical aria-hidden /> Test retrieval
            </Button>
            {can("admin") && (
              <Dropdown>
                <DropdownTrigger className={buttonVariants({ variant: "secondary" })}>Manage</DropdownTrigger>
                <DropdownContent>
                  <DropdownItem onSelect={() => setDialog("import")}>
                    <Upload /> Import documentation
                  </DropdownItem>
                  <DropdownItem onSelect={() => setDialog("categories")}>
                    <FolderCog /> Categories
                  </DropdownItem>
                  <DropdownItem onSelect={() => void reindex()} disabled={reindexing}>
                    <RefreshCcw /> Re-index published articles
                  </DropdownItem>
                </DropdownContent>
              </Dropdown>
            )}
            <Link href="/app/knowledge/new" className={buttonVariants()}>
              <Plus aria-hidden /> New article
            </Link>
          </>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div role="tablist" aria-label="Article status" className="inline-flex w-fit rounded-md border border-border bg-surface p-0.5">
            {TABS.map((tab) => {
              const count = tab.value === "all" || !stats.data ? null : stats.data[tab.value as keyof typeof stats.data];
              return (
                <button
                  key={tab.value}
                  role="tab"
                  type="button"
                  aria-selected={status === tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={cn(
                    "min-h-10 rounded-[5px] px-3 text-[13px] font-medium sm:min-h-8",
                    status === tab.value ? "bg-surface-3 text-text" : "text-muted hover:text-text",
                  )}
                >
                  {tab.label}
                  {count !== null && <span className="ml-1.5 text-subtle">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 lg:ml-auto">
            <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
              <option value="">All categories</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles" aria-label="Search articles" className="pl-9" />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
          ) : isLoading || !data ? (
            <ListSkeleton rows={5} />
          ) : data.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={q || category || status !== "all" ? "No articles match" : "Write your first article"}
              action={
                !q && !category && status === "all" && (
                  <Link href="/app/knowledge/new" className={buttonVariants({ variant: "secondary" })}>New article</Link>
                )
              }
            >
              {q || category || status !== "all"
                ? "Try another search or filter."
                : "Start with the questions customers ask most: shipping, returns, accounts. Publish it so the AI can use it."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((a) => (
                <li key={a.id}>
                  <Link href={`/app/knowledge/${a.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{a.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{a.body.replace(/[#*`>-]/g, "").slice(0, 160)}</p>
                      <p className="mt-1.5 text-xs text-subtle">
                        {a.category?.name ?? "Uncategorized"} · updated {relativeTime(a.updatedAt)}
                        {a.updatedBy ? ` by ${a.updatedBy}` : ""}
                        {a.source === "import" ? " · imported" : ""}
                      </p>
                    </div>
                    <Badge tone={a.status === "published" ? "success" : a.status === "draft" ? "warning" : "neutral"}>
                      {LABELS.articleStatus[a.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageBody>

      <CategoriesDialog open={dialog === "categories"} onOpenChange={(o) => setDialog(o ? "categories" : null)} onChange={refreshAll} />
      <ImportDialog open={dialog === "import"} onOpenChange={(o) => setDialog(o ? "import" : null)} categories={categories.data ?? []} onImported={refreshAll} />
      <RetrievalTestDialog open={dialog === "test"} onOpenChange={(o) => setDialog(o ? "test" : null)} />
    </>
  );
}
