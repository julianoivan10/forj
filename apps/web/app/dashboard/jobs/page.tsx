'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Eye, Users, Loader2 } from 'lucide-react';
import { api } from '@/lib/trpc/client';
import { Button, Badge, EmptyState as SharedEmptyState, Skeleton } from '@/components/ui';
import { formatUSD } from '@/lib/utils';
import { JOB_CATEGORIES } from '@/lib/constants';

type StatusInfo = { label: string; variant: 'success' | 'warning' | 'default' | 'brand' };

const DEFAULT_JOB_STATUS: StatusInfo = { label: 'Open', variant: 'success' };

const STATUS_MAP: Record<string, StatusInfo> = {
  open: DEFAULT_JOB_STATUS,
  in_progress: { label: 'In Progress', variant: 'brand' },
  completed: { label: 'Completed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'warning' },
  disputed: { label: 'Disputed', variant: 'warning' },
};

export default function DashboardJobsPage() {
  const myJobs = api.job.myJobs.useQuery();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            My Jobs
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Track your posted jobs, review proposals, and manage contracts.
          </p>
        </div>
        <Link href="/dashboard/jobs/new">
          <Button leftIcon={<Plus />}>Post a Job</Button>
        </Link>
      </div>

      <div className="mt-8">
        {myJobs.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : myJobs.isError ? (
          <EmptyBox
            title="Couldn't load your jobs"
            description={myJobs.error.message}
            action={<Button variant="secondary" onClick={() => myJobs.refetch()}>Try again</Button>}
          />
        ) : !myJobs.data?.length ? (
          <EmptyBox
            title="No jobs posted yet"
            description="Post your first job and start finding talented freelancers."
            action={
              <Link href="/dashboard/jobs/new">
                <Button leftIcon={<Plus />}>Post your first job</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {myJobs.data.map((job, i) => {
              const cat = JOB_CATEGORIES.find((c) => c.value === job.category);
              const statusInfo = STATUS_MAP[job.status] ?? DEFAULT_JOB_STATUS;
              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/dashboard/jobs/${job.id}`}
                    className="group flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5 transition-all hover:border-[var(--color-border-strong)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        {cat && <Badge variant="default">{cat.label}</Badge>}
                      </div>
                      <h3 className="mt-2 truncate font-display text-base font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-primary)] transition-colors">
                        {job.title}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        {formatUSD(job.budgetMin)} – {formatUSD(job.budgetMax)}
                        <span className="ml-1 text-[var(--color-text-tertiary)]">
                          {job.budgetType === 'hourly' ? '/ hour' : 'fixed'}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-5 text-xs text-[var(--color-text-tertiary)] shrink-0">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        {job.proposalCount} proposals
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="size-3.5" />
                        {job.viewCount} views
                      </span>
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
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
      <SharedEmptyState
        variant="jobs"
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}
