'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Edit3,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge, Button, Skeleton } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

type Status = 'all' | 'published' | 'draft';

/**
 * Admin → Articles list. Lets admin authors see every article
 * (drafts + published) with status filter + per-row actions:
 * edit, publish/unpublish, delete.
 *
 * Public-facing /blog only shows published. This view is the
 * authoring console — drafts get a clear visual mark + are
 * actionable from here.
 */
export default function AdminArticlesPage() {
  const [status, setStatus] = useState<Status>('all');
  const utils = api.useUtils();
  const query = api.article.listAll.useQuery({ limit: 50, status });

  const publish = api.article.publish.useMutation({
    onSuccess: () => {
      toast.success('Article published');
      utils.article.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const unpublish = api.article.unpublish.useMutation({
    onSuccess: () => {
      toast.success('Article unpublished');
      utils.article.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.article.remove.useMutation({
    onSuccess: () => {
      toast.success('Article deleted');
      utils.article.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Articles
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Authoring console. Drafts stay private until you publish; published
            articles surface on the public /blog page.
          </p>
        </div>
        <Link href="/admin/articles/new">
          <Button leftIcon={<Plus />}>New article</Button>
        </Link>
      </header>

      {/* Status filter */}
      <div className="mt-6 flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-1">
        {(['all', 'published', 'draft'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              'flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium capitalize transition-colors',
              status === s
                ? 'bg-[var(--color-background-elevated)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-6">
        {query.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] p-5 text-sm text-[var(--color-text-secondary)]">
            Couldn&apos;t load articles: {query.error.message}
          </p>
        ) : query.data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-16 text-center">
            <BookOpen className="size-6 text-[var(--color-text-tertiary)]" />
            <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
              No articles {status === 'all' ? 'yet' : `in ${status}`}
            </p>
            <p className="max-w-sm text-xs text-[var(--color-text-secondary)]">
              Tap &quot;New article&quot; to write your first one. Drafts stay
              hidden until you publish.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {query.data.map((article) => {
              const isPublished = article.publishedAt != null;
              const date = isPublished
                ? new Date(article.publishedAt!)
                : new Date(article.updatedAt);
              return (
                <li
                  key={article.id}
                  className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isPublished ? (
                        <Badge variant="success" className="text-[10px]">
                          <CheckCircle2 className="size-3" /> Published
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px]">
                          <Clock className="size-3" /> Draft
                        </Badge>
                      )}
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {isPublished ? 'Published' : 'Updated'}{' '}
                        {date.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 truncate font-display text-base font-semibold text-[var(--color-text-primary)]">
                      {article.title}
                    </p>
                    {article.excerpt ? (
                      <p className="mt-1 line-clamp-1 text-sm text-[var(--color-text-secondary)]">
                        {article.excerpt}
                      </p>
                    ) : null}
                    <p className="mt-1.5 truncate text-xs text-[var(--color-text-tertiary)]">
                      by{' '}
                      {article.author?.displayName ??
                        article.author?.username ??
                        'unknown'}
                      <span className="mx-1.5">·</span>
                      /blog/{article.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/articles/${article.id}/edit`}>
                      <Button variant="ghost" size="sm" leftIcon={<Edit3 />}>
                        Edit
                      </Button>
                    </Link>
                    {isPublished ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<EyeOff />}
                        isLoading={
                          unpublish.isPending && unpublish.variables?.id === article.id
                        }
                        onClick={() => unpublish.mutate({ id: article.id })}
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<CheckCircle2 />}
                        isLoading={
                          publish.isPending && publish.variables?.id === article.id
                        }
                        onClick={() => publish.mutate({ id: article.id })}
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 />}
                      className="text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                      isLoading={
                        remove.isPending && remove.variables?.id === article.id
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${article.title}"? This cannot be undone.`,
                          )
                        ) {
                          remove.mutate({ id: article.id });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
