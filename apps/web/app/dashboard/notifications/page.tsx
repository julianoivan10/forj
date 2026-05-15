'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { api } from '@/lib/trpc/client';
import { Badge, Button, Skeleton, UserAvatar } from '@/components/ui';
import { cn } from '@/lib/utils';

type NotificationItem = inferRouterOutputs<AppRouter>['notification']['list'][number];

type FilterTab = 'all' | 'unread';

export default function DashboardNotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<FilterTab>('all');
  const utils = api.useUtils();

  const listQ = api.notification.list.useQuery(
    { limit: 50, unreadOnly: tab === 'unread' },
    { refetchInterval: 30_000, refetchOnWindowFocus: true },
  );

  const unreadQ = api.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unreadCount = unreadQ.data?.count ?? 0;

  const markReadMut = api.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAllMut = api.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  // Group notifications by day-bucket so we can render "Today / Yesterday / Earlier"
  // headings — nicer than a 50-row flat list.
  const grouped = useMemo(() => {
    if (!listQ.data) return null;
    const today: typeof listQ.data = [];
    const yesterday: typeof listQ.data = [];
    const earlier: typeof listQ.data = [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfDay - 24 * 60 * 60 * 1000;
    for (const n of listQ.data) {
      const t = new Date(n.createdAt).getTime();
      if (t >= startOfDay) today.push(n);
      else if (t >= startOfYesterday) yesterday.push(n);
      else earlier.push(n);
    }
    return { today, yesterday, earlier };
  }, [listQ.data]);

  const handleItemClick = (id: string, isRead: boolean, actionUrl: string | null) => {
    if (!isRead) markReadMut.mutate({ id });
    if (actionUrl) router.push(actionUrl);
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Everything that happened on your jobs, proposals, and contracts.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => markAllMut.mutate()}
            disabled={markAllMut.isPending}
            leftIcon={<CheckCheck />}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1 border-b border-[var(--color-border-default)]">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          All
        </TabButton>
        <TabButton active={tab === 'unread'} onClick={() => setTab('unread')}>
          Unread {unreadCount > 0 && <span className="ml-1 text-[var(--color-brand-primary)]">({unreadCount})</span>}
        </TabButton>
      </div>

      {/* Body */}
      <div className="mt-6">
        {listQ.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : listQ.isError ? (
          <EmptyState
            title="Couldn't load notifications"
            description={listQ.error.message}
            action={
              <Button variant="secondary" onClick={() => listQ.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !listQ.data.length ? (
          <EmptyState
            title={tab === 'unread' ? 'No unread notifications' : "You're all caught up"}
            description={
              tab === 'unread'
                ? 'Every notification has been read. Switch to "All" to see history.'
                : "We'll nudge you when someone responds, hires you, or sends a message."
            }
            action={
              <Link href="/jobs">
                <Button variant="primary">Browse jobs</Button>
              </Link>
            }
          />
        ) : grouped ? (
          <div className="space-y-8">
            {grouped.today.length > 0 && (
              <Section title="Today">
                {grouped.today.map((n, i) => (
                  <NotificationRow key={n.id} n={n} index={i} onOpen={handleItemClick} />
                ))}
              </Section>
            )}
            {grouped.yesterday.length > 0 && (
              <Section title="Yesterday">
                {grouped.yesterday.map((n, i) => (
                  <NotificationRow key={n.id} n={n} index={i} onOpen={handleItemClick} />
                ))}
              </Section>
            )}
            {grouped.earlier.length > 0 && (
              <Section title="Earlier">
                {grouped.earlier.map((n, i) => (
                  <NotificationRow key={n.id} n={n} index={i} onOpen={handleItemClick} />
                ))}
              </Section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
      )}
    >
      {children}
      {active && (
        <motion.span
          layoutId="notif-tab-underline"
          className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-brand-primary)]"
        />
      )}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function NotificationRow({
  n,
  index,
  onOpen,
}: {
  n: NotificationItem;
  index: number;
  onOpen: (id: string, isRead: boolean, actionUrl: string | null) => void;
}) {
  const actorName = n.actor?.displayName ?? n.actor?.username ?? null;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
    >
      <button
        type="button"
        onClick={() => onOpen(n.id, n.isRead, n.actionUrl)}
        className={cn(
          'group flex w-full items-start gap-4 rounded-[var(--radius-xl)] border p-4 text-left transition-all',
          n.isRead
            ? 'border-[var(--color-border-default)] bg-[var(--color-background-secondary)] hover:border-[var(--color-border-strong)]'
            : 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] hover:shadow-[0_0_24px_var(--color-glow-brand-strong)]',
        )}
      >
        {/* Actor avatar or fallback icon */}
        {n.actor ? (
          <UserAvatar
            name={actorName ?? '?'}
            imageUrl={n.actor.avatarUrl}
            size="md"
          />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)]">
            <Bell className="size-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                'truncate text-sm',
                n.isRead
                  ? 'text-[var(--color-text-secondary)]'
                  : 'font-semibold text-[var(--color-text-primary)]',
              )}
            >
              {n.title}
            </p>
            {!n.isRead && (
              <Badge variant="brand" className="px-1.5 py-0 text-[9px] font-bold uppercase">
                New
              </Badge>
            )}
          </div>
          {n.body && (
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{n.body}</p>
          )}
          <p className="mt-1.5 text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {formatRelativeLong(new Date(n.createdAt))}
          </p>
        </div>
      </button>
    </motion.li>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <Inbox className="size-6 text-[var(--color-text-tertiary)]" />
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{description}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

function formatRelativeLong(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
