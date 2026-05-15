'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Coins, Lock, ShieldCheck } from 'lucide-react';
import { AuthGate } from '@/components/auth/auth-gate';
import { JobPostForm } from '@/components/jobs/job-post-form';
import { useAuth } from '@/hooks/use-auth';

export default function PostJobPage() {
  return (
    <AuthGate mode="onboarded">
      <PostJobPageInner />
    </AuthGate>
  );
}

/**
 * Public marketing entry point for "Post a Job" CTAs from the landing page.
 *
 * Authenticated users are auto-redirected to `/dashboard/jobs/new` which
 * renders the same form inside the dashboard layout (so "Cancel" and the
 * post-success redirect both stay inside the dashboard chrome).
 *
 * Anonymous visitors are bounced to /login by `AuthGate` before they ever
 * reach this body — kept as a graceful fallback for the brief moment
 * between Privy hydrate and the redirect firing.
 */
function PostJobPageInner() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/dashboard/jobs/new');
    }
  }, [isReady, isAuthenticated, router]);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <Link
        href="/jobs"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> Back to jobs
      </Link>

      <header className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
          <Briefcase className="size-3.5" /> Post a job
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Hire trusted talent, paid on-chain
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-text-secondary)] sm:text-base">
          Publish a job in minutes. Review proposals, then fund a USDC escrow — funds are only released when
          you approve delivery.
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <InfoTile icon={ShieldCheck} title="Escrow-protected" subtitle="Funds lock on Base until release" />
        <InfoTile icon={Coins} title="Pay in USDC" subtitle="5% platform fee at release" />
        <InfoTile icon={Lock} title="Only you decide" subtitle="Auto-release after 7 days" />
      </div>

      <div className="mt-8">
        <JobPostForm />
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)]">
        <Icon className="size-5 text-[var(--color-brand-primary)]" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        <p className="truncate text-xs text-[var(--color-text-tertiary)]">{subtitle}</p>
      </div>
    </div>
  );
}
