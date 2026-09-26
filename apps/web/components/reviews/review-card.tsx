'use client';

import Link from 'next/link';
import * as React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { UserAvatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { StarRating } from './star-rating';

/**
 * Shape we accept from the API. Matches the `reviews` table plus the
 * eager-loaded `reviewer` projection used by the router.
 */
export interface ReviewCardData {
  id: string;
  rating: number;
  comment: string;
  createdAt: string | Date;
  ratingBreakdown?: {
    communication: number;
    quality: number;
    deadline: number;
    professionalism: number;
  } | null;
  reviewer?: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

const BREAKDOWN_LABELS: Array<{
  key: 'communication' | 'quality' | 'deadline' | 'professionalism';
  label: string;
}> = [
  { key: 'communication', label: 'Communication' },
  { key: 'quality', label: 'Quality of work' },
  { key: 'deadline', label: 'Met deadline' },
  { key: 'professionalism', label: 'Professionalism' },
];

const formatDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export interface ReviewCardProps {
  review: ReviewCardData;
  /** Highlight if it's the viewing user's own review. */
  highlight?: boolean;
  className?: string;
}

export function ReviewCard({ review, highlight = false, className }: ReviewCardProps) {
  const [open, setOpen] = React.useState(false);
  const reviewer = review.reviewer;
  const name = reviewer?.displayName ?? reviewer?.username ?? 'Anonymous';
  const hasBreakdown = Boolean(review.ratingBreakdown);

  const avatar = <UserAvatar name={name} imageUrl={reviewer?.avatarUrl} size="md" />;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        // A quoted entry, not a card: a left rule (cobalt for your own review).
        'border-l-2 py-1 pl-5',
        highlight ? 'border-[var(--color-brand-primary)]' : 'border-[var(--color-border-strong)]',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {reviewer?.username ? (
          <Link
            href={`/u/${reviewer.username}`}
            className="shrink-0 transition-opacity hover:opacity-90"
          >
            {avatar}
          </Link>
        ) : (
          <div className="shrink-0">{avatar}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {reviewer?.username ? (
              <Link
                href={`/u/${reviewer.username}`}
                className="truncate font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-brand-primary)]"
              >
                {name}
              </Link>
            ) : (
              <span className="truncate font-semibold text-[var(--color-text-primary)]">
                {name}
              </span>
            )}
            {highlight ? (
              <span className="border border-[var(--color-border-brand)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-brand-primary)]">
                Your review
              </span>
            ) : null}
            <span className="text-xs text-[var(--color-text-tertiary)]">
              · {formatDate(review.createdAt)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <StarRating value={review.rating} readOnly size="sm" />
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {review.rating}.0
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-text-primary)]">
        {review.comment}
      </p>

      {hasBreakdown ? (
        <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', open && 'rotate-180')}
            />
            {open ? 'Hide breakdown' : 'See category ratings'}
          </button>
          {open ? (
            <motion.dl
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 grid gap-2 sm:grid-cols-2"
            >
              {BREAKDOWN_LABELS.map(({ key, label }) => {
                const v = review.ratingBreakdown?.[key] ?? 0;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40 px-3 py-2"
                  >
                    <dt className="text-xs text-[var(--color-text-tertiary)]">{label}</dt>
                    <dd className="flex items-center gap-1.5">
                      <StarRating value={v} readOnly size="sm" />
                    </dd>
                  </div>
                );
              })}
            </motion.dl>
          ) : null}
        </div>
      ) : null}
    </motion.article>
  );
}
