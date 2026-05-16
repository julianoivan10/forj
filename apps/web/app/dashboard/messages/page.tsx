'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/trpc/client';
import { Badge, Skeleton, UserAvatar, Button, Spinner } from '@/components/ui';
import { MessageComposer } from '@/components/messages/message-composer';
import { cn } from '@/lib/utils';

export default function DashboardMessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  // `?to=<userId>` shortcut — legacy entry points (contract detail
  // "Message" button, future emails, external links) push to
  // /dashboard/messages?to=<other-user-id>. We resolve that into the
  // deterministic conversation id and replace the URL so back-button
  // doesn't bounce the user into a getOrStart loop.
  //
  // Why a ref guard: this effect runs on every render. Without the
  // guard, a slow getOrStart + a fast re-render could fire two
  // overlapping queries and produce two router.replace calls.
  const toUserId = searchParams.get('to');
  const handledRef = useRef<string | null>(null);

  // Light polling so new messages/unread counts trickle in without a manual refresh.
  const convos = api.message.getConversations.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!toUserId) return;
    if (handledRef.current === toUserId) return;
    // Basic UUID v4-ish shape check so we don't fire getOrStart on
    // garbage query strings (e.g. someone pasting `?to=hello`). The
    // server would reject too, but a client-side fail-fast keeps the
    // toast meaningful instead of a generic zod error.
    if (!/^[0-9a-f-]{36}$/i.test(toUserId)) {
      handledRef.current = toUserId;
      toast.error('That looks like an invalid user id.');
      router.replace('/dashboard/messages');
      return;
    }
    handledRef.current = toUserId;
    let cancelled = false;
    (async () => {
      try {
        // `utils.<router>.<procedure>.fetch(input)` is the tRPC v11
        // React-Query wrapper for an imperative fetch — uses the
        // existing query client + httpBatchLink, returns the data.
        // (The `utils.client.<...>.query()` pattern works in some
        // tRPC builds but not this RC — earlier version of this code
        // used it and the promise just sat pending forever, leaving
        // the spinner stuck.)
        const { conversationId } = await utils.message.getOrStart.fetch({
          userId: toUserId,
        });
        if (cancelled) return;
        router.replace(
          `/dashboard/messages/${encodeURIComponent(conversationId)}`,
        );
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error
            ? err.message
            : 'Could not open conversation with that user',
        );
        // Strip the ?to= so the toast doesn't fire again on the next
        // render / navigation. Stay on the inbox view.
        router.replace('/dashboard/messages');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toUserId, router, utils]);

  // While we're resolving ?to= → conversation id, show a thin loading
  // strip instead of the empty state. Otherwise users see "No
  // conversations yet" for a beat, which is misleading because we *are*
  // about to navigate them into a thread.
  if (toUserId && handledRef.current === toUserId) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-3 py-20 text-center">
        <Spinner />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Opening conversation…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header row: title + composer CTA. The CTA sits next to the title
          so users land on /dashboard/messages and immediately see how to
          start a new thread — instead of having to bounce out to a
          freelancer profile or proposal first. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Messages
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Chat with clients and freelancers about live engagements.
          </p>
        </div>
        <MessageComposer />
      </div>

      <div className="mt-8">
        {convos.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : convos.isError ? (
          <EmptyBox
            title="Couldn't load your messages"
            description={convos.error.message}
            action={
              <Button variant="secondary" onClick={() => convos.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !convos.data.length ? (
          <EmptyBox
            title="No conversations yet"
            description="Tap New message above to find someone by username, or jump in from a freelancer profile or active proposal."
            action={
              <Link href="/jobs">
                <Button variant="secondary">Browse open jobs</Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {convos.data.map((c, i) => {
              if (!c.other) return null;
              const displayName = c.other.displayName ?? c.other.username ?? 'User';
              const preview = c.lastMessage?.content ?? '';
              const isFile = c.lastMessage?.type === 'file';
              const hasUnread = c.unreadCount > 0;
              const ts = c.lastMessageAt ? new Date(c.lastMessageAt) : null;
              return (
                <motion.li
                  key={c.conversationId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    href={`/dashboard/messages/${encodeURIComponent(c.conversationId)}`}
                    className={cn(
                      'group flex items-center gap-4 rounded-[var(--radius-xl)] border p-4 transition-all',
                      hasUnread
                        ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] hover:shadow-[0_0_24px_var(--color-glow-brand-strong)]'
                        : 'border-[var(--color-border-default)] bg-[var(--color-background-secondary)] hover:border-[var(--color-border-strong)]',
                    )}
                  >
                    <UserAvatar
                      name={displayName}
                      imageUrl={c.other.avatarUrl}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-base font-semibold text-[var(--color-text-primary)]">
                          {displayName}
                        </p>
                        {c.other.username && (
                          <span className="truncate text-xs text-[var(--color-text-tertiary)]">
                            @{c.other.username}
                          </span>
                        )}
                      </div>
                      <p
                        className={cn(
                          'mt-0.5 truncate text-sm',
                          hasUnread
                            ? 'font-medium text-[var(--color-text-primary)]'
                            : 'text-[var(--color-text-secondary)]',
                        )}
                      >
                        {isFile ? 'Sent an attachment' : preview || 'No messages yet'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {ts && (
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {formatRelativeShort(ts)}
                        </span>
                      )}
                      {hasUnread && (
                        <Badge variant="brand" className="px-2 py-0 text-[10px] font-bold">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
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
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <MessageSquare className="size-6 text-[var(--color-text-tertiary)]" />
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{description}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

function formatRelativeShort(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
