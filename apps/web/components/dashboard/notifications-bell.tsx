'use client';

import * as Popover from '@radix-ui/react-popover';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { api } from '@/lib/trpc/client';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/**
 * Header bell + dropdown panel. Lists the most recent 8 notifications with
 * click-to-navigate + auto-mark-read behaviour. Live-polls unread count every
 * 20s so the badge doesn't go stale between queries.
 *
 * Auth gating: queries only fire once the DB user has been resolved. Without
 * this guard the bell fires immediately on mount, which races Privy hydration
 * and produces an UNAUTHORIZED error every page load.
 */
export function NotificationsBell() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();

  const enabled = Boolean(user?.id);

  const unreadQ = api.notification.unreadCount.useQuery(undefined, {
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    refetchOnWindowFocus: true,
  });
  const unread = unreadQ.data?.count ?? 0;

  // Only fetch the list when the popover is open — saves a query on every page load.
  const listQ = api.notification.list.useQuery(
    { limit: 8, unreadOnly: false },
    { enabled: enabled && open, refetchInterval: enabled && open ? 20_000 : false },
  );

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

  const handleItemClick = (id: string, isRead: boolean, actionUrl: string | null) => {
    setOpen(false);
    if (!isRead) markReadMut.mutate({ id });
    if (actionUrl) router.push(actionUrl);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]"
          aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        >
          <Bell className="size-5" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-brand-primary)] px-1 text-[10px] font-bold text-white"
              >
                {unread > 99 ? '99+' : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className={cn(
            'z-50 w-[380px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]',
            'bg-[var(--color-background-secondary)]',
            'data-[state=open]:animate-fade-in-up',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-[var(--color-text-primary)]">
                Notifications
              </h3>
              {unread > 0 && (
                <span className="inline-flex items-center rounded-[var(--radius-full)] bg-[var(--color-brand-primary)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-primary)]">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-brand-primary)] disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List body */}
          <div className="max-h-[440px] overflow-y-auto">
            {listQ.isPending && open ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] p-3"
                  >
                    <div className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--color-text-primary)]/[0.04]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--color-text-primary)]/[0.04]" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-text-primary)]/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listQ.data && listQ.data.length > 0 ? (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {listQ.data.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n.id, n.isRead, n.actionUrl)}
                      className={cn(
                        'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-text-primary)]/[0.03]',
                        !n.isRead && 'bg-[var(--color-brand-primary)]/[0.04]',
                      )}
                    >
                      {/* Unread dot */}
                      <span
                        aria-hidden
                        className={cn(
                          'mt-2 size-2 shrink-0 rounded-full',
                          n.isRead ? 'bg-transparent' : 'bg-[var(--color-brand-primary)]',
                        )}
                      />
                      {/* Actor avatar */}
                      {n.actor ? (
                        <UserAvatar
                          name={n.actor.displayName ?? n.actor.username ?? '?'}
                          imageUrl={n.actor.avatarUrl}
                          size="sm"
                        />
                      ) : (
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)]">
                          <Bell className="size-4" />
                        </div>
                      )}

                      {/* Body */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm',
                            n.isRead
                              ? 'text-[var(--color-text-secondary)]'
                              : 'font-semibold text-[var(--color-text-primary)]',
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-tertiary)]">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                          {formatRelativeShort(new Date(n.createdAt))}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <Inbox className="size-8 text-[var(--color-text-tertiary)]" />
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  You&apos;re all caught up
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  We&apos;ll nudge you when something new happens.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-background-primary)]/40 px-4 py-2.5">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
            >
              View all notifications →
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function formatRelativeShort(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
