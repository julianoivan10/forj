import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type EmptyVariant =
  | 'jobs'
  | 'proposals'
  | 'contracts'
  | 'services'
  | 'messages'
  | 'notifications'
  | 'reviews'
  | 'search';

/** The ledger-style label shown above an empty section, per content type. */
const LABEL: Record<EmptyVariant, string> = {
  jobs: 'No jobs',
  proposals: 'No proposals',
  contracts: 'No contracts',
  services: 'No services',
  messages: 'No messages',
  notifications: 'No activity',
  reviews: 'No reviews',
  search: 'No results',
};

interface EmptyStateProps {
  variant: EmptyVariant;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * An empty section reads like an empty ledger entry: a ruled block with a
 * mono label, a plain sentence and (optionally) the one action that fills
 * it. No illustration — the next step is the useful part.
 */
export function EmptyState({ variant, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-y border-dashed border-[var(--color-border-strong)]',
        compact ? 'px-1 py-6' : 'px-1 py-10 sm:py-14',
        className,
      )}
    >
      <p className="label-mono">{LABEL[variant]}</p>
      <h3
        className={cn(
          'mt-2 max-w-xl font-display font-semibold tracking-tight text-[var(--color-text-primary)] text-balance',
          compact ? 'text-base' : 'text-xl sm:text-2xl',
        )}
      >
        {title}
      </h3>
      {description ? (
        <p className={cn('mt-2 max-w-xl text-[var(--color-text-secondary)]', compact ? 'text-sm' : 'text-[15px]')}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
