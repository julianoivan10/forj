'use client';

import Link from 'next/link';
import { Bookmark, Search } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { JobCard } from '@/components/jobs/job-card';
import { api } from '@/lib/trpc/client';

/**
 * Dashboard → Saved jobs. Displays everything the authenticated user
 * has bookmarked, newest-bookmark-first.
 *
 * Reuses `<JobCard>` for each row so the visual treatment is identical
 * to the public `/jobs` listing — the bookmark surface should feel
 * like a *filtered slice* of the same catalog, not a parallel UI.
 */

type SavedItem = inferRouterOutputs<AppRouter>['savedJob']['list']['items'][number];

export default function SavedJobsPage() {
  const list = api.savedJob.list.useQuery({ limit: 30 });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
            <Bookmark className="size-3.5" /> Saved jobs
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Your bookmarks
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-secondary)]">
            Jobs you tapped the bookmark on. Quick way to track the ones
            you want to come back to — they stay here until you remove
            them or the job is closed.
          </p>
        </div>
      </header>

      <div className="mt-8">
        {list.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
            <EmptyState
              variant="jobs"
              title="No bookmarks yet"
              description="Tap the bookmark icon on any job to save it for later. Bookmarks are private — only you see them."
              action={
                <Link href="/jobs">
                  <Button leftIcon={<Search />}>Browse jobs</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.data.items.map((item) => (
              <JobCard key={item.id} job={toJobCardShape(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Saved-list rows don't have every field the public `job.list` returns
 * (we'd be paying for unused columns on every bookmark page load). The
 * JobCard component reads its props loosely, so we cast a partial shape
 * that fills in what JobCard actually consumes.
 */
function toJobCardShape(item: SavedItem) {
  return item as unknown as Parameters<typeof JobCard>[0]['job'];
}
