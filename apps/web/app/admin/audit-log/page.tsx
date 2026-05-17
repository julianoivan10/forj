'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, FileSearch, Filter } from 'lucide-react';
import { Badge, Button, Input, Skeleton } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Admin → Audit log viewer.
 *
 * Read-only. Surfaces every row from `admin_audit_log` newest-first
 * with two filters:
 *
 *   - **Action**: dropdown of known action types (`relink_user`,
 *     `restore_user`). Filters the list to one action.
 *   - **Target user**: free-text UUID. Filters to a specific user —
 *     useful when investigating "what has admin done to this person".
 *
 * Each row is expandable: click to reveal the `details` JSONB
 * (before/after snapshot, source, ...). Reason is always visible in
 * the collapsed row because it's the single most important piece of
 * context for an audit review.
 *
 * No edit, no delete — append-only by design. The table is the
 * forensic record.
 */

const KNOWN_ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'relink_user', label: 'Re-link account' },
  { value: 'restore_user', label: 'Restore deleted account' },
] as const;

export default function AdminAuditLogPage() {
  const [action, setAction] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState('');
  // Local-only "applied" copy so typing in the target box doesn't
  // hammer the server on every keystroke. Apply on blur/Enter.
  const [appliedTarget, setAppliedTarget] = useState('');

  const query = api.admin.listAuditLog.useQuery(
    {
      limit: 100,
      action: action || undefined,
      targetUserId: appliedTarget.trim() ? appliedTarget.trim() : undefined,
    },
    { retry: false },
  );

  const filtersApplied = action !== '' || appliedTarget.trim() !== '';

  return (
    <div>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Audit log
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Every admin action — when, who, what, why. Append-only.
          </p>
        </div>
        {/* Total count badge — only shown when data has landed. */}
        {query.data && (
          <Badge variant="outline" className="self-start sm:self-auto">
            {query.data.length} {query.data.length === 1 ? 'entry' : 'entries'}
            {filtersApplied ? ' (filtered)' : ''}
          </Badge>
        )}
      </header>

      {/* Filter bar */}
      <div className="mt-6 flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="filter-action"
            className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]"
          >
            Action
          </label>
          <div className="relative mt-1.5">
            <select
              id="filter-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="h-10 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] pl-9 pr-9 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-border-brand)] focus:outline-none"
            >
              {KNOWN_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <Filter
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            />
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            />
          </div>
        </div>
        <div className="flex-1">
          <label
            htmlFor="filter-target"
            className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]"
          >
            Target user ID
          </label>
          <Input
            id="filter-target"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedTarget(targetUserId);
            }}
            onBlur={() => setAppliedTarget(targetUserId)}
            placeholder="UUID (Enter to apply)"
            className="mt-1.5 font-mono text-xs"
          />
        </div>
        {filtersApplied && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAction('');
              setTargetUserId('');
              setAppliedTarget('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Log table */}
      <div className="mt-6 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]">
        {query.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius-md)]" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex items-start gap-3 p-5 text-sm text-[var(--color-text-secondary)]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">
                Couldn&apos;t load audit log
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                {query.error.message}
              </p>
            </div>
          </div>
        ) : query.data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
              <FileSearch className="size-5 text-[var(--color-text-tertiary)]" />
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {filtersApplied
                ? 'No entries match those filters.'
                : 'No admin actions have been logged yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {query.data.map((row) => (
              <AuditRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
type AuditRow = NonNullable<ReturnType<typeof api.admin.listAuditLog.useQuery>['data']>[number];

function AuditRow({ row }: { row: AuditRow }) {
  const [expanded, setExpanded] = useState(false);
  // Pretty-print the details JSONB. We trust the row was inserted by
  // our own server code so the shape is reliably an object — but we
  // still safe-stringify in case a future action emits a primitive.
  const detailsString = useMemo(() => {
    try {
      return JSON.stringify(row.details, null, 2);
    } catch {
      return String(row.details);
    }
  }, [row.details]);

  return (
    <li className="px-4 py-3 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={expanded}
      >
        <code className="mt-0.5 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-background-elevated)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
          {row.action}
        </code>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            <span className="text-[var(--color-text-secondary)]">
              {row.admin?.username ? `@${row.admin.username}` : '(unknown)'}
            </span>{' '}
            →{' '}
            <span className="text-[var(--color-text-secondary)]">
              {row.target?.username
                ? `@${row.target.username}`
                : (row.targetUserId ?? '(no target)')}
            </span>
            <span className="ml-2">
              · {new Date(row.createdAt).toLocaleString()}
            </span>
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-primary)]">
            {row.reason}
          </p>
        </div>
        <ChevronDown
          aria-hidden
          className={cn(
            'mt-1 size-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-primary)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Details
          </p>
          <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--color-text-secondary)]">
            {detailsString}
          </pre>
        </div>
      )}
    </li>
  );
}
