'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button, EmptyState as SharedEmptyState, Skeleton } from '@/components/ui';
import { JobCard } from '@/components/jobs/job-card';
import {
  JobsFilters,
  type ExperienceLevel,
  type JobCategory,
  type JobDuration,
  type JobsFilterValues,
} from '@/components/jobs/jobs-filters';
import { JobsToolbar, type JobsSort } from '@/components/jobs/jobs-toolbar';
import { useDebounce } from '@/hooks/use-debounce';
import { api } from '@/lib/trpc/client';
import { JOB_CATEGORIES, DURATION_LABELS, EXPERIENCE_LABELS } from '@/lib/constants';

const VALID_CATEGORIES = new Set(JOB_CATEGORIES.map((c) => c.value));
const VALID_DURATIONS = new Set(Object.keys(DURATION_LABELS));
const VALID_EXPERIENCE = new Set(Object.keys(EXPERIENCE_LABELS));
const VALID_SORTS = new Set(['latest', 'budget_high', 'budget_low', 'most_proposals']);

function parseFilters(sp: URLSearchParams): JobsFilterValues & { search: string; sort: JobsSort } {
  const categories = (sp.getAll('category').filter((v) => VALID_CATEGORIES.has(v as JobCategory)) as JobCategory[]);
  const durations = (sp.getAll('duration').filter((v) => VALID_DURATIONS.has(v)) as JobDuration[]);
  const expRaw = sp.get('exp');
  const experienceLevel = expRaw && VALID_EXPERIENCE.has(expRaw) ? (expRaw as ExperienceLevel) : null;
  const minRaw = sp.get('min');
  const maxRaw = sp.get('max');
  const budgetMin = minRaw && !Number.isNaN(Number(minRaw)) ? Number(minRaw) : null;
  const budgetMax = maxRaw && !Number.isNaN(Number(maxRaw)) ? Number(maxRaw) : null;
  const sortRaw = sp.get('sort');
  const sort = (sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : 'latest') as JobsSort;
  const search = sp.get('q') ?? '';
  return { categories, durations, experienceLevel, budgetMin, budgetMax, search, sort };
}

function serializeFilters(f: JobsFilterValues & { search: string; sort: JobsSort }): string {
  const params = new URLSearchParams();
  f.categories.forEach((c) => params.append('category', c));
  f.durations.forEach((d) => params.append('duration', d));
  if (f.experienceLevel) params.set('exp', f.experienceLevel);
  if (f.budgetMin !== null) params.set('min', String(f.budgetMin));
  if (f.budgetMax !== null) params.set('max', String(f.budgetMax));
  if (f.sort !== 'latest') params.set('sort', f.sort);
  if (f.search.trim()) params.set('q', f.search.trim());
  const s = params.toString();
  return s ? `?${s}` : '';
}

function JobsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo(() => parseFilters(searchParams), [searchParams]);
  const [filters, setFilters] = useState<JobsFilterValues>({
    categories: initial.categories,
    durations: initial.durations,
    experienceLevel: initial.experienceLevel,
    budgetMin: initial.budgetMin,
    budgetMax: initial.budgetMax,
  });
  const [search, setSearch] = useState(initial.search);
  const [sort, setSort] = useState<JobsSort>(initial.sort);
  const debouncedSearch = useDebounce(search, 350);

  // Sync URL when any filter changes
  useEffect(() => {
    const next = serializeFilters({ ...filters, search: debouncedSearch, sort });
    router.replace(`/jobs${next}`, { scroll: false });
  }, [filters, debouncedSearch, sort, router]);

  const queryInput = useMemo(
    () => ({
      limit: 20,
      search: debouncedSearch.trim() || undefined,
      categories: filters.categories.length > 0 ? filters.categories : undefined,
      durations: filters.durations.length > 0 ? filters.durations : undefined,
      experienceLevel: filters.experienceLevel ?? undefined,
      budgetMin: filters.budgetMin ?? undefined,
      budgetMax: filters.budgetMax ?? undefined,
      sort,
    }),
    [filters, debouncedSearch, sort],
  );

  const list = api.job.list.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 15_000,
  });

  const jobs = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  const resetFilters = useCallback(() => {
    setFilters({
      categories: [],
      durations: [],
      experienceLevel: null,
      budgetMin: null,
      budgetMax: null,
    });
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Browse jobs
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] sm:text-base">
            Every contract is backed by on-chain USDC escrow. 5% platform fee, 0 middlemen.
          </p>
        </div>
        <Link href="/jobs/post">
          <Button size="lg" leftIcon={<Plus />}>
            Post a job
          </Button>
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <JobsFilters value={filters} onChange={setFilters} onReset={resetFilters} />

        <div className="flex flex-col gap-5">
          <JobsToolbar
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
            totalLabel={
              list.isPending
                ? 'Loading…'
                : `${jobs.length}${list.hasNextPage ? '+' : ''} jobs`
            }
          />

          {list.isPending ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          ) : list.isError ? (
            <EmptyState
              title="Couldn't load jobs"
              description={list.error.message}
              action={
                <Button variant="secondary" onClick={() => list.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No jobs match your filters"
              description="Try broadening your search or clearing a filter."
              action={
                <Button variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}

              {list.hasNextPage ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => list.fetchNextPage()}
                    isLoading={list.isFetchingNextPage}
                  >
                    Load more
                  </Button>
                </div>
              ) : jobs.length > 6 ? (
                <p className="py-2 text-center text-sm text-[var(--color-text-tertiary)]">
                  That&apos;s every open job matching your filters.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-14" />
      </div>
    </div>
  );
}

// Local empty-state wrapper retained for backwards compatibility — now
// delegates to the shared `<EmptyState>` from `@/components/ui` so the
// Bauhaus illustration is rendered. Defaulting to the `search` variant
// because both call-sites here are "no results / error" cases on a
// listing page.
function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
      <SharedEmptyState
        variant="search"
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-[var(--color-brand-primary)]" />
        </div>
      }
    >
      <JobsPageInner />
    </Suspense>
  );
}
