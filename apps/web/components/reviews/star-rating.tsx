'use client';

import { Star } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A 1-5 star rating control.
 *
 * - **Display mode** (`readOnly`): just renders filled stars. No interaction.
 * - **Interactive mode**: clickable stars with hover preview. The hovered
 *   value temporarily overrides `value` so the user sees what they're about
 *   to commit to before clicking.
 *
 * Half-stars are intentionally not supported — keeping it integer 1-5 keeps
 * the WorkScore math simple (`rating × 20`) and matches the API schema.
 */
export interface StarRatingProps {
  /** Current rating value, 0 = unrated. Always integer 0-5. */
  value: number;
  /** Called with the picked rating (1-5) when a star is clicked. */
  onChange?: (next: number) => void;
  /** Read-only mode — no hover, no click, no a11y inputs. */
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Optional label for screen readers (e.g. "Communication rating"). */
  ariaLabel?: string;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<StarRatingProps['size']>, string> = {
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-7',
};

const GAP_CLASS: Record<NonNullable<StarRatingProps['size']>, string> = {
  sm: 'gap-0.5',
  md: 'gap-1',
  lg: 'gap-1.5',
};

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 'md',
  ariaLabel,
  className,
}: StarRatingProps) {
  const [hover, setHover] = React.useState<number>(0);
  // While hovering, render the hover value instead of the committed value so
  // the user previews their pick before clicking.
  const display = hover || value;

  if (readOnly) {
    return (
      <div
        className={cn('inline-flex items-center', GAP_CLASS[size], className)}
        role="img"
        aria-label={ariaLabel ?? `Rating: ${value} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              SIZE_CLASS[size],
              'transition-colors',
              n <= display
                ? 'fill-[var(--color-warning)] text-[var(--color-warning)]'
                : 'text-[var(--color-border-strong)]',
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('inline-flex items-center', GAP_CLASS[size], className)}
      role="radiogroup"
      aria-label={ariaLabel ?? 'Rating'}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const isOn = n <= display;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange?.(n)}
            className={cn(
              'rounded-[var(--radius-sm)] p-0.5 transition-transform',
              'hover:scale-110 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]',
            )}
          >
            <Star
              className={cn(
                SIZE_CLASS[size],
                'transition-colors',
                isOn
                  ? 'fill-[var(--color-warning)] text-[var(--color-warning)]'
                  : 'text-[var(--color-border-strong)] hover:text-[var(--color-warning)]/60',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
