'use client';

import { useMemo, useState } from 'react';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { ContractsLedger } from '@/components/console/console-view';
import { useAuth } from '@/hooks/use-auth';
import { isActiveContract } from '@/lib/contract-status';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

type Filter = 'active' | 'closed' | 'all';

export default function DashboardContractsPage() {
  const { user } = useAuth();
  const contracts = api.contract.myContracts.useQuery();
  const [filter, setFilter] = useState<Filter>('active');
  const now = useMemo(() => new Date(), []);

  const all = contracts.data ?? [];
  const activeCount = all.filter(isActiveContract).length;
  const shown = all.filter((c) => (filter === 'all' ? true : filter === 'active' ? isActiveContract(c) : !isActiveContract(c)));

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'closed', label: 'Closed', count: all.length - activeCount },
    { key: 'all', label: 'All', count: all.length },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[var(--color-rule)] pb-5">
        <p className="label-mono">Contracts</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-4xl">
          Every agreement, and where its money is.
        </h1>
      </header>

      <div role="tablist" aria-label="Filter contracts" className="mt-6 flex gap-6 border-b border-[var(--color-border-default)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              '-mb-px min-h-11 border-b-2 text-sm transition-colors',
              filter === t.key
                ? 'border-[var(--color-brand-primary)] font-semibold text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {t.label} <span className="font-mono text-xs text-[var(--color-text-tertiary)] tnum">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-2">
        {contracts.isPending ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : contracts.isError ? (
          <EmptyState
            variant="contracts"
            title="Couldn't load your contracts"
            description={contracts.error.message}
            action={<Button variant="secondary" onClick={() => contracts.refetch()}>Try again</Button>}
            className="mt-6"
          />
        ) : shown.length === 0 ? (
          <EmptyState
            variant="contracts"
            title={filter === 'active' ? 'No contracts in progress.' : filter === 'closed' ? 'No closed contracts yet.' : 'No contracts yet.'}
            description="A contract starts when a proposal is accepted or a service is ordered. Funding it locks the payment in escrow."
            className="mt-6"
          />
        ) : user ? (
          <ContractsLedger contracts={shown} userId={user.id} now={now} />
        ) : null}
      </div>
    </div>
  );
}
