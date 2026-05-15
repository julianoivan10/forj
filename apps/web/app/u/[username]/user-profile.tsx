'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, CheckCircle2, Globe, Link2, MessageSquare, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import {
  Badge,
  Button,
  Skeleton,
  UserAvatar,
} from '@/components/ui';
import { ReviewCard, StarRating } from '@/components/reviews';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { BADGE_TIER_META } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { formatUSD, formatUSDC } from '@/lib/utils';

type PublicUser = inferRouterOutputs<AppRouter>['user']['getByUsername'];

interface UserProfileProps {
  username: string;
}

export function UserProfile({ username }: UserProfileProps) {
  const { user: me } = useAuth();
  const userQuery = api.user.getByUsername.useQuery(
    { username },
    { retry: false },
  );

  if (userQuery.isLoading) {
    return <ProfileSkeleton />;
  }

  if (userQuery.error || !userQuery.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-10 text-center">
        <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
          Profile not found
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          No user with the username <span className="font-mono">@{username}</span> exists on Forj.
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-flex items-center gap-1 text-sm text-[var(--color-brand-primary)] hover:underline"
        >
          Browse jobs instead →
        </Link>
      </div>
    );
  }

  const user = userQuery.data;
  const isSelf = me?.id === user.id;
  const isFreelancer = user.role === 'freelancer' || user.role === 'both';
  const isClient = user.role === 'client' || user.role === 'both';
  const badge = BADGE_TIER_META[user.badgeTier];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 flex flex-col gap-8">
        <ProfileHeader user={user} isSelf={isSelf} />
        {user.bio ? (
          <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              About
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
              {user.bio}
            </p>
          </section>
        ) : null}

        {isFreelancer && user.skills.length > 0 ? (
          <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Skills
            </h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {user.skills.map((s) => (
                <Badge key={s} variant="default" className="text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        <ReviewsSection userId={user.id} />

        {isClient ? <ClientJobsSection clientId={user.id} /> : null}
      </div>

      <aside className="flex flex-col gap-4">
        <StatsCard user={user} badge={badge} />
        {isFreelancer && user.hourlyRate ? (
          <RateCard hourlyRate={user.hourlyRate} />
        ) : null}
      </aside>
    </div>
  );
}

function ProfileHeader({
  user,
  isSelf,
}: {
  user: PublicUser;
  isSelf: boolean;
}) {
  return (
    <header className="flex flex-col gap-5 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 sm:flex-row sm:items-center">
      <UserAvatar
        name={user.displayName}
        imageUrl={user.avatarUrl}
        size="xl"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-display text-2xl font-bold text-[var(--color-text-primary)]">
            {user.displayName}
          </h1>
          {user.isVerified ? (
            <CheckCircle2 className="size-5 shrink-0 text-[var(--color-brand-primary)]" aria-label="Verified" />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-[var(--color-text-tertiary)]">
          @{user.username}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="size-3.5 text-[var(--color-text-tertiary)]" />
            {/* Activity-derived label. Falls back to the declared role only
                when there's no completed work yet — once they have on-chain
                history, that's a stronger signal than what they said at signup. */}
            {user.totalJobsCompleted > 0
              ? `Freelancer · ${user.totalJobsCompleted} ${user.totalJobsCompleted === 1 ? 'job' : 'jobs'} delivered`
              : user.role === 'both'
                ? 'Client & Freelancer'
                : user.role === 'freelancer'
                  ? 'Freelancer'
                  : 'Client'}
          </span>
          {user.country ? (
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5 text-[var(--color-text-tertiary)]" />
              {user.country}
            </span>
          ) : null}
          <span className="text-[var(--color-text-tertiary)]">
            Joined {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ShareProfileButton username={user.username} />
        {isSelf ? (
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              Edit profile
            </Button>
          </Link>
        ) : (
          <MessageButton userId={user.id} />
        )}
      </div>
    </header>
  );
}

/**
 * Tiny share button — copies the canonical profile URL to clipboard. Shown
 * to everyone (the profile owner can share their own link, visitors can
 * share a freelancer they want to vouch for). The on-chain proof page is
 * the deeper share surface, but a profile share is the hub link.
 */
function ShareProfileButton({ username }: { username: string | null }) {
  if (!username) return null;
  const handleClick = async () => {
    const url = `${window.location.origin}/u/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied');
    } catch {
      toast.error("Couldn't copy — clipboard access blocked");
    }
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      leftIcon={<Link2 />}
      aria-label="Copy profile link"
    >
      Share
    </Button>
  );
}

function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const utils = api.useUtils();
  const handleClick = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    try {
      const result = await utils.message.getOrStart.fetch({ userId });
      router.push(`/dashboard/messages/${encodeURIComponent(result.conversationId)}`);
    } catch (err) {
      // Surface the error via a redirect to the inbox instead of silently failing.
      logger.error('profile/message-start', 'Failed to start conversation', err);
      router.push('/dashboard/messages');
    }
  };
  return (
    <Button size="sm" leftIcon={<MessageSquare />} onClick={handleClick}>
      Message
    </Button>
  );
}

function StatsCard({
  user,
  badge,
}: {
  user: PublicUser;
  badge: (typeof BADGE_TIER_META)[keyof typeof BADGE_TIER_META];
}) {
  const workScore = Number(user.workScore ?? 0);
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Reputation
      </h2>
      <div className="mt-4 flex items-center gap-3">
        <div
          className="flex size-12 items-center justify-center rounded-[var(--radius-md)] border"
          style={{ borderColor: badge.color, boxShadow: `0 0 18px ${badge.color}33` }}
        >
          <Star className="size-5" style={{ color: badge.color }} />
        </div>
        <div>
          <div className="font-display text-2xl font-bold leading-none text-[var(--color-text-primary)]">
            {workScore.toFixed(0)}
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            WorkScore · {badge.label}
          </div>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <StatRow label="Jobs completed" value={user.totalJobsCompleted.toString()} />
        <StatRow label="Total earned" value={formatUSD(user.totalEarned)} />
      </dl>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-3">
      <dt className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-display font-semibold text-[var(--color-text-primary)]">
        {value}
      </dd>
    </div>
  );
}

function RateCard({ hourlyRate }: { hourlyRate: string }) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Hourly rate
      </h2>
      <p className="mt-3 font-display text-2xl font-bold text-[var(--color-text-primary)]">
        ${formatUSDC(hourlyRate)}
        <span className="ml-1 text-sm font-normal text-[var(--color-text-tertiary)]">/hr</span>
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Paid in USDC on Base.
      </p>
    </section>
  );
}

/**
 * Reviews section on a public profile.
 *
 * Two queries fire in parallel:
 *  - `statsByUser` for the summary header (cheap aggregate)
 *  - `listByUser` for the actual rows
 *
 * The header shows the averaged rating prominently plus a 4-row category
 * breakdown so visitors can see *why* someone has a high WorkScore — purely
 * an overall score is uninformative without context.
 *
 * Pagination is client-side: we render 5 by default and let the user
 * "Show all" if there are more. At the volume reviews grow on a freelance
 * platform (typical: tens, not thousands per user), this avoids a
 * server-paginated endpoint complication for the MVP.
 */
function ReviewsSection({ userId }: { userId: string }) {
  const statsQuery = api.review.statsByUser.useQuery({ userId });
  const reviewsQuery = api.review.listByUser.useQuery({ userId });
  const [showAll, setShowAll] = useState(false);

  const isLoading = statsQuery.isLoading || reviewsQuery.isLoading;

  if (isLoading) {
    return (
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
        <Skeleton className="h-4 w-24" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full rounded-[var(--radius-md)]" />
          <Skeleton className="h-32 w-full rounded-[var(--radius-md)]" />
          <Skeleton className="h-32 w-full rounded-[var(--radius-md)]" />
        </div>
      </section>
    );
  }

  const reviews = reviewsQuery.data ?? [];
  const stats = statsQuery.data;
  const visible = showAll ? reviews : reviews.slice(0, 5);
  const hasMore = reviews.length > 5;

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Reviews {reviews.length > 0 ? `· ${reviews.length}` : ''}
        </h2>
      </div>

      {reviews.length === 0 || !stats || stats.total === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/30 px-6 py-10 text-center">
          <Star className="size-6 text-[var(--color-text-tertiary)]" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            No reviews yet
          </p>
          <p className="max-w-sm text-xs text-[var(--color-text-tertiary)]">
            Reviews appear here after a contract is completed and the other party
            leaves feedback.
          </p>
        </div>
      ) : (
        <>
          <ReviewSummary stats={stats} />
          <ul className="mt-5 flex flex-col gap-4">
            {visible.map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show less' : `Show all ${reviews.length} reviews`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Aggregate header — big number + 4-row breakdown bar chart.
 * Bar widths are `(avg / 5) * 100%` so a 4.5 average renders 90% wide.
 */
function ReviewSummary({
  stats,
}: {
  stats: NonNullable<inferRouterOutputs<AppRouter>['review']['statsByUser']>;
}) {
  const rows: Array<{ key: keyof typeof stats.breakdown; label: string }> = [
    { key: 'communication', label: 'Communication' },
    { key: 'quality', label: 'Quality' },
    { key: 'deadline', label: 'Met deadline' },
    { key: 'professionalism', label: 'Professionalism' },
  ];
  return (
    <div className="mt-4 grid gap-5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40 p-5 sm:grid-cols-[180px_1fr] sm:gap-6">
      <div className="flex flex-col items-center justify-center gap-2 border-b border-[var(--color-border-subtle)] pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
        <div className="font-display text-4xl font-extrabold leading-none text-[var(--color-text-primary)]">
          {stats.avgRating.toFixed(1)}
        </div>
        <StarRating value={Math.round(stats.avgRating)} readOnly size="md" />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Based on {stats.total} review{stats.total === 1 ? '' : 's'}
        </p>
      </div>
      <dl className="flex flex-col gap-2.5">
        {rows.map(({ key, label }) => {
          const v = stats.breakdown[key] ?? 0;
          const pct = Math.max(0, Math.min(100, (v / 5) * 100));
          return (
            <div key={key} className="grid grid-cols-[120px_1fr_36px] items-center gap-3">
              <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
              <dd className="h-1.5 overflow-hidden rounded-full bg-[var(--color-background-elevated)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-primary)] to-[var(--color-brand-accent)]"
                  style={{ width: `${pct}%` }}
                />
              </dd>
              <dd className="text-right text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
                {v.toFixed(1)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function ClientJobsSection({ clientId }: { clientId: string }) {
  const jobsQuery = api.job.publicByClient.useQuery({ clientId, limit: 6 });

  if (jobsQuery.isLoading) {
    return (
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </section>
    );
  }

  const jobs = jobsQuery.data ?? [];
  if (jobs.length === 0) return null;

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Recent jobs posted · {jobs.length}
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/jobs/${job.slug}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-3 transition-colors hover:border-[var(--color-border-brand)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {job.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                  {job.proposalCount} {job.proposalCount === 1 ? 'proposal' : 'proposals'} ·{' '}
                  <span className="capitalize">{job.status.replace('_', ' ')}</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                  {formatUSD(job.budgetMin)} – {formatUSD(job.budgetMax)}
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  {job.budgetType === 'hourly' ? 'Hourly' : 'Fixed'}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-8">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
          <div className="flex items-center gap-5">
            <Skeleton className="size-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
        <Skeleton className="h-40 w-full rounded-[var(--radius-xl)]" />
        <Skeleton className="h-40 w-full rounded-[var(--radius-xl)]" />
      </div>
      <Skeleton className="h-60 w-full rounded-[var(--radius-xl)]" />
    </div>
  );
}
