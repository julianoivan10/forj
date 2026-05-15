'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  FileText,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Skeleton, UserAvatar } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { formatUSD, formatUSDC } from '@/lib/utils';

type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

const STATUS_STYLE: Record<
  ProposalStatus,
  { label: string; variant: 'success' | 'warning' | 'default' | 'brand'; tone: string }
> = {
  pending: { label: 'Pending review', variant: 'brand', tone: 'Waiting for the client to respond.' },
  accepted: {
    label: 'Accepted',
    variant: 'success',
    tone: 'The client accepted your proposal. A contract has been created.',
  },
  rejected: { label: 'Rejected', variant: 'warning', tone: 'The client chose another freelancer.' },
  withdrawn: { label: 'Withdrawn', variant: 'default', tone: 'You withdrew this proposal.' },
};

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const proposalId = params.id;

  const proposalQuery = api.proposal.getById.useQuery(
    { id: proposalId },
    { enabled: Boolean(proposalId), retry: false },
  );

  const utils = api.useUtils();
  const withdrawMut = api.proposal.withdraw.useMutation({
    onSuccess: () => {
      toast.success('Proposal withdrawn');
      utils.proposal.getById.invalidate({ id: proposalId });
      utils.proposal.myProposals.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (proposalQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (proposalQuery.isError || !proposalQuery.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-10 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Proposal not found
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {proposalQuery.error?.message ??
              'It may have been removed, or you don\u2019t have access to view it.'}
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            leftIcon={<ArrowLeft />}
            onClick={() => router.push('/dashboard/proposals')}
          >
            Back to my proposals
          </Button>
        </div>
      </div>
    );
  }

  const proposal = proposalQuery.data;
  const isMine = user?.id === proposal.freelancerId;
  const isClientView = user?.id === proposal.job.clientId;
  const style = STATUS_STYLE[proposal.status as ProposalStatus];
  const canWithdraw = isMine && proposal.status === 'pending';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <button
        onClick={() =>
          router.push(isClientView ? `/dashboard/jobs/${proposal.jobId}` : '/dashboard/proposals')
        }
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> {isClientView ? 'Back to job' : 'My proposals'}
      </button>

      <article className="flex flex-col gap-6 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={style.variant}>{style.label}</Badge>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              Submitted{' '}
              {new Date(proposal.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">{style.tone}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-default)] pt-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                For job
              </p>
              <Link
                href={`/jobs/${proposal.job.slug}`}
                className="mt-1 block truncate font-display text-lg font-bold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-brand-primary)]"
              >
                {proposal.job.title}
              </Link>
            </div>
            <Link href={`/jobs/${proposal.job.slug}`}>
              <Button variant="secondary" size="sm" leftIcon={<ExternalLink />}>
                View job
              </Button>
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <KeyFact icon={Coins} label={proposal.bidType === 'hourly' ? 'Hourly bid' : 'Fixed bid'}>
            ${formatUSDC(proposal.bidAmount)}
            {proposal.bidType === 'hourly' ? (
              <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">/hr</span>
            ) : null}
          </KeyFact>
          <KeyFact icon={Clock} label="Estimated duration">
            {proposal.estimatedDuration}
          </KeyFact>
          <KeyFact icon={Coins} label="Job budget">
            {formatUSD(proposal.job.budgetMin)} – {formatUSD(proposal.job.budgetMax)}
          </KeyFact>
        </section>

        {isClientView ? (
          <section>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Freelancer
            </h2>
            <div className="mt-3 flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-3">
              <UserAvatar
                name={proposal.freelancer.displayName ?? proposal.freelancer.username ?? 'Freelancer'}
                imageUrl={proposal.freelancer.avatarUrl}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/u/${proposal.freelancer.username ?? ''}`}
                  className="truncate font-display text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-brand-primary)]"
                >
                  {proposal.freelancer.displayName ?? proposal.freelancer.username ?? 'Unnamed'}
                </Link>
                <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                  {proposal.freelancer.username ? `@${proposal.freelancer.username} · ` : ''}
                  WorkScore {Number(proposal.freelancer.workScore ?? 0).toFixed(0)} ·{' '}
                  {proposal.freelancer.totalJobsCompleted ?? 0} jobs done
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <MessageButton userId={proposal.freelancerId} />
                <Link href={`/u/${proposal.freelancer.username ?? ''}`}>
                  <Button variant="ghost" size="sm" rightIcon={<ExternalLink />}>
                    Profile
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Cover letter
          </h2>
          <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {proposal.coverLetter}
            </p>
          </div>
        </section>

        {proposal.milestones && proposal.milestones.length > 0 ? (
          <section>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Milestones
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {proposal.milestones.map((m, idx) => (
                <li
                  key={idx}
                  className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-display text-sm font-semibold text-[var(--color-text-primary)]">
                      {idx + 1}. {m.title}
                    </p>
                    <p className="shrink-0 font-display text-sm font-bold text-[var(--color-brand-primary)]">
                      ${formatUSDC(m.amount)}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{m.duration}</p>
                  {m.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                      {m.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {proposal.attachments && proposal.attachments.length > 0 ? (
          <section>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Attachments
            </h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {proposal.attachments.map((url, idx) => (
                <li key={idx}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--color-brand-primary)] hover:underline"
                  >
                    <FileText className="size-3.5" />
                    Attachment {idx + 1}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {proposal.status === 'accepted' ? (
          <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--color-brand-primary)]" />
            <div className="flex-1">
              <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                Congratulations — this proposal was accepted
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                A contract record has been created. Once the client funds the escrow on Base, you can
                begin work and submit deliverables.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href="/dashboard/contracts">
                  <Button size="sm" leftIcon={<ShieldCheck />}>
                    View contracts
                  </Button>
                </Link>
                {isMine ? (
                  <MessageButton
                    userId={proposal.job.clientId}
                    variant="secondary"
                    label="Message client"
                  />
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {canWithdraw ? (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-default)] pt-4">
            <Button
              variant="destructive"
              size="sm"
              leftIcon={<XCircle />}
              isLoading={withdrawMut.isPending}
              onClick={() => {
                if (
                  confirm(
                    'Withdraw this proposal? The client will no longer be able to accept it.',
                  )
                ) {
                  withdrawMut.mutate({ id: proposal.id });
                }
              }}
            >
              Withdraw proposal
            </Button>
          </footer>
        ) : null}
      </article>
    </div>
  );
}

function MessageButton({
  userId,
  variant = 'primary',
  label = 'Message',
}: {
  userId: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const handleClick = async () => {
    try {
      const result = await utils.message.getOrStart.fetch({ userId });
      router.push(`/dashboard/messages/${encodeURIComponent(result.conversationId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open conversation');
    }
  };
  return (
    <Button size="sm" variant={variant} leftIcon={<MessageSquare />} onClick={handleClick}>
      {label}
    </Button>
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
    <div className="mx-auto w-full max-w-4xl">
      <Skeleton className="h-4 w-24" />
      <div className="mt-6 space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
