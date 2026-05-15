'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, EyeOff, Plus, Star } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { api } from '@/lib/trpc/client';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { cn, formatUSD } from '@/lib/utils';

type MyService = inferRouterOutputs<AppRouter>['service']['myServices'][number];

/**
 * Dashboard → My Services. Lists every service the authenticated user has
 * published (active + paused). The public catalog at /services only shows
 * active ones; this page shows everything they own.
 */
export default function MyServicesPage() {
  const list = api.service.myServices.useQuery();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            My Services
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Productised work you've published. Buyers can purchase directly without
            a proposal round-trip.
          </p>
        </div>
        <Link href="/dashboard/services/new">
          <Button leftIcon={<Plus />}>New service</Button>
        </Link>
      </div>

      <div className="mt-8">
        {list.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : !list.data?.length ? (
          <Empty />
        ) : (
          <div className="flex flex-col gap-4">
            {list.data.map((s, i) => (
              <Row key={s.id} service={s} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  service,
  index,
}: {
  service: MyService;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        href={`/services/${service.slug}`}
        className={cn(
          'group flex flex-col gap-3 rounded-[var(--radius-xl)] border bg-[var(--color-background-secondary)] p-5 transition-colors',
          service.isActive
            ? 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'
            : 'border-[var(--color-border-subtle)] opacity-70',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {service.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="default" className="gap-1">
              <EyeOff className="size-3" /> Paused
            </Badge>
          )}
          <span className="text-xs text-[var(--color-text-tertiary)]">
            Updated{' '}
            {new Date(service.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <p className="font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
          {service.title}
        </p>
        <p className="line-clamp-1 text-sm text-[var(--color-text-secondary)]">
          {service.tagline}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-border-subtle)] pt-3 text-xs text-[var(--color-text-secondary)]">
          <span>
            <span className="text-[var(--color-text-tertiary)]">From: </span>
            <span className="font-semibold text-[var(--color-text-primary)]">
              {formatUSD(service.priceFrom)}
            </span>
          </span>
          <span>
            <span className="text-[var(--color-text-tertiary)]">Orders: </span>
            <span className="font-semibold text-[var(--color-text-primary)]">
              {service.ordersCompleted}
            </span>
          </span>
          {service.reviewCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 fill-[var(--color-warning)] text-[var(--color-warning)]" />
              <span className="font-semibold text-[var(--color-text-primary)]">
                {Number(service.avgRating).toFixed(1)}
              </span>
              <span className="text-[var(--color-text-tertiary)]">
                ({service.reviewCount})
              </span>
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
            View public page
            <ArrowRight className="size-3" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function Empty() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
      <EmptyState
        variant="services"
        title="No services yet"
        description="Productise your skill into a buy-now service. Buyers fund USDC escrow instantly — no proposal back-and-forth."
        action={
          <Link href="/dashboard/services/new">
            <Button leftIcon={<Plus />}>Publish your first service</Button>
          </Link>
        }
      />
    </div>
  );
}
