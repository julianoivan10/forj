'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Eye,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Skeleton,
  UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { cn, formatUSD, formatUSDC } from '@/lib/utils';
import {
  DURATION_LABELS,
  EXPERIENCE_LABELS,
  JOB_CATEGORIES,
} from '@/lib/constants';

type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

const STATUS_STYLE: Record<
  ProposalStatus,
  { label: string; variant: 'success' | 'warning' | 'default' | 'brand' }
> = {
  pending: { label: 'Pending', variant: 'default' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'warning' },
  withdrawn: { label: 'Withdrawn', variant: 'warning' },
};

export default function DashboardJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const jobId = params.id;

  const jobQuery = api.job.getById.useQuery({ id: jobId }, { enabled: Boolean(jobId), retry: false });
  const proposalsQuery = api.proposal.listByJob.useQuery(
    { jobId },
    { enabled: Boolean(jobId) && Boolean(user), retry: false },
  );

  const utils = api.useUtils();
  /**
   * Confirm-action modal state. Replaces the old `window.confirm()` dialogs
   * which couldn't be styled and showed the page URL in the title bar.
   */
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'accept'; proposalId: string; freelancerName: string; bid: string }
    | { type: 'reject'; proposalId: string; freelancerName: string }
    | null
  >(null);

  const acceptMut = api.proposal.accept.useMutation({
    onSuccess: () => {
      toast.success('Proposal accepted — a contract has been created.', {
        description: 'Fund the escrow on the contract page to start work.',
      });
      utils.proposal.listByJob.invalidate({ jobId });
      utils.job.getById.invalidate({ id: jobId });
      utils.job.myJobs.invalidate();
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmAction(null);
    },
  });
  const rejectMut = api.proposal.reject.useMutation({
    onSuccess: () => {
      toast.success('Proposal rejected.');
      utils.proposal.listByJob.invalidate({ jobId });
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmAction(null);
    },
  });

  if (jobQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-10 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Job not found
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            It may have been deleted, or the link is wrong.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            leftIcon={<ArrowLeft />}
            onClick={() => router.push('/dashboard/jobs')}
          >
            Back to my jobs
          </Button>
        </div>
      </div>
    );
  }

  const job = jobQuery.data;
  const isOwner = user?.id === job.clientId;

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-10 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Access denied
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            You can only manage jobs you&apos;ve posted.
          </p>
          <Link href={`/jobs/${job.slug}`} className="mt-6 inline-block">
            <Button variant="secondary" leftIcon={<ExternalLink />}>
              View public job page
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const category = JOB_CATEGORIES.find((c) => c.value === job.category);
  const jobClosed = job.status !== 'open';
  const proposals = proposalsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <button
        onClick={() => router.push('/dashboard/jobs')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> My jobs
      </button>

      <header className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={jobClosed ? 'warning' : 'success'}>
            <span className="capitalize">{job.status.replace('_', ' ')}</span>
          </Badge>
          {category ? <Badge variant="default">{category.label}</Badge> : null}
          <span className="text-[var(--color-text-tertiary)]">
            Posted{' '}
            {new Date(job.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {job.title}
        </h1>
        <div className="grid gap-3 sm:grid-cols-4">
          <KeyFact icon={Coins} label="Budget">
            {formatUSD(job.budgetMin)} – {formatUSD(job.budgetMax)}
          </KeyFact>
          <KeyFact icon={Clock} label="Duration">
            {DURATION_LABELS[job.duration]}
          </KeyFact>
          <KeyFact icon={Users} label="Proposals">
            {job.proposalCount}
          </KeyFact>
          <KeyFact icon={Eye} label="Views">
            {job.viewCount}
          </KeyFact>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[var(--color-border-default)] pt-4 text-sm">
          <Link href={`/jobs/${job.slug}`}>
            <Button variant="secondary" size="sm" leftIcon={<ExternalLink />}>
              View public page
            </Button>
          </Link>
          <span className="text-xs text-[var(--color-text-tertiary)] self-center">
            {EXPERIENCE_LABELS[job.experienceLevel]} ·{' '}
            {job.budgetType === 'hourly' ? 'Hourly rate' : 'Fixed price'}
          </span>
        </div>
      </header>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Proposals{' '}
            <span className="text-[var(--color-text-tertiary)]">· {proposals.length}</span>
          </h2>
          {jobClosed ? (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              This job is no longer accepting proposals.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {proposalsQuery.isPending ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-[var(--radius-xl)]" />
            ))
          ) : proposalsQuery.isError ? (
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 text-sm text-[var(--color-text-secondary)]">
              Couldn&apos;t load proposals: {proposalsQuery.error.message}
            </div>
          ) : proposals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-14 text-center">
              <Users className="size-7 text-[var(--color-text-tertiary)]" />
              <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                No proposals yet
              </h3>
              <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
                Freelancers will start applying once they discover your job. Share the public link to
                boost visibility.
              </p>
            </div>
          ) : (
            proposals.map((p) => {
              const style = STATUS_STYLE[p.status];
              const isPending = p.status === 'pending';
              const canAct = isPending && !jobClosed;
              return (
                <article
                  key={p.id}
                  className={cn(
                    'flex flex-col gap-4 rounded-[var(--radius-xl)] border bg-[var(--color-background-secondary)] p-5',
                    p.status === 'accepted'
                      ? 'border-[var(--color-border-brand)] shadow-[0_0_24px_var(--color-glow-brand)]'
                      : 'border-[var(--color-border-default)]',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        name={p.freelancer.displayName ?? p.freelancer.username ?? 'Freelancer'}
                        imageUrl={p.freelancer.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/u/${p.freelancer.username ?? ''}`}
                          className="truncate font-display text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-brand-primary)]"
                        >
                          {p.freelancer.displayName ?? p.freelancer.username ?? 'Unnamed'}
                        </Link>
                        <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                          {p.freelancer.username ? `@${p.freelancer.username} · ` : ''}
                          WorkScore {Number(p.freelancer.workScore ?? 0).toFixed(0)} ·{' '}
                          {p.freelancer.totalJobsCompleted ?? 0} jobs done
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={style.variant}>{style.label}</Badge>
                      <span className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                        ${formatUSDC(p.bidAmount)}
                        <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">
                          {p.bidType === 'hourly' ? '/hr' : 'total'}
                        </span>
                      </span>
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">
                        {p.estimatedDuration}
                      </span>
                    </div>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {p.coverLetter}
                  </p>

                  {p.milestones && p.milestones.length > 0 ? (
                    <details className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-3 text-sm">
                      <summary className="cursor-pointer text-[var(--color-text-secondary)]">
                        {p.milestones.length} milestone{p.milestones.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-3 flex flex-col gap-2">
                        {p.milestones.map((m, idx) => (
                          <li key={idx} className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[var(--color-text-primary)]">
                              {idx + 1}. {m.title}
                            </span>
                            <span className="shrink-0 font-display text-[var(--color-text-primary)]">
                              ${formatUSDC(m.amount)} · {m.duration}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-default)] pt-3 text-xs text-[var(--color-text-tertiary)]">
                    <span>
                      Submitted{' '}
                      {new Date(p.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      {canAct ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            leftIcon={<XCircle />}
                            onClick={() =>
                              setConfirmAction({
                                type: 'reject',
                                proposalId: p.id,
                                freelancerName:
                                  p.freelancer.displayName ?? p.freelancer.username ?? 'this freelancer',
                              })
                            }
                            isLoading={rejectMut.isPending && rejectMut.variables?.id === p.id}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            leftIcon={<CheckCircle2 />}
                            onClick={() =>
                              setConfirmAction({
                                type: 'accept',
                                proposalId: p.id,
                                freelancerName:
                                  p.freelancer.displayName ?? p.freelancer.username ?? 'this freelancer',
                                bid: formatUSD(p.bidAmount),
                              })
                            }
                            isLoading={acceptMut.isPending && acceptMut.variables?.id === p.id}
                          >
                            Accept
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </footer>
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* Branded confirmation modal for accept / reject. Replaces native
          window.confirm() so the action is properly contextualised
          (which freelancer, what amount) and styled consistently. */}
      <Modal
        open={confirmAction != null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <ModalContent>
          {confirmAction?.type === 'accept' ? (
            <>
              <ModalHeader>
                <ModalTitle>Accept proposal from {confirmAction.freelancerName}?</ModalTitle>
                <ModalDescription>
                  A new contract worth <strong>{confirmAction.bid}</strong> will be created.
                  All other pending proposals on this job will be rejected and the job
                  will be locked. You can fund the escrow on the next page.
                </ModalDescription>
              </ModalHeader>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmAction(null)}>
                  Cancel
                </Button>
                <Button
                  leftIcon={<CheckCircle2 />}
                  isLoading={acceptMut.isPending}
                  onClick={() => acceptMut.mutate({ id: confirmAction.proposalId })}
                >
                  Yes, accept
                </Button>
              </ModalFooter>
            </>
          ) : confirmAction?.type === 'reject' ? (
            <>
              <ModalHeader>
                <ModalTitle>Reject {confirmAction.freelancerName}'s proposal?</ModalTitle>
                <ModalDescription>
                  They'll be notified that the proposal was declined. This action can't
                  be undone, but they can submit a new proposal if you reopen the job.
                </ModalDescription>
              </ModalHeader>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmAction(null)}>
                  Keep it
                </Button>
                <Button
                  variant="destructive"
                  leftIcon={<XCircle />}
                  isLoading={rejectMut.isPending}
                  onClick={() => rejectMut.mutate({ id: confirmAction.proposalId })}
                >
                  Reject proposal
                </Button>
              </ModalFooter>
            </>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}

function KeyFact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
        <Icon className="size-3.5" />
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 truncate font-display text-sm font-semibold text-[var(--color-text-primary)]">
        {children}
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Skeleton className="h-4 w-24" />
      <div className="mt-6">
        <Skeleton className="h-48 w-full rounded-[var(--radius-xl)]" />
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-[var(--radius-xl)]" />
        <Skeleton className="h-32 w-full rounded-[var(--radius-xl)]" />
      </div>
    </div>
  );
}
