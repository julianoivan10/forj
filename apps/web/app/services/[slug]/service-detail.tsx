'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Clock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { Badge, Button, Skeleton, UserAvatar } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { BADGE_TIER_META } from '@/lib/constants';
import { cn, formatUSD } from '@/lib/utils';

/**
 * Public service detail. Three-tier pricing card on the right, description
 * + freelancer info on the left. The "Order now" CTA opens a conversation
 * with the freelancer pre-filled with the picked tier — full direct-buy
 * (escrow funding from this page) is the next iteration; for now this
 * funnel uses messaging as the handshake before the contract is created.
 */
export function ServiceDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const q = api.service.getBySlug.useQuery({ slug }, { retry: false });
  const [activeTier, setActiveTier] = useState(0);

  const purchaseMut = api.service.purchase.useMutation({
    onSuccess: ({ contractId }) => {
      toast.success('Order created — fund the escrow to begin');
      router.push(`/dashboard/contracts/${contractId}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (q.isPending) {
    return <DetailSkeleton />;
  }
  if (q.isError || !q.data) {
    return <NotFound />;
  }

  const service = q.data;
  const f = service.freelancer;
  const isOwn = user?.id === f.id;
  const tiers = service.tiers ?? [];
  const tier = tiers[Math.min(activeTier, tiers.length - 1)];
  const tier_label = tier?.label ?? 'tier';
  const tier_price = tier?.price ?? 0;
  const tier_days = tier?.deliveryDays ?? 0;
  const tier_revisions = tier?.revisions ?? 0;
  const tier_features = tier?.features ?? [];
  const tierMeta = BADGE_TIER_META[f.badgeTier as keyof typeof BADGE_TIER_META];

  /**
   * Direct-buy flow: the backend atomically creates job + proposal +
   * contract (status=`created`), then the buyer is redirected to the
   * contract detail page where the existing wallet flow kicks in to fund
   * the USDC escrow. One click → one signed approve+fund pair → work begins.
   */
  const handleOrder = () => {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(`/services/${slug}`)}`);
      return;
    }
    if (isOwn) {
      toast.error("You can't order your own service");
      return;
    }
    if (tier == null) return;
    purchaseMut.mutate({
      serviceId: service.id,
      tierIndex: activeTier,
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/services"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> Back to services
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Main column */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6"
        >
          {/* Header card */}
          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]">
            <div className="aspect-[16/9] w-full bg-[var(--color-glow-brand)]">
              {service.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={service.coverImageUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Sparkles className="size-10 text-[var(--color-text-tertiary)]" />
                </div>
              )}
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="brand" className="capitalize">
                  {service.category}
                </Badge>
                {service.reviewCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                    <Star className="size-3 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {Number(service.avgRating).toFixed(1)}
                    </span>
                    <span>({service.reviewCount} reviews)</span>
                  </span>
                ) : (
                  <Badge variant="default" className="text-[10px]">
                    New
                  </Badge>
                )}
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  · {service.ordersCompleted} orders completed
                </span>
              </div>
              <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
                {service.title}
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)] sm:text-base">
                {service.tagline}
              </p>
            </div>
          </div>

          {/* Description */}
          <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
            <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              About this service
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {service.description}
            </p>
            {service.skills.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {service.skills.map((s) => (
                  <Badge key={s} variant="default" className="text-[11px]">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : null}
          </section>

          {/* Freelancer card */}
          <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
            <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              About the freelancer
            </h2>
            <div className="mt-4 flex items-center gap-4">
              <UserAvatar
                name={f.displayName ?? f.username ?? 'Freelancer'}
                imageUrl={f.avatarUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={f.username ? `/u/${f.username}` : '#'}
                  className="font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-brand-primary)]"
                >
                  {f.displayName ?? f.username ?? 'Freelancer'}
                </Link>
                {f.username ? (
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    @{f.username}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: tierMeta?.color ?? '#888' }}
                    />
                    {tierMeta?.label ?? 'Newcomer'} · WorkScore{' '}
                    {Number(f.workScore ?? 0).toFixed(0)}
                  </span>
                  {f.country ? <span>· {f.country}</span> : null}
                  <span>· {f.totalJobsCompleted} jobs delivered</span>
                </div>
              </div>
            </div>
            {f.bio ? (
              <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{f.bio}</p>
            ) : null}
          </section>
        </motion.div>

        {/* Sidebar — pricing card */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:sticky lg:top-24"
        >
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
            {/* Tier tabs */}
            {tiers.length > 1 ? (
              <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-tertiary)] p-1">
                {tiers.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveTier(i)}
                    className={cn(
                      'flex-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors',
                      activeTier === i
                        ? 'bg-[var(--color-background-secondary)] text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4">
              <p className="font-display text-3xl font-extrabold text-[var(--color-text-primary)]">
                {formatUSD(tier_price)}
                <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">USDC</span>
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                + 5% platform fee, locked in escrow on Base
              </p>
            </div>

            <ul className="mt-4 flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4 text-sm">
              <li className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                <Clock className="size-3.5 text-[var(--color-brand-primary)]" />
                <span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {tier_days} {tier_days === 1 ? 'day' : 'days'}
                  </span>{' '}
                  delivery
                </span>
              </li>
              <li className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                <RefreshCw className="size-3.5 text-[var(--color-brand-primary)]" />
                <span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {tier_revisions === -1 ? 'Unlimited' : tier_revisions}
                  </span>{' '}
                  revisions
                </span>
              </li>
            </ul>

            <ul className="mt-4 flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-4 text-sm">
              {tier_features.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[var(--color-text-secondary)]"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-2">
              {isOwn ? (
                <Link href={`/dashboard/services`}>
                  <Button variant="secondary" className="w-full">
                    Manage your service
                  </Button>
                </Link>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleOrder}
                  isLoading={purchaseMut.isPending}
                  leftIcon={<ShieldCheck />}
                >
                  Order now &middot; {formatUSD(tier_price)}
                </Button>
              )}
              <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">
                Funds lock in USDC escrow on Base. Released only when you approve.
              </p>
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Skeleton className="mb-6 h-5 w-32" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-72 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-44 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-32 rounded-[var(--radius-xl)]" />
        </div>
        <Skeleton className="h-96 rounded-[var(--radius-xl)]" />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <Sparkles className="size-6 text-[var(--color-text-tertiary)]" />
      </div>
      <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">
        Service not found
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)]">
        It may have been removed or paused by the freelancer.
      </p>
      <Link href="/services" className="mt-2 text-sm text-[var(--color-brand-primary)] hover:underline">
        Browse other services →
      </Link>
    </div>
  );
}
