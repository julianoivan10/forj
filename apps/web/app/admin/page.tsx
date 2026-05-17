'use client';

import Link from 'next/link';
import { FileSearch, Gavel, Users, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '@/lib/trpc/client';
import { Skeleton } from '@/components/ui';

/**
 * Admin hub — landing page for `/admin`. Surfaces queue counts so an
 * on-call admin sees what needs their attention at a glance instead
 * of clicking through every section.
 *
 * Each card links into a dedicated page. The disputed-count + recent-
 * audit-events are live (tRPC queries gated by `adminProcedure`), so
 * the page is empty for non-admins even though it renders for
 * everyone — no information disclosure.
 */
export default function AdminHubPage() {
  const disputed = api.admin.listDisputed.useQuery(undefined, { retry: false });
  // Pull the 5 most recent audit entries for a "what happened recently"
  // glance. Bounded to 5 so the hub stays scannable.
  const recentAudit = api.admin.listAuditLog.useQuery(
    { limit: 5 },
    { retry: false },
  );

  const disputedCount = disputed.data?.length ?? 0;

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          Admin overview
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Triage hub. Everything you need to operate Forj from the
          inside — dispute resolution, account recovery, and the audit
          trail of every admin action.
        </p>
      </header>

      {/* Queue cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QueueCard
          href="/admin/disputes"
          icon={Gavel}
          label="Open disputes"
          count={disputedCount}
          loading={disputed.isPending}
          severity={disputedCount > 0 ? 'attention' : 'idle'}
          description="Contracts in `disputed` state. Resolve via on-chain split — arbiter signs from the platform multisig."
        />
        <QueueCard
          href="/admin/users"
          icon={Users}
          label="User recovery"
          // No queue count for re-link/restore — those are reactive
          // (support ticket triggered), not a polled inbox.
          count={null}
          loading={false}
          severity="idle"
          description="Bind a new privyId onto an existing row (re-link) or undo a soft-delete (restore). Every action is audit-logged."
        />
        <QueueCard
          href="/admin/audit-log"
          icon={FileSearch}
          label="Audit log"
          count={null}
          loading={false}
          severity="idle"
          description="Every admin action — when, who, what, why. Append-only, admin-only read access."
        />
      </div>

      {/* Recent audit activity preview */}
      <section className="mt-10">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
            Recent admin activity
          </h2>
          <Link
            href="/admin/audit-log"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand-primary)] hover:underline"
          >
            View all <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="mt-3 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]">
          {recentAudit.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-[var(--radius-md)]" />
              ))}
            </div>
          ) : recentAudit.isError ? (
            <div className="flex items-start gap-3 p-5 text-sm text-[var(--color-text-secondary)]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-text-tertiary)]" />
              <p>
                Couldn&apos;t load audit log:{' '}
                <span className="text-[var(--color-text-tertiary)]">
                  {recentAudit.error.message}
                </span>
              </p>
            </div>
          ) : (recentAudit.data?.length ?? 0) === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-tertiary)]">
              No admin actions logged yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {recentAudit.data!.map((row) => (
                <li key={row.id} className="flex items-center gap-3 p-4 text-sm">
                  <code className="rounded-[var(--radius-sm)] bg-[var(--color-background-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
                    {row.action}
                  </code>
                  <span className="text-[var(--color-text-secondary)]">
                    {row.admin?.username ? `@${row.admin.username}` : '(unknown admin)'}
                  </span>
                  <span className="text-[var(--color-text-tertiary)]">→</span>
                  <span className="text-[var(--color-text-secondary)]">
                    {row.target?.username ? `@${row.target.username}` : row.targetUserId ?? '(no target)'}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--color-text-tertiary)]">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function QueueCard({
  href,
  icon: Icon,
  label,
  count,
  loading,
  severity,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number | null;
  loading: boolean;
  severity: 'attention' | 'idle';
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-border-strong)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)]">
          <Icon className="size-5" />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-12 rounded-[var(--radius-sm)]" />
        ) : count !== null ? (
          <span
            className={
              severity === 'attention'
                ? 'inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-error)]/15 px-2 font-mono text-sm font-bold tabular-nums text-[var(--color-error)]'
                : 'inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-background-elevated)] px-2 font-mono text-sm tabular-nums text-[var(--color-text-tertiary)]'
            }
          >
            {count}
          </span>
        ) : null}
      </div>
      <div>
        <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)]">
          {label}
        </h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          {description}
        </p>
      </div>
    </Link>
  );
}
