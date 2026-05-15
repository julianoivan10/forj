'use client';

import * as React from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button, Label, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { StarRating } from './star-rating';

/**
 * Shape that matches `review.create` mutation input on the API. The form
 * owns its own state — parent just receives a fully-validated payload via
 * `onSubmit` and decides what to do with it (call the mutation, close a
 * modal, etc).
 */
export interface ReviewFormValue {
  rating: number;
  comment: string;
  ratingBreakdown: {
    communication: number;
    quality: number;
    deadline: number;
    professionalism: number;
  };
  isPublic: boolean;
}

export interface ReviewFormProps {
  /** Async submit. Resolves with success/failure; form clears on success. */
  onSubmit: (value: ReviewFormValue) => Promise<void> | void;
  /** Disable the entire form (e.g. while parent mutation is in-flight). */
  isSubmitting?: boolean;
  /** Used for context in the heading: "How was working with {name}?". */
  revieweeName?: string;
  className?: string;
}

const BREAKDOWN_FIELDS: Array<{
  key: keyof ReviewFormValue['ratingBreakdown'];
  label: string;
  hint: string;
}> = [
  {
    key: 'communication',
    label: 'Communication',
    hint: 'Were they responsive and clear?',
  },
  {
    key: 'quality',
    label: 'Quality of work',
    hint: 'Did the deliverable meet expectations?',
  },
  {
    key: 'deadline',
    label: 'Met deadline',
    hint: 'Did they deliver on time?',
  },
  {
    key: 'professionalism',
    label: 'Professionalism',
    hint: 'Were they pleasant to work with?',
  },
];

const MIN_COMMENT = 10;
const MAX_COMMENT = 2000;

export function ReviewForm({
  onSubmit,
  isSubmitting = false,
  revieweeName,
  className,
}: ReviewFormProps) {
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [breakdown, setBreakdown] = React.useState<ReviewFormValue['ratingBreakdown']>({
    communication: 0,
    quality: 0,
    deadline: 0,
    professionalism: 0,
  });
  const [isPublic, setIsPublic] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // When the user picks an overall rating before touching breakdown, prefill
  // each sub-rating with the overall. Quality-of-life: most reviewers won't
  // bother nudging individual stars when their overall view is consistent.
  // We only prefill on first overall rating change (when breakdown is all 0s).
  const handleOverallChange = (next: number) => {
    setRating(next);
    setBreakdown((prev) => {
      const allZero = Object.values(prev).every((v) => v === 0);
      if (!allZero) return prev;
      return {
        communication: next,
        quality: next,
        deadline: next,
        professionalism: next,
      };
    });
  };

  const handleBreakdownChange =
    (key: keyof ReviewFormValue['ratingBreakdown']) => (next: number) => {
      setBreakdown((prev) => ({ ...prev, [key]: next }));
    };

  const isValid =
    rating >= 1 &&
    rating <= 5 &&
    comment.trim().length >= MIN_COMMENT &&
    comment.length <= MAX_COMMENT &&
    Object.values(breakdown).every((v) => v >= 1 && v <= 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValid) {
      // Guide the user to whichever field is missing.
      if (rating < 1) {
        setError('Please pick an overall rating.');
      } else if (Object.values(breakdown).some((v) => v < 1)) {
        setError('Please rate every category.');
      } else if (comment.trim().length < MIN_COMMENT) {
        setError(`Tell us a bit more — at least ${MIN_COMMENT} characters.`);
      }
      return;
    }
    try {
      await onSubmit({
        rating,
        comment: comment.trim(),
        ratingBreakdown: breakdown,
        isPublic,
      });
      // Optimistic clear — parent that wants to re-show the form should
      // unmount/remount with key=, but for a one-shot submission this is fine.
      setRating(0);
      setComment('');
      setBreakdown({
        communication: 0,
        quality: 0,
        deadline: 0,
        professionalism: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const charCount = comment.length;
  const charOver = charCount > MAX_COMMENT;
  const charLow = charCount > 0 && charCount < MIN_COMMENT;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-6', className)}
      aria-label="Leave a review"
    >
      {/* Overall rating */}
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/40 px-6 py-5 text-center">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Overall rating
        </p>
        <p className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          {revieweeName ? `How was working with ${revieweeName}?` : 'How was the experience?'}
        </p>
        <StarRating value={rating} onChange={handleOverallChange} size="lg" />
        <span
          className={cn(
            'text-xs font-medium',
            rating > 0
              ? 'text-[var(--color-text-secondary)]'
              : 'text-[var(--color-text-tertiary)]',
          )}
        >
          {rating > 0 ? RATING_DESCRIPTIONS[rating] : 'Tap a star to rate'}
        </span>
      </div>

      {/* Breakdown */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-[var(--color-brand-primary)]" />
          <Label className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Category ratings
          </Label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {BREAKDOWN_FIELDS.map(({ key, label, hint }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
                <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">{hint}</p>
              </div>
              <StarRating
                value={breakdown[key]}
                onChange={handleBreakdownChange(key)}
                size="sm"
                ariaLabel={`${label} rating`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Label htmlFor="review-comment">Your review</Label>
          <span
            className={cn(
              'text-xs',
              charOver
                ? 'text-[var(--color-error)]'
                : charLow
                  ? 'text-[var(--color-warning)]'
                  : 'text-[var(--color-text-tertiary)]',
            )}
          >
            {charCount}/{MAX_COMMENT}
          </span>
        </div>
        <Textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={5}
          placeholder="Share what worked well and what could have been better. Specific examples help future collaborators."
          error={charOver}
          className="resize-none"
          maxLength={MAX_COMMENT + 100}
        />
        <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
          Minimum {MIN_COMMENT} characters. Be honest and constructive — both reviews are
          permanent on the chain of trust.
        </p>
      </div>

      {/* Visibility toggle */}
      <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 transition-colors hover:border-[var(--color-border-default)]">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 size-4 cursor-pointer accent-[var(--color-brand-primary)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            Show this review publicly
          </span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            Public reviews appear on the recipient's profile and contribute to their WorkScore.
            Uncheck to keep this private to the contract.
          </span>
        </span>
      </label>

      {error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]"
        >
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={!isValid || isSubmitting}
          leftIcon={<Send />}
        >
          Submit review
        </Button>
      </div>
    </form>
  );
}

const RATING_DESCRIPTIONS: Record<number, string> = {
  1: 'Poor — I would not recommend',
  2: 'Below average — significant issues',
  3: 'Acceptable — met basic expectations',
  4: 'Great — would work with again',
  5: 'Outstanding — exceeded expectations',
};
