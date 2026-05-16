'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { Search, PenSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  Input,
  Button,
  UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/**
 * Composer for kicking off a new conversation from the inbox.
 *
 * Before this existed, /dashboard/messages had no way to *start* a
 * thread — users had to bounce out to a freelancer profile or proposal
 * detail page, click the (different) Message button there, and ride
 * the redirect back. That's a dead-end UX for the empty inbox state,
 * which is exactly when users feel lost.
 *
 * Behaviour:
 *   1. Click "New message" → modal opens with a search input.
 *   2. As they type (debounced 250ms), we hit `search.global` and
 *      pull out the `users` slice (top 5 by workScore).
 *   3. Click a result → we call `message.getOrStart` to resolve the
 *      deterministic conversation id, then `router.push` into the
 *      thread view. `getOrStart` doesn't write anything until they
 *      send a message — clicking a freelancer's name is free.
 *
 * Defensive bits:
 *   - Filter out the current user from results (can't message yourself
 *     — also enforced server-side, but better to never show the row).
 *   - Trim + length-gate the query so we don't fire on empty/1-char
 *     input (`search.global` requires min 1 char; we wait for 2 to
 *     keep result quality up).
 */
export function MessageComposer() {
  const [open, setOpen] = useState(false);

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button leftIcon={<PenSquare />} size="sm">
          New message
        </Button>
      </ModalTrigger>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Start a conversation</ModalTitle>
          <ModalDescription>
            Search by username or display name. Pick anyone to open a thread —
            nothing is sent until you write your first message.
          </ModalDescription>
        </ModalHeader>
        <ComposerBody onClose={() => setOpen(false)} />
      </ModalContent>
    </Modal>
  );
}

function ComposerBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [startingFor, setStartingFor] = useState<string | null>(null);

  // 250ms debounce — short enough to feel snappy, long enough to skip
  // mid-word fetches. We also short-circuit < 2 chars below.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const shouldSearch = debouncedQ.length >= 2;
  const searchQ = api.search.global.useQuery(
    { q: debouncedQ },
    { enabled: shouldSearch, staleTime: 30_000 },
  );

  // Filter out self — server also rejects, but the UI shouldn't even
  // dangle the option in front of them.
  const results = useMemo(() => {
    if (!searchQ.data) return [];
    return searchQ.data.users.filter((u) => u.id !== user?.id);
  }, [searchQ.data, user?.id]);

  const utils = api.useUtils();

  const handlePick = async (targetUserId: string) => {
    setStartingFor(targetUserId);
    try {
      // getOrStart is a query, not a mutation — it just resolves the
      // deterministic conversation id without writing anything. Fetch
      // imperatively here so we can navigate on success.
      const { conversationId } = await utils.client.message.getOrStart.query({
        userId: targetUserId,
      });
      onClose();
      router.push(`/dashboard/messages/${encodeURIComponent(conversationId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open chat');
      setStartingFor(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or name…"
          className="pl-9"
        />
      </div>

      <div className="min-h-[180px]">
        {!shouldSearch ? (
          <HintRow>Type at least 2 characters to search.</HintRow>
        ) : searchQ.isPending ? (
          <HintRow>
            <Loader2 className="size-3.5 animate-spin" /> Searching…
          </HintRow>
        ) : searchQ.isError ? (
          <HintRow tone="error">{searchQ.error.message}</HintRow>
        ) : results.length === 0 ? (
          <HintRow>No matches for &ldquo;{debouncedQ}&rdquo;.</HintRow>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((u) => {
              const name = u.displayName ?? u.username ?? 'User';
              const busy = startingFor === u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={busy || startingFor !== null}
                    onClick={() => handlePick(u.id)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2 text-left transition-colors',
                      'hover:border-[var(--color-border-default)] hover:bg-[var(--color-background-elevated)]',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                  >
                    <UserAvatar
                      name={name}
                      imageUrl={u.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        {name}
                      </p>
                      <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                        {u.username ? `@${u.username}` : ' '}
                        {u.tagline ? <span className="ml-2">· {u.tagline}</span> : null}
                      </p>
                    </div>
                    {busy ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-text-tertiary)]" />
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
                        Open →
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function HintRow({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-md)] border border-dashed px-3 py-4 text-sm',
        tone === 'error'
          ? 'border-[var(--color-error)]/40 text-[var(--color-error)]'
          : 'border-[var(--color-border-subtle)] text-[var(--color-text-tertiary)]',
      )}
    >
      {children}
    </div>
  );
}
