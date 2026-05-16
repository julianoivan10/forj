'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Bookmark, Search, Sparkles, Star } from 'lucide-react';
import { Badge, Button, EmptyState, Skeleton, UserAvatar } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { cn, formatUSD } from '@/lib/utils';

/**
 * Dashboard → Saved services. Mirror of /dashboard/saved (which is for
 * saved JOBS) but targets services — the buyer's perspective. A client
 * browsing the services catalog who wants to remember a particular
 * freelancer's "Logo redesign $200" service lands their bookmarks here.
 *
 * Uses a richer card layout than JobCard because services have a
 * cover image more often and surfaces freelancer reputation up front.
 */
export default function SavedServicesPage() {
  const list = api.savedService.list.useQuery({ limit: 30 });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
            <Bookmark className="size-3.5" /> Saved services
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Services you bookmarked
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-secondary)]">
            Freelancer-published services you saved for later. Tap any
            card to revisit. Bookmarks are private — only you see them.
          </p>
        </div>
      </header>

      <div className="mt-8">
        {list.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
            <EmptyState
              variant="services"
              title="No saved services yet"
              description="Tap the bookmark on any service to save it for later. Great for shortlisting freelancers you might hire."
              action={
                <Link href="/services">
                  <Button leftIcon={<Search />}>Browse services</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.data.items.map((item, i) => (
              <ServiceRow key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ItemShape {
  id: string;
  title: string;
  slug: string;
  tagline: string;
  category: string;
  coverImageUrl: string | null;
  priceFrom: string;
  ordersCompleted: number;
  avgRating: string | null;
  reviewCount: number;
  freelancer: {
    id: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    workScore: string;
    badgeTier: string | null;
  };
}

function ServiceRow({ item, index }: { item: ItemShape; index: number }) {
  const freelancerName =
    item.freelancer.displayName ?? item.freelancer.username ?? 'Freelancer';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link
        href={`/services/${item.slug}`}
        className={cn(
          'group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] transition-colors hover:border-[var(--color-border-brand)]',
        )}
      >
        <div className="relative h-32 w-full bg-[var(--color-background-tertiary)]">
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImageUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--color-text-tertiary)]">
              <Sparkles className="size-8" />
            </div>
          )}
          <Badge
            variant="default"
            className="absolute left-3 top-3 backdrop-blur-md"
          >
            {item.category}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-1 font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
            {item.title}
          </h3>
          <p className="line-clamp-2 text-sm text-[var(--color-text-secondary)]">
            {item.tagline}
          </p>
          <div className="mt-auto flex items-center gap-2">
            <UserAvatar
              name={freelancerName}
              imageUrl={item.freelancer.avatarUrl}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-secondary)]">
              {freelancerName}
            </span>
            {item.reviewCount > 0 && item.avgRating ? (
              <span className="inline-flex items-center gap-1 text-xs">
                <Star className="size-3 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {Number(item.avgRating).toFixed(1)}
                </span>
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2 text-xs">
            <span className="text-[var(--color-text-tertiary)]">
              From{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatUSD(item.priceFrom)}
              </span>
            </span>
            <ArrowRight className="size-3.5 text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-brand-primary)]" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
