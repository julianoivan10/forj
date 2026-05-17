'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, CheckCheck, ChevronUp, Loader2, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { Button, Skeleton, UserAvatar, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { BADGE_TIER_META } from '@/lib/constants';

// Page size for the live "tail" + each "Load older" click. Server cap
// is 100 — we sit at 50 so a fresh open is fast AND a single Load
// older still pulls meaningful history. Bump to 100 if real-world
// usage shows users mash the button repeatedly.
const PAGE_SIZE = 50;

type ThreadMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  fileUrl: string | null;
  type: 'text' | 'file';
  isRead: boolean;
  createdAt: Date;
  sender?: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export default function ConversationThreadPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const params = useParams<{ conversationId: string }>();
  const conversationId = decodeURIComponent(params.conversationId);

  // Live "tail" — newest PAGE_SIZE messages, polled. This is the only
  // page that re-fetches; older pages live in `olderMessages` state
  // and never refetch (they're immutable history).
  const thread = api.message.getMessages.useQuery(
    { conversationId, limit: PAGE_SIZE },
    {
      // 8s is snappy enough to feel real-time without hammering the server
      // when both parties are idle. Background tab pauses polling automatically
      // (see global QueryClient default).
      refetchInterval: 8_000,
      refetchOnWindowFocus: true,
      // Auth is still loading on first render — wait for it.
      enabled: Boolean(me?.id),
    },
  );

  // History pages loaded via "Load older" — prepended to the live tail
  // for display. Reset when the conversation changes (route swap).
  const [olderMessages, setOlderMessages] = useState<ThreadMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    setOlderMessages([]);
    setHasMoreOlder(true);
  }, [conversationId]);

  // Seed `hasMoreOlder` from the initial server response. After that,
  // each Load-older call updates it from its own response. Skip once
  // we've started loading older pages — server's `hasMore` for the
  // live tail is about messages OLDER than the tail's oldest, which
  // is exactly what we want to track here.
  useEffect(() => {
    if (thread.data && olderMessages.length === 0) {
      setHasMoreOlder(thread.data.hasMore);
    }
  }, [thread.data, olderMessages.length]);

  const utils = api.useUtils();
  const markRead = api.message.markRead.useMutation();
  const sendMut = api.message.send.useMutation({
    // Optimistic update — append the draft message to the cached list instantly
    // so the UI feels snappy instead of waiting on the roundtrip.
    onMutate: async (vars) => {
      setDraft('');
      await utils.message.getMessages.cancel({ conversationId, limit: PAGE_SIZE });
      const prev = utils.message.getMessages.getData({ conversationId, limit: PAGE_SIZE });
      if (prev && me) {
        const optimistic = {
          id: `optimistic-${Date.now()}`,
          conversationId,
          senderId: me.id,
          receiverId: vars.receiverId,
          content: vars.content,
          fileUrl: vars.fileUrl ?? null,
          type: (vars.fileUrl ? 'file' : 'text') as 'file' | 'text',
          isRead: false,
          createdAt: new Date(),
          sender: {
            id: me.id,
            username: me.username ?? null,
            displayName: me.displayName ?? null,
            avatarUrl: me.avatarUrl ?? null,
          },
        };
        utils.message.getMessages.setData(
          { conversationId, limit: PAGE_SIZE },
          { ...prev, messages: [...prev.messages, optimistic] },
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      // Roll back the optimistic message on failure.
      if (ctx?.prev) {
        utils.message.getMessages.setData({ conversationId, limit: PAGE_SIZE }, ctx.prev);
      }
      toast.error(err.message);
    },
    onSettled: () => {
      // Don't block the UI on the refetch — fire and forget.
      utils.message.getMessages.invalidate({ conversationId, limit: PAGE_SIZE });
      utils.message.getConversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  // Fetch the page of messages older than what we currently show.
  // Cursor = createdAt of the oldest displayed message. Prepends the
  // page to `olderMessages` so the live tail stays untouched. Scroll
  // position is captured before the prepend and restored after, so
  // the user stays anchored on the message they were reading instead
  // of getting yanked to the top.
  const handleLoadOlder = async () => {
    if (loadingOlder || !hasMoreOlder) return;
    setLoadingOlder(true);
    const scrollEl = scrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    const prevTop = scrollEl?.scrollTop ?? 0;
    try {
      // Oldest currently-displayed createdAt = our cursor. Pull from
      // `olderMessages` first (already paginated history), fall back to
      // the live tail.
      const oldest =
        olderMessages[0] ?? thread.data?.messages[0] ?? null;
      if (!oldest) {
        setLoadingOlder(false);
        return;
      }
      const data = await utils.message.getMessages.fetch({
        conversationId,
        limit: PAGE_SIZE,
        before: oldest.createdAt,
      });
      setOlderMessages((prev) => [...data.messages, ...prev]);
      setHasMoreOlder(data.hasMore);
      // Restore scroll anchor: the new content pushed everything down
      // by (newHeight - prevHeight) px, so add that delta back to
      // scrollTop. Runs in rAF so the DOM has flushed.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const newHeight = el.scrollHeight;
        el.scrollTop = prevTop + (newHeight - prevHeight);
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not load older messages',
      );
    } finally {
      setLoadingOlder(false);
    }
  };

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMarkRef = useRef<string | null>(null);

  // When fresh data arrives and there are unread messages from the other party,
  // mark them read once (avoids looping).
  useEffect(() => {
    if (!thread.data || !me?.id) return;
    const hasUnread = thread.data.messages.some(
      (m) => m.receiverId === me.id && !m.isRead,
    );
    if (!hasUnread) return;
    // De-dupe by stable key so we don't spam markRead on every refetch tick.
    const key = `${conversationId}:${thread.data.messages.length}`;
    if (lastMarkRef.current === key) return;
    lastMarkRef.current = key;
    markRead.mutate(
      { conversationId },
      {
        onSuccess: () => {
          utils.message.getConversations.invalidate();
          utils.message.unreadCount.invalidate();
        },
      },
    );
    // markRead mutation is stable; we intentionally omit it from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.data, me?.id, conversationId]);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.data?.messages.length]);

  const other = thread.data?.other ?? null;
  const tierMeta = other
    ? BADGE_TIER_META[other.badgeTier as keyof typeof BADGE_TIER_META] ??
      BADGE_TIER_META.none
    : null;

  // Combined display list: older history pages (prepended) + live tail.
  // Dedupe by id in case an optimistic message lands in both (rare —
  // optimistic is on the live tail key, but defensive).
  const displayedMessages = useMemo(() => {
    const tail = thread.data?.messages ?? [];
    if (olderMessages.length === 0) return tail;
    const olderIds = new Set(olderMessages.map((m) => m.id));
    const dedupedTail = tail.filter((m) => !olderIds.has(m.id));
    return [...olderMessages, ...dedupedTail];
  }, [olderMessages, thread.data?.messages]);

  // Two-tier grouping: outer by calendar day, inner into "bursts" of consecutive
  // messages from the same sender within a 5-minute window. Bursts let us
  // collapse repeated avatars + tighten vertical spacing so the thread reads
  // more like a real chat app and less like a flat email list.
  const grouped = useMemo(() => {
    if (displayedMessages.length === 0) return [];
    const days = groupByDay(displayedMessages);
    return days.map((day) => ({
      ...day,
      bursts: groupBurst(day.messages),
    }));
  }, [displayedMessages]);

  // Permission / missing-conversation error → gate early.
  if (thread.isError) {
    return (
      <div className="mx-auto w-full max-w-full px-4 sm:max-w-3xl sm:px-0">
        <BackLink />
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
            <ShieldAlert className="size-6 text-[var(--color-text-tertiary)]" />
          </div>
          <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
            Can&apos;t open this conversation
          </h3>
          <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
            {thread.error.message}
          </p>
          <div className="pt-2">
            <Button variant="secondary" onClick={() => router.push('/dashboard/messages')}>
              Back to inbox
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !other?.id) return;
    sendMut.mutate({ receiverId: other.id, content: trimmed });
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-full flex-col px-4 sm:max-w-3xl sm:px-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border-default)] pb-4">
        <button
          onClick={() => router.push('/dashboard/messages')}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]"
          aria-label="Back to inbox"
        >
          <ArrowLeft className="size-4" />
        </button>
        {thread.isPending || !other ? (
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ) : (
          <Link
            href={other.username ? `/u/${other.username}` : '#'}
            className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] px-2 py-1 transition-colors hover:bg-[var(--color-text-primary)]/[0.04]"
          >
            <UserAvatar
              name={other.displayName ?? other.username ?? 'User'}
              imageUrl={other.avatarUrl}
              size="md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-display text-base font-semibold text-[var(--color-text-primary)]">
                  {other.displayName ?? other.username ?? 'User'}
                </p>
                {tierMeta && other.badgeTier && other.badgeTier !== 'none' && (
                  <Badge
                    variant="outline"
                    className="py-0 text-[10px]"
                    style={{ color: tierMeta.color, borderColor: tierMeta.color }}
                  >
                    {tierMeta.label}
                  </Badge>
                )}
              </div>
              {other.username && (
                <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                  @{other.username}
                </p>
              )}
            </div>
          </Link>
        )}
      </div>

      {/* Message list — flex-col-reverse keeps messages glued to the bottom
          so short threads don't leave a huge empty gap above the composer. */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col overflow-y-auto py-6"
      >
        {thread.isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className={cn(
                  'h-14 rounded-[var(--radius-xl)]',
                  i % 2 === 0 ? 'w-2/3' : 'ml-auto w-1/2',
                )}
              />
            ))}
          </div>
        ) : displayedMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
              <Send className="size-5 text-[var(--color-text-tertiary)]" />
            </div>
            <p className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              Say hi to {other?.displayName ?? other?.username ?? 'them'}
            </p>
            <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
              Break the ice. Once you send, they&apos;ll see it next time they check their inbox.
            </p>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-6">
            {/* Load-older button — only when there's confirmed older
                history. Hidden once we've hit the start of the thread
                so users don't keep clicking into emptiness. */}
            {hasMoreOlder && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors',
                    'hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {loadingOlder ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Loading older…
                    </>
                  ) : (
                    <>
                      <ChevronUp className="size-3" />
                      Load older messages
                    </>
                  )}
                </button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {grouped.map((group) => (
                <div key={group.day} className="flex flex-col gap-4">
                  <div className="flex items-center justify-center">
                    <span className="rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] px-3 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      {formatDayLabel(group.day)}
                    </span>
                  </div>
                  {group.bursts.map((burst, bi) => {
                    const isMine = burst.senderId === me?.id;
                    const lastMsg = burst.messages[burst.messages.length - 1]!;
                    const burstAvatarName = isMine
                      ? me?.displayName ?? me?.username ?? 'You'
                      : other?.displayName ?? other?.username ?? 'User';
                    const burstAvatarUrl = isMine ? me?.avatarUrl : other?.avatarUrl;
                    return (
                      <div
                        key={`${group.day}-${bi}`}
                        className={cn(
                          'flex items-end gap-2',
                          isMine ? 'flex-row-reverse' : 'flex-row',
                        )}
                      >
                        {/* Avatar — only on the bottom of each burst, on the
                            non-self side. Reserves space when hidden so
                            successive bubbles align consistently. */}
                        {!isMine ? (
                          <div className="size-8 shrink-0 self-end">
                            <UserAvatar
                              name={burstAvatarName}
                              imageUrl={burstAvatarUrl}
                              size="sm"
                            />
                          </div>
                        ) : null}

                        <div
                          className={cn(
                            'flex max-w-[78%] flex-col gap-1',
                            isMine ? 'items-end' : 'items-start',
                          )}
                        >
                          {burst.messages.map((m, mi) => {
                            const isFirst = mi === 0;
                            const isLast = mi === burst.messages.length - 1;
                            const isOptimistic = String(m.id).startsWith('optimistic-');
                            return (
                              <motion.div
                                key={m.id}
                                layout="position"
                                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className={cn(
                                  'px-3.5 py-2 text-sm',
                                  // Bubble shape — tightly rounded at the
                                  // sender side, hugs neighbours within burst.
                                  isMine
                                    ? cn(
                                        'bg-gradient-to-br from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)] text-white shadow-sm',
                                        isFirst ? 'rounded-t-[var(--radius-xl)]' : 'rounded-tr-[var(--radius-sm)] rounded-tl-[var(--radius-xl)]',
                                        isLast ? 'rounded-bl-[var(--radius-xl)] rounded-br-[var(--radius-sm)]' : 'rounded-br-[var(--radius-sm)] rounded-bl-[var(--radius-xl)]',
                                        isOptimistic && 'opacity-70',
                                      )
                                    : cn(
                                        'border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] text-[var(--color-text-primary)]',
                                        isFirst ? 'rounded-t-[var(--radius-xl)]' : 'rounded-tl-[var(--radius-sm)] rounded-tr-[var(--radius-xl)]',
                                        isLast ? 'rounded-br-[var(--radius-xl)] rounded-bl-[var(--radius-sm)]' : 'rounded-bl-[var(--radius-sm)] rounded-br-[var(--radius-xl)]',
                                      ),
                                )}
                              >
                                <p className="whitespace-pre-wrap break-words leading-relaxed">
                                  {m.content}
                                </p>
                                {m.fileUrl && (
                                  <a
                                    href={m.fileUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className={cn(
                                      'mt-1.5 inline-block truncate text-xs underline',
                                      isMine ? 'text-white/80' : 'text-[var(--color-brand-primary)]',
                                    )}
                                  >
                                    Attachment
                                  </a>
                                )}
                              </motion.div>
                            );
                          })}
                          {/* Burst footer — single timestamp + status for the
                              whole burst, less noisy than per-message. */}
                          <div
                            className={cn(
                              'flex items-center gap-1 px-1 text-[10px] text-[var(--color-text-tertiary)]',
                              isMine ? 'flex-row-reverse' : 'flex-row',
                            )}
                          >
                            <span>{formatTime(new Date(lastMsg.createdAt))}</span>
                            {isMine && (
                              <span className="inline-flex items-center" aria-label={lastMsg.isRead ? 'Read' : 'Sent'}>
                                {String(lastMsg.id).startsWith('optimistic-') ? (
                                  <span className="size-1 animate-pulse rounded-full bg-[var(--color-text-tertiary)]" aria-hidden />
                                ) : lastMsg.isRead ? (
                                  <CheckCheck className="size-3 text-[var(--color-brand-primary)]" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t border-[var(--color-border-default)] pt-4"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as unknown as React.FormEvent);
            }
          }}
          placeholder={other ? `Message ${other.displayName ?? other.username ?? ''}…` : 'Loading…'}
          rows={1}
          maxLength={5000}
          disabled={!other}
          className={cn(
            'min-h-[44px] max-h-[160px] flex-1 resize-none rounded-[var(--radius-md)]',
            'bg-[var(--color-background-elevated)] border border-[var(--color-border-default)]',
            'px-3 py-2.5 text-sm text-[var(--color-text-primary)]',
            'placeholder:text-[var(--color-text-tertiary)]',
            'focus:outline-none focus:border-[var(--color-brand-primary)] focus:shadow-[0_0_0_3px_var(--color-glow-brand)]',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        />
        <Button
          type="submit"
          disabled={!draft.trim() || !other}
          className="shrink-0"
        >
          <Send className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/messages"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
    >
      <ArrowLeft className="size-4" />
      All conversations
    </Link>
  );
}

type ThreadMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  fileUrl: string | null;
  type: string;
  isRead: boolean;
  createdAt: Date | string;
};

function groupByDay(messages: ThreadMessage[]): Array<{ day: string; messages: ThreadMessage[] }> {
  const groups: Array<{ day: string; messages: ThreadMessage[] }> = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(m);
    } else {
      groups.push({ day, messages: [m] });
    }
  }
  return groups;
}

/**
 * Collapse consecutive same-sender messages within 5 minutes into a single burst.
 * Bursts share an avatar + timestamp so the thread reads more naturally.
 */
function groupBurst(messages: ThreadMessage[]): Array<{
  senderId: string;
  messages: ThreadMessage[];
}> {
  const FIVE_MIN = 5 * 60 * 1000;
  const out: Array<{ senderId: string; messages: ThreadMessage[] }> = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    const lastMsg = last?.messages[last.messages.length - 1];
    const lastTime = lastMsg ? new Date(lastMsg.createdAt).getTime() : 0;
    const thisTime = new Date(m.createdAt).getTime();
    if (last && last.senderId === m.senderId && thisTime - lastTime < FIVE_MIN) {
      last.messages.push(m);
    } else {
      out.push({ senderId: m.senderId, messages: [m] });
    }
  }
  return out;
}

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return key;
  const date = new Date(y, m, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
