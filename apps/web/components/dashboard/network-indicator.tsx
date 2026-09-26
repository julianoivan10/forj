import { APP_CHAIN_ID, IS_MAINNET } from '@/lib/chain';
import { cn } from '@/lib/utils';

/**
 * Which network the app settles on. Testnet is stated plainly, in words,
 * so nobody mistakes test USDC for real money.
 */
export function NetworkIndicator({
  className,
  compact = false,
  stacked = false,
}: {
  className?: string;
  compact?: boolean;
  /** Two lines (network, then note) for narrow columns like the rail. */
  stacked?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex gap-x-2 font-mono text-[11px] text-[var(--color-text-secondary)]',
        stacked ? 'flex-wrap items-baseline' : 'items-center',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0', IS_MAINNET ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]')}
      />
      {IS_MAINNET ? 'Base' : 'Base Sepolia'}
      {!compact ? (
        <span className={cn('text-[var(--color-text-tertiary)]', stacked && 'basis-full pl-3.5')}>
          {stacked ? '' : '· '}
          {IS_MAINNET ? `chain ${APP_CHAIN_ID}` : 'testnet, test USDC'}
        </span>
      ) : null}
    </span>
  );
}
