'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Plus, Sparkles, Star } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { Badge, Button, Input, Skeleton, UserAvatar } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { JOB_CATEGORIES } from '@/lib/constants';
import { cn, formatUSD } from '@/lib/utils';

type ServiceListItem = inferRouterOutputs<AppRouter>['service']['list']['items'][number];

type CategoryValue = (typeof JOB_CATEGORIES)[number]['value'];
type SortValue = 'popular' | 'newest' | 'price_asc' | 'price_desc';

const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

/**
 * Service discovery — the freelancer-led entry point to the marketplace.
 * Mirror of /jobs but for productised gigs (no proposal round-trip,
 * client buys + funds escrow in one step).
 */
export function ServicesDiscover() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<CategoryValue | undefined>(undefined);
  const [sort, setSort] = useState<SortValue>('popular');

  const list = api.service.list.useQuery({ q: q || undefined, category, sort, limit: 24 });

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
            <Sparkles className="size-3.5" /> Services marketplace
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Buy productised work
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)] sm:text-base">
            Skip the back-and-forth — pick a service, fund USDC escrow, and the
            freelancer starts immediately. Same on-chain protection as posted jobs.
          </p>
        </div>
        <Link href="/dashboard/services/new">
          <Button leftIcon={<Plus />}>Publish a service</Button>
        </Link>
      </header>

      {/* Filters */}
      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search services…"
          className="lg:max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip
            label="All"
            active={!category}
            onClick={() => setCategory(undefined)}
          />
          {JOB_CATEGORIES.map((c) => (
            <CategoryChip
              key={c.value}
              label={c.label}
              active={category === c.value}
              onClick={() => setCategory(c.value)}
            />
          ))}
        </div>
        <div className="lg:ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortValue)}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-3 text-sm text-[var(--color-text-primary)]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-8">
        {list.isPending ? (
          <Grid>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-[var(--radius-xl)]" />
            ))}
          </Grid>
        ) : !list.data?.items.length ? (
          <EmptyState query={q} category={category} />
        ) : (
          <Grid>
            {list.data.items.map((s, i) => (
              <ServiceCard key={s.id} service={s} index={i} />
            ))}
          </Grid>
        )}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-[var(--radius-full)] border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
          : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
      )}
    >
      {label}
    </button>
  );
}

function ServiceCard({
  service,
  index,
}: {
  service: ServiceListItem;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link
        href={`/services/${service.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] transition-colors hover:border-[var(--color-border-brand)]"
      >
        {/* Cover */}
        <div className="aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-[var(--color-background-tertiary)] to-[var(--color-background-elevated)]">
          {service.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.coverImageUrl}
              alt=""
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Sparkles className="size-8 text-[var(--color-text-tertiary)]" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <UserAvatar
              name={service.freelancer.displayName ?? service.freelancer.username ?? 'User'}
              imageUrl={service.freelancer.avatarUrl}
              size="sm"
            />
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-[var(--color-text-primary)]">
                {service.freelancer.displayName ?? service.freelancer.username}
              </p>
              <p className="text-[var(--color-text-tertiary)]">
                WorkScore {Number(service.freelancer.workScore ?? 0).toFixed(0)}
              </p>
            </div>
          </div>

          <h3 className="line-clamp-2 font-display text-sm font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
            {service.title}
          </h3>
          <p className="line-clamp-2 text-xs text-[var(--color-text-secondary)]">
            {service.tagline}
          </p>

          <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3">
            <div className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
              {service.reviewCount > 0 ? (
                <>
                  <Star className="size-3 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {Number(service.avgRating).toFixed(1)}
                  </span>
                  <span>({service.reviewCount})</span>
                </>
              ) : (
                <Badge variant="default" className="text-[10px]">
                  New
                </Badge>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                From
              </p>
              <p className="font-display text-sm font-bold text-[var(--color-text-primary)]">
                {formatUSD(service.priceFrom)}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState({
  query,
  category,
}: {
  query: string;
  category: string | undefined;
}) {
  const filtered = query || category;
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <Sparkles className="size-6 text-[var(--color-text-tertiary)]" />
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
        {filtered ? 'No services match those filters' : 'No services yet'}
      </h3>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        {filtered
          ? 'Try a broader search or different category. The catalog is just getting started.'
          : "Be the first — publish your services and reach buyers directly. No proposal round-trip needed."}
      </p>
      {!filtered ? (
        <Link href="/dashboard/services/new" className="mt-2">
          <Button leftIcon={<Plus />}>
            Publish a service
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
