'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, ExternalLink, Loader2, ArrowRight, XCircle } from 'lucide-react';
import { api } from '@/lib/trpc/client';
import { Button, Badge, EmptyState as SharedEmptyState, Skeleton, UserAvatar } from '@/components/ui';
import { formatUSD } from '@/lib/utils';
import { toast } from 'sonner';

type StatusInfo = { label: string; variant: 'success' | 'warning' | 'default' | 'brand' };

const DEFAULT_PROPOSAL_STATUS: StatusInfo = { label: 'Pending', variant: 'brand' };

const STATUS_MAP: Record<string, StatusInfo> = {
  pending: DEFAULT_PROPOSAL_STATUS,
  shortlisted: { label: 'Shortlisted', variant: 'success' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'warning' },
  withdrawn: { label: 'Withdrawn', variant: 'default' },
};

export default function DashboardProposalsPage() {
  const proposals = api.proposal.myProposals.useQuery();
  const withdrawMut = api.proposal.withdraw.useMutation({
    onSuccess: () => {
      toast.success('Proposal withdrawn');
      proposals.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            My Proposals
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Track proposals you&apos;ve submitted and their status.
          </p>
        </div>
        <Link href="/jobs">
          <Button variant="secondary" leftIcon={<Search />}>
            Browse Jobs
          </Button>
        </Link>
      </div>

      <div className="mt-8">
        {proposals.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : proposals.isError ? (
          <EmptyBox
            title="Couldn't load your proposals"
            description={proposals.error.message}
            action={<Button variant="secondary" onClick={() => proposals.refetch()}>Try again</Button>}
          />
        ) : !proposals.data?.length ? (
          <EmptyBox
            title="No proposals yet"
            description="Start applying to jobs and your proposals will show up here."
            action={
              <Link href="/jobs">
                <Button leftIcon={<Search />}>Browse jobs</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {proposals.data.map((proposal, i) => {
              const statusInfo = STATUS_MAP[proposal.status] ?? DEFAULT_PROPOSAL_STATUS;
              const canWithdraw = proposal.status === 'pending';
              return (
                <motion.div
                  key={proposal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {new Date(proposal.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/proposals/${proposal.id}`}
                        className="mt-2 block truncate font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-brand-primary)]"
                      >
                        {proposal.job.title}
                      </Link>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        Your bid: <span className="font-semibold text-[var(--color-text-primary)]">{formatUSD(proposal.bidAmount)}</span>
                        <span className="ml-1 text-[var(--color-text-tertiary)]">
                          {proposal.bidType === 'hourly' ? '/ hour' : 'fixed'}
                        </span>
                        <span className="mx-2 text-[var(--color-text-disabled)]">·</span>
                        Est. {proposal.estimatedDuration}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/jobs/${proposal.job.slug}`}>
                        <Button size="sm" variant="ghost" leftIcon={<ExternalLink />}>
                          View Job
                        </Button>
                      </Link>
                      {canWithdraw && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => withdrawMut.mutate({ id: proposal.id })}
                          isLoading={withdrawMut.isPending}
                          className="text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                        >
                          <XCircle className="size-4 mr-1" />
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
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
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
      <SharedEmptyState
        variant="proposals"
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}
