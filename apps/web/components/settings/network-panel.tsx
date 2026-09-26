'use client';

import { ArrowUpRight } from 'lucide-react';
import { getAddresses } from '@forj/contracts';
import { APP_CHAIN_ID, IS_MAINNET } from '@/lib/chain';
import { api } from '@/lib/trpc/client';

/**
 * Plain-language view of the chain Forj settles on. Everything here is
 * public; it exists so a normal user can check where their money goes
 * without reading docs.
 */
export function NetworkPanel({ wallet }: { wallet: string | null }) {
  const config = api.escrow.config.useQuery(undefined, { staleTime: 5 * 60_000 });
  const addresses = (() => {
    try {
      return getAddresses(APP_CHAIN_ID);
    } catch {
      return null;
    }
  })();
  const explorer = IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org';
  const link = (address: string | null | undefined) =>
    address ? (
      <a
        href={`${explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 font-mono text-xs underline decoration-[var(--color-border-strong)] underline-offset-2 hover:decoration-[var(--color-brand-primary)]"
      >
        {address.slice(0, 8)}…{address.slice(-6)}
        <ArrowUpRight className="size-3" aria-hidden />
        <span className="sr-only">(opens block explorer)</span>
      </a>
    ) : (
      <span className="text-[var(--color-text-tertiary)]">—</span>
    );

  const rows: Array<[string, React.ReactNode, string?]> = [
    ['Network', `${IS_MAINNET ? 'Base' : 'Base Sepolia'} · chain ${APP_CHAIN_ID}`, IS_MAINNET ? undefined : 'A test network. Balances here have no monetary value.'],
    ['Settlement token', link(addresses?.usdc), 'USDC issued by Circle. All escrows are denominated in it.'],
    [
      'Escrow contract',
      link(config.data?.enabled ? config.data.escrowAddress : addresses?.escrowV3 || addresses?.escrow),
      'ForjEscrowV3 holds funded contracts. Forj cannot move escrowed USDC outside the contract’s rules.',
    ],
    ['Your payout wallet', link(wallet), 'Where releases and refunds are paid. It is managed by your Forj sign-in.'],
    ['Network fees', 'Sponsored', 'With Forj’s smart wallet, network fees are paid for you. External wallets pay their own.'],
  ];

  return (
    <div>
      {!IS_MAINNET ? (
        <p className="mb-6 border-l-2 border-[var(--color-warning)] pl-4 text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text-primary)]">You are on the public testnet.</span> Use test USDC
          only. Contracts, payouts and reputation here are for testing.
        </p>
      ) : null}
      <dl className="border-t border-[var(--color-border-default)]">
        {rows.map(([term, value, hint]) => (
          <div key={term} className="grid gap-1 border-b border-[var(--color-border-default)] py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
            <dt className="text-sm font-medium text-[var(--color-text-primary)]">{term}</dt>
            <dd className="min-w-0 text-sm text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
              {value}
              {hint ? <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">{hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
