'use client';

import Link from 'next/link';
import { Briefcase, Clock, Users } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { Badge, UserAvatar } from '@/components/ui';
import { DURATION_LABELS, EXPERIENCE_LABELS, JOB_CATEGORIES } from '@/lib/constants';
import { formatUSD } from '@/lib/utils';
import { BookmarkButton } from './bookmark-button';
import { JobCoverFallback } from './job-cover-fallback';

type JobListItem = inferRouterOutputs<AppRouter>['job']['list']['items'][number];

interface JobCardProps {
  job: JobListItem;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function formatPostedAt(date: string | Date): string {
  const target = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - target.getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const n = Math.max(1, Math.floor(diff / MINUTE));
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const n = Math.max(1, Math.floor(diff / HOUR));
    return `${n} hour${n === 1 ? '' : 's'} ago`;
  }
  if (diff < WEEK) {
    const n = Math.max(1, Math.floor(diff / DAY));
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  if (diff < MONTH) {
    const n = Math.max(1, Math.floor(diff / WEEK));
    return `${n} week${n === 1 ? '' : 's'} ago`;
  }
  if (diff < YEAR) {
    const n = Math.max(1, Math.floor(diff / MONTH));
    return `${n} month${n === 1 ? '' : 's'} ago`;
  }
  const n = Math.max(1, Math.floor(diff / YEAR));
  return `${n} year${n === 1 ? '' : 's'} ago`;
}

function formatBudget(type: 'fixed' | 'hourly', min: string, max: string): string {
  const low = formatUSD(min);
  const high = formatUSD(max);
  const range = low === high ? low : `${low} – ${high}`;
  return type === 'hourly' ? `${range}/hr` : range;
}

export function JobCard({ job }: JobCardProps) {
  const category = JOB_CATEGORIES.find((c) => c.value === job.category);
  const clientName = job.client.displayName ?? job.client.username ?? 'Client';

  // Read coverImageUrl loosely — the column exists on the schema but the
  // tRPC select set may not always include it (older queries). Treat as
  // optional rather than asserting on the type.
  const coverImageUrl = (job as unknown as { coverImageUrl?: string | null }).coverImageUrl;

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] transition-all duration-200 hover:border-[var(--color-border-brand)]"
    >
      {/* Cover — image when uploaded, otherwise a Bauhaus generative
          shape pattern keyed off job id so each card is visually distinct
          even without uploads. The fallback is intentional brand identity,
          not a generic placeholder. */}
      <div className="relative h-32 w-full overflow-hidden bg-[var(--color-background-tertiary)]">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <JobCoverFallback seed={job.id} category={job.category} />
        )}
        {/* Category chip floating on cover */}
        {category ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-background)]/85 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {category.label}
          </span>
        ) : null}
        {/* Bookmark — top-right corner. `stopPropagation` in BookmarkButton
            keeps the click from cascading into the parent Link navigation. */}
        <div className="absolute right-3 top-3">
          <BookmarkButton jobId={job.id} />
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-[var(--color-text-tertiary)]">
              {formatPostedAt(job.createdAt)}
            </div>
            <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
              {job.title}
            </h3>
          </div>
          <div className="flex flex-col items-end whitespace-nowrap">
            <span className="font-display text-base font-bold tracking-tight text-[var(--color-text-primary)]">
              {formatBudget(job.budgetType, job.budgetMin, job.budgetMax)}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {job.budgetType === 'hourly' ? 'Hourly' : 'Fixed price'}
            </span>
          </div>
        </div>

        <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {job.description}
        </p>

      {job.skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 6).map((skill) => (
            <Badge key={skill} variant="default" className="text-[11px]">
              {skill}
            </Badge>
          ))}
          {job.skills.length > 6 ? (
            <Badge variant="default" className="text-[11px]">
              +{job.skills.length - 6}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--color-text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {DURATION_LABELS[job.duration]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="size-3.5" />
          {EXPERIENCE_LABELS[job.experienceLevel]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" />
          {job.proposalCount} {job.proposalCount === 1 ? 'proposal' : 'proposals'}
        </span>
      </div>

        <div className="mt-1 flex items-center gap-2 border-t border-[var(--color-border-default)] pt-3">
          <UserAvatar name={clientName} imageUrl={job.client.avatarUrl} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
              {clientName}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              WorkScore {Number(job.client.workScore ?? 0).toFixed(0)} · {job.client.badgeTier ?? 'none'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
