'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Briefcase,
  FileText,
  Wallet,
  TrendingUp,
  ArrowRight,
  Plus,
  Search,
  MessageSquare,
  Star,
  FileSignature,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Badge, EmptyState, Skeleton } from '@/components/ui';
import { ProfileCompleteness } from '@/components/dashboard/profile-completeness';
import { RecoveryNudge } from '@/components/dashboard/recovery-nudge';
import { BADGE_TIER_META } from '@/lib/constants';

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const isFreelancer = user.role === 'freelancer' || user.role === 'both';
  const isClient = user.role === 'client' || user.role === 'both';
  const firstName = (user.displayName ?? user.username ?? 'there').split(' ')[0];
  const tierMeta = BADGE_TIER_META[user.badgeTier as keyof typeof BADGE_TIER_META] ?? BADGE_TIER_META.none;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Welcome header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Welcome back, <span className="text-gradient-brand">{firstName}</span>
        </h1>
        <p className="mt-2 text-base text-[var(--color-text-secondary)]">
          {isFreelancer && isClient
            ? 'Ready to hire or get hired?'
            : isFreelancer
              ? 'Find your next gig and grow your on-chain reputation.'
              : 'Post a job and find the right talent in minutes.'}
        </p>
      </motion.div>

      {/* Profile completeness nudge — auto-hides at 100% or when dismissed */}
      <div className="mt-6">
        <ProfileCompleteness />
      </div>

      {/* Account recovery nudge — orthogonal to profile completeness.
          Shows whenever the user lacks a backup sign-in method AND
          hasn't configured wallet recovery. Auto-dismisses for 30
          days after the user clicks "remind me later". */}
      <div className="mt-4">
        <RecoveryNudge />
      </div>

      {/* Stat cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="WorkScore"
          value={Number(user.workScore ?? 0).toFixed(0)}
          hint={
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: tierMeta.color }} />
              {tierMeta.label} tier
            </span>
          }
        />
        <StatCard
          icon={Briefcase}
          label="Jobs Completed"
          value={String(user.totalJobsCompleted ?? 0)}
        />
        <StatCard
          icon={Wallet}
          label="Total Earned"
          value={`$${Number(user.totalEarned ?? 0).toLocaleString()}`}
          hint="USDC"
        />
        <StatCard
          icon={Star}
          label="Role"
          value={
            user.role === 'both'
              ? 'Freelancer + Client'
              : user.role === 'freelancer'
                ? 'Freelancer'
                : 'Client'
          }
        />
      </div>

      {/* Quick actions */}
      <div className="mt-10">
        <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
          Quick actions
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isClient && (
            <ActionCard
              href="/dashboard/jobs/new"
              icon={Plus}
              title="Post a job"
              description="Describe what you need. Fund escrow when you find the right freelancer."
              primary
            />
          )}
          {isFreelancer && (
            <ActionCard
              href="/jobs"
              icon={Search}
              title="Browse jobs"
              description="Filter by category, budget, and experience to find your fit."
              primary
            />
          )}
          <ActionCard
            href="/dashboard/contracts"
            icon={FileSignature}
            title="Contracts"
            description="View active, completed, and disputed contracts."
          />
          <ActionCard
            href="/dashboard/messages"
            icon={MessageSquare}
            title="Messages"
            description="Chat with clients and freelancers about live engagements."
          />
          {isClient && (
            <ActionCard
              href="/dashboard/jobs"
              icon={Briefcase}
              title="My jobs"
              description="Track posted jobs, review proposals, and fund escrow."
            />
          )}
          {isFreelancer && (
            <ActionCard
              href="/dashboard/proposals"
              icon={FileText}
              title="My proposals"
              description="See which jobs you applied to and their status."
            />
          )}
        </div>
      </div>

      {/* Recent activity placeholder */}
      <div className="mt-10">
        <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
          Recent activity
        </h2>
        <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
          <EmptyState
            variant="contracts"
            title="Nothing here yet"
            description="Your recent contracts, proposals, and activity will appear here once you start using Forj."
            compact
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-tertiary)]">{label}</span>
        <Icon className="size-4 text-[var(--color-text-tertiary)]" />
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{hint}</p>
      ) : null}
    </motion.div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  primary = false,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col rounded-[var(--radius-xl)] border p-6 transition-all duration-200 hover:-translate-y-0.5',
        primary
          ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] hover:shadow-[0_0_30px_var(--color-glow-brand-strong)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-background-secondary)] hover:border-[var(--color-border-strong)]',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-[var(--radius-md)]',
            primary
              ? 'bg-gradient-to-br from-[var(--color-brand-primary)]/30 to-[var(--color-brand-secondary)]/30'
              : 'bg-[var(--color-background-tertiary)]',
          )}
        >
          <Icon className="size-5 text-[var(--color-brand-primary)]" />
        </div>
        <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          {title}
        </h3>
        <ArrowRight className="ml-auto size-4 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-brand-primary)]" />
      </div>
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{description}</p>
    </Link>
  );
}
