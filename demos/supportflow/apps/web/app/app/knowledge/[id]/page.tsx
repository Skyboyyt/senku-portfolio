"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import type { ArticleDto } from "@supportflow/shared";
import { ArticleEditor } from "@/components/app/article-editor";
import { PageBody } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ApiError, errorMessage } from "@/lib/api";

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, mutate } = useSWR<ArticleDto>(`/kb/articles/${id}`);
  if (error) {
    return (
      <PageBody>
        <ErrorState
          message={error instanceof ApiError && error.status === 404 ? "This article doesn't exist or was deleted." : errorMessage(error)}
          onRetry={() => void mutate()}
        />
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody className="space-y-4">
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-96 w-full" />
      </PageBody>
    );
  }
  return <ArticleEditor article={data} onSaved={() => void mutate()} />;
}
