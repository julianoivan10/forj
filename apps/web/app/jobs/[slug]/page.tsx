'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  Coins,
  Eye,
  Loader2,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge, Button, Skeleton, UserAvatar } from '@/components/ui';
import { ProposalForm } from '@/components/jobs/proposal-form';
import {
  EscalationModal,
  useHasFreelancerProfile,
} from '@/components/freelancer/escalation-modal';
import { useAuth, hasPrivy } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { formatUSD } from '@/lib/utils';
import {
  DURATION_LABELS,
  EXPERIENCE_LABELS,
  JOB_CATEGORIES,
} from '@/lib/constants';

export default function JobDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const { isAuthenticated, user } = useAuth();
  const job = api.job.getBySlug.useQuery({ slug }, { enabled: Boolean(slug), retry: false });

  const incrementView = api.job.incrementView.useMutation();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [viewTracked, setViewTracked] = useState(false);

  // Lazy freelancer escalation gate. The button below intercepts the
  // proposal-form trigger when the user lacks the freelancer fields
  // (skills, hourly rate) — see docs/design/role-and-mode.md §5.
  // After the modal completes, this hook re-evaluates because we
  // invalidate `user.me` inside the modal's success path, so the next
  // click flows straight into the proposal form.
  const hasFreelancerProfile = useHasFreelancerProfile();

  useEffect(() => {
    if (job.data && !viewTracked) {
      incrementView.mutate({ id: job.data.id });
      setViewTracked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.data, viewTracked]);

  if (job.isPending) {
    return <DetailSkeleton />;
  }

  if (job.isError || !job.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-10 text-center">
          <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">
            Job not found
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            It may have been closed, expired, or the link is wrong.
          </p>
          <Link href="/jobs" className="mt-6 inline-block">
            <Button variant="secondary" leftIcon={<ArrowLeft />}>
              Back to jobs
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const j = job.data;
  const category = JOB_CATEGORIES.find((c) => c.value === j.category);
  const clientName = j.client.displayName ?? j.client.username ?? 'Client';
  const isOwnJob = user?.id === j.clientId;
  const isClosed = j.status !== 'open';

  // No role gate: any authenticated, onboarded user can submit a proposal.
  // The client viewing their own job sees a Manage CTA instead — that's
  // the only branch that uses identity here.
  const proposalCta = (() => {
    if (isOwnJob) {
      return (
        <Link href={`/dashboard/jobs/${j.id}`}>
          <Button size="lg" variant="secondary">
            Manage proposals
          </Button>
        </Link>
      );
    }
    if (isClosed) {
      return (
        <Button size="lg" disabled>
          Job {j.status}
        </Button>
      );
    }
    if (!isAuthenticated) {
      return (
        <Link href={`/login?next=${encodeURIComponent(`/jobs/${slug}`)}`}>
          <Button size="lg" leftIcon={<Send />}>
            Sign in to apply
          </Button>
        </Link>
      );
    }
    // First-time freelancer? Route the click through escalation
    // instead of jumping straight into the proposal form. The escalation
    // modal collects skills + hourly rate, then we re-enter this
    // branch on the next render (because we invalidate user.me) and
    // the button opens the proposal form directly.
    return (
      <Button
        size="lg"
        leftIcon={<Send />}
        onClick={() =>
          hasFreelancerProfile ? setProposalOpen(true) : setEscalationOpen(true)
        }
      >
        Submit a proposal
      </Button>
    );
  })();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="flex flex-col gap-6 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <Badge variant="brand">
                <ShieldCheck /> Escrow-protected
              </Badge>
              {category ? <Badge variant="default">{category.label}</Badge> : null}
              <Badge variant={isClosed ? 'warning' : 'success'}>
                {isClosed ? j.status : 'Open'}
              </Badge>
              <span>
                Posted{' '}
                {new Date(j.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              {j.title}
            </h1>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            <KeyFact icon={Coins} label="Budget">
              {formatUSD(j.budgetMin)} – {formatUSD(j.budgetMax)}
              <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">
                {j.budgetType === 'hourly' ? '/ hour' : 'fixed'}
              </span>
            </KeyFact>
            <KeyFact icon={Clock} label="Duration">
              {DURATION_LABELS[j.duration]}
            </KeyFact>
            <KeyFact icon={Briefcase} label="Experience">
              {EXPERIENCE_LABELS[j.experienceLevel]}
            </KeyFact>
          </div>

          <section>
            <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
              Project description
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {j.description}
            </p>
          </section>

          {j.skills.length > 0 ? (
            <section>
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
                Required skills
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {j.skills.map((skill) => (
                  <Badge key={skill} variant="default" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border-default)] pt-4 text-xs text-[var(--color-text-tertiary)]">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {j.proposalCount} proposals
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5" />
              {j.viewCount} views
            </span>
            {j.expiresAt ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Expires {new Date(j.expiresAt).toLocaleDateString()}
              </span>
            ) : null}
          </section>
        </article>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              About the client
            </h3>
            <div className="mt-4 flex items-center gap-3">
              <UserAvatar name={clientName} imageUrl={j.client.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-[var(--color-text-primary)]">
                  {clientName}
                </p>
                {j.client.username ? (
                  <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                    @{j.client.username}
                  </p>
                ) : null}
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <Stat label="WorkScore" value={Number(j.client.workScore ?? 0).toFixed(0)} />
              <Stat label="Badge" value={j.client.badgeTier ?? 'none'} capitalize />
              <Stat label="Jobs posted" value={String(j.client.totalJobsCompleted ?? 0)} />
              <Stat
                label="Member since"
                value={new Date(j.client.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })}
              />
            </dl>
          </div>

          <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--color-brand-primary)]" />
              <div>
                <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                  Escrow-protected payment
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  Funds lock in a smart contract on Base once the client hires. Release only on approved
                  delivery.
                </p>
              </div>
            </div>
            <div className="pt-1">{proposalCta}</div>
            {!hasPrivy && !isAuthenticated ? (
              <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">
                Auth not configured in this environment.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <ProposalForm
        open={proposalOpen}
        onOpenChange={setProposalOpen}
        jobId={j.id}
        jobTitle={j.title}
        jobBudgetType={j.budgetType}
        jobBudgetMin={j.budgetMin}
        jobBudgetMax={j.budgetMax}
      />

      <EscalationModal
        open={escalationOpen}
        onOpenChange={setEscalationOpen}
        intent="apply-to-job"
        onComplete={() => {
          // Profile saved + user.me invalidated inside the modal —
          // hop directly into the proposal form so the user doesn't
          // have to click "Submit a proposal" a second time.
          setEscalationOpen(false);
          setProposalOpen(true);
        }}
      />
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
      <p className="mt-1 font-display text-sm font-semibold text-[var(--color-text-primary)]">
        {children}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
      <dd
        className={`font-display text-sm font-semibold text-[var(--color-text-primary)]${capitalize ? ' capitalize' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-24" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-8">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-5/6" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-40 rounded-[var(--radius-xl)]" />
        </div>
      </div>
    </div>
  );
}
