'use client';

import { useParams } from 'next/navigation';
import { ArticleEditor } from '@/components/admin/article-editor';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/trpc/client';

/**
 * Edit-an-existing-article page. Client-rendered because the editor
 * itself is interactive (live preview, optimistic save state) — no
 * benefit to SSR-ing the form when the user immediately hydrates +
 * starts editing.
 */
export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = api.article.getById.useQuery({ id }, { enabled: Boolean(id), retry: false });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] p-5 text-sm text-[var(--color-text-secondary)]">
        Couldn&apos;t load article: {query.error.message}
      </div>
    );
  }
  return (
    <ArticleEditor
      mode="edit"
      initial={{
        id: query.data.id,
        title: query.data.title,
        excerpt: query.data.excerpt,
        content: query.data.content,
        coverImageUrl: query.data.coverImageUrl,
        publishedAt: query.data.publishedAt,
      }}
    />
  );
}
