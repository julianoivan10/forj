'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { Button, Badge, EmptyState as SharedEmptyState, Skeleton, UserAvatar } from '@/components/ui';
import { formatUSD } from '@/lib/utils';

type StatusInfo = { label: string; variant: 'success' | 'warning' | 'default' | 'brand' };

const DEFAULT_CONTRACT_STATUS: StatusInfo = { label: 'Active', variant: 'brand' };

const STATUS_MAP: Record<string, StatusInfo> = {
  created: { label: 'Created', variant: 'default' },
  funded: { label: 'Funded', variant: 'brand' },
  in_progress: DEFAULT_CONTRACT_STATUS,
  submitted: { label: 'Submitted', variant: 'brand' },
  revision_requested: { label: 'Revision', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  disputed: { label: 'Disputed', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'default' },
  refunded: { label: 'Refunded', variant: 'default' },
};

export default function DashboardContractsPage() {
  const { user } = useAuth();
  const contracts = api.contract.myContracts.useQuery();

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          Contracts
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          All your active, completed, and past contracts in one place.
        </p>
      </div>

      <div className="mt-8">
        {contracts.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : contracts.isError ? (
          <EmptyBox
            title="Couldn't load contracts"
            description={contracts.error.message}
            action={<Button variant="secondary" onClick={() => contracts.refetch()}>Try again</Button>}
          />
        ) : !contracts.data?.length ? (
          <EmptyBox
            title="No contracts yet"
            description="Contracts are created once a proposal is accepted and escrow is funded. Start by posting or applying to jobs."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {contracts.data.map((contract, i) => {
              const statusInfo = STATUS_MAP[contract.status] ?? DEFAULT_CONTRACT_STATUS;
              const isClient = contract.clientId === user?.id;
              const counterparty = isClient ? contract.freelancer : contract.client;
              const counterpartyLabel = isClient ? 'Freelancer' : 'Client';

              return (
                <motion.div
                  key={contract.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/dashboard/contracts/${contract.id}`}
                    className="group block rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5 transition-all hover:border-[var(--color-border-strong)] hover:bg-[var(--color-background-tertiary)]/40"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          <span className="text-xs text-[var(--color-text-tertiary)]">
                            {new Date(contract.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <p className="mt-2 truncate font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
                          {contract.job.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-text-secondary)]">
                          <UserAvatar
                            name={counterparty.displayName ?? counterparty.username ?? ''}
                            imageUrl={counterparty.avatarUrl}
                            size="sm"
                          />
                          <span>
                            {counterpartyLabel}:{' '}
                            <span className="font-medium text-[var(--color-text-primary)]">
                              {counterparty.displayName ?? counterparty.username}
                            </span>
                          </span>
                          <span className="mx-1 text-[var(--color-text-disabled)]">·</span>
                          <span className="font-semibold text-[var(--color-text-primary)]">
                            {formatUSD(contract.totalAmount)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
                          Details
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyBox({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  // Delegates to the shared Bauhaus illustration variant. Wrapping
  // div keeps the dashed border framing every empty surface here
  // shares with the rest of the dashboard.
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
      <SharedEmptyState
        variant="contracts"
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}
