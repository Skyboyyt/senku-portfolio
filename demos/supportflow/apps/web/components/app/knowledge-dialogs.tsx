"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import type { CategoryDto } from "@supportflow/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoriesDialog({ open, onOpenChange, onChange }: DialogProps & { onChange: () => void }) {
  const toast = useToast();
  const { data, mutate } = useSWR<CategoryDto[]>(open ? "/kb/categories" : null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/kb/categories", { body: { name } });
      setName("");
      await mutate();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const remove = async (category: CategoryDto) => {
    try {
      await api(`/kb/categories/${category.id}`, { method: "DELETE" });
      await mutate();
      onChange();
      toast(`“${category.name}” deleted. Its articles are now uncategorized.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Categories" description="Group articles so your team can find them. Deleting a category keeps its articles.">
        <form onSubmit={add} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" aria-label="New category name" maxLength={60} />
          <Button type="submit" loading={pending} disabled={name.trim().length < 2}>Add</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {data?.length === 0 && <li className="px-3 py-3 text-sm text-muted">No categories yet.</li>}
          {data?.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm text-text">{c.name}</span>
              <span className="text-xs text-subtle">{c.articleCount} articles</span>
              <Button variant="ghost" size="icon-sm" onClick={() => void remove(c)} aria-label={`Delete ${c.name}`}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function ImportDialog({ open, onOpenChange, categories, onImported }: DialogProps & { categories: CategoryDto[]; onImported: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!file) return setError("Choose a file to import");
    if (!/\.(md|markdown|txt)$/i.test(file.name)) return setError("Import Markdown (.md) or plain text (.txt) files");
    if (file.size > 500_000) return setError("Files are limited to 500 KB");
    setPending(true);
    try {
      const content = await file.text();
      const result = await api<{ imported: number }>("/kb/import", {
        body: { filename: file.name, content, categoryId: categoryId || null, publish },
      });
      toast(`Imported ${result.imported} article${result.imported === 1 ? "" : "s"}${publish ? " and published them" : " as drafts"}`);
      onImported();
      onOpenChange(false);
      setFile(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Import documentation"
        description="Upload approved Markdown or text. Each top-level heading (# Title) becomes an article."
      >
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="File" hint=".md or .txt, up to 500 KB and 100 articles.">
            <Input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="py-1.5" />
          </Field>
          <Field label="Category" optional>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-start gap-3 rounded-md border border-border p-3">
            <Switch checked={publish} onCheckedChange={setPublish} aria-label="Publish after import" />
            <span className="text-sm">
              <span className="font-medium text-text">Publish immediately</span>
              <span className="block text-[13px] text-muted">Only for content that has already been reviewed. The AI starts using it right away.</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={pending}>Import</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface Hit {
  articleId: string;
  title: string;
  heading: string;
  excerpt: string;
  score: number;
  coverage: number;
}

export function RetrievalTestDialog({ open, onOpenChange }: DialogProps) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      setHits(await api<Hit[]>("/kb/search", { body: { q } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        title="Test retrieval"
        description="Type a customer question to see which published passages the AI would read before answering."
      >
        <form onSubmit={run} className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How long does shipping take?" aria-label="Customer question" maxLength={500} />
          <Button type="submit" loading={pending} disabled={q.trim().length < 2}>Search</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
        {hits && (
          <div className="mt-4" aria-live="polite">
            {hits.length === 0 ? (
              <p className="rounded-md border border-border bg-surface-2 p-4 text-sm text-muted">
                No published passage matches. The AI would hand this question to your team. Consider writing an article for it.
              </p>
            ) : (
              <ol className="space-y-3">
                {hits.map((h, i) => (
                  <li key={`${h.articleId}-${i}`} className="rounded-md border border-border p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/app/knowledge/${h.articleId}`} className="text-sm font-medium text-text underline-offset-4 hover:underline">
                        {i + 1}. {h.heading}
                      </Link>
                      <span className="shrink-0 text-xs text-subtle">{h.coverage}% of terms matched</span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{h.excerpt}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
