'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Briefcase,
  Compass,
  CornerDownLeft,
  FileText,
  Plus,
  Search as SearchIcon,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { api } from '@/lib/trpc/client';
import { cn, formatUSD } from '@/lib/utils';
import { UserAvatar } from '@/components/ui';

/**
 * Global command palette (cmd-k / ctrl-k).
 *
 * Surface model:
 *   - **Quick actions** (always shown) — navigation shortcuts. Useful
 *     even when the search box is empty, so first-time users discover
 *     what the palette can do.
 *   - **Search results** (when query length >= 1) — jobs, services,
 *     freelancers. Categorised but rendered as one flat list so the
 *     ↑/↓ keys cycle across categories without a "tab to switch
 *     section" step.
 *
 * Keyboard model:
 *   - cmd+k / ctrl+k : toggle open
 *   - escape         : close (Radix Dialog handles this)
 *   - ↑ / ↓          : move highlight
 *   - enter          : navigate to highlighted result
 *
 * The component lives at app-level so it's reachable from every page.
 * Mounted once in `Providers` so the open state survives route changes.
 */

type FlatItem =
  | { kind: 'action'; label: string; href: string; icon: typeof Plus; hint?: string }
  | { kind: 'job'; id: string; title: string; slug: string; budget: string }
  | { kind: 'service'; id: string; title: string; slug: string; from: string }
  | {
      kind: 'user';
      id: string;
      username: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      tagline: string | null;
    };

const QUICK_ACTIONS: Extract<FlatItem, { kind: 'action' }>[] = [
  { kind: 'action', label: 'Browse jobs', href: '/jobs', icon: Briefcase, hint: 'Open the public job catalog' },
  { kind: 'action', label: 'Browse services', href: '/services', icon: Sparkles, hint: 'Productised gigs' },
  { kind: 'action', label: 'Post a job', href: '/dashboard/jobs/new', icon: Plus, hint: 'Hire on-chain' },
  { kind: 'action', label: 'My contracts', href: '/dashboard/contracts', icon: FileText },
  { kind: 'action', label: 'Saved jobs', href: '/dashboard/saved', icon: Compass },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 180ms debounce — fast enough that typing feels responsive, slow
  // enough that we don't fire a request for every keystroke.
  const debouncedQuery = useDebounce(query, 180);
  const trimmed = debouncedQuery.trim();
  const hasQuery = trimmed.length > 0;

  const search = api.search.global.useQuery(
    { q: trimmed },
    { enabled: open && hasQuery, staleTime: 30_000 },
  );

  // Flat result list — render order matches keyboard cycle order.
  const items = useMemo<FlatItem[]>(() => {
    if (!hasQuery) return QUICK_ACTIONS;
    const list: FlatItem[] = [];
    for (const j of search.data?.jobs ?? []) {
      list.push({
        kind: 'job',
        id: j.id,
        title: j.title,
        slug: j.slug,
        budget:
          j.budgetMin === j.budgetMax
            ? formatUSD(j.budgetMin)
            : `${formatUSD(j.budgetMin)} – ${formatUSD(j.budgetMax)}${j.budgetType === 'hourly' ? '/hr' : ''}`,
      });
    }
    for (const s of search.data?.services ?? []) {
      list.push({ kind: 'service', id: s.id, title: s.title, slug: s.slug, from: formatUSD(s.priceFrom) });
    }
    for (const u of search.data?.users ?? []) {
      list.push({
        kind: 'user',
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        tagline: u.tagline,
      });
    }
    return list;
  }, [hasQuery, search.data]);

  // Reset highlight when results change. Otherwise the cursor can land
  // on an out-of-bounds index after the user types more characters.
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  // Reset query when the palette closes — otherwise re-opening surfaces
  // stale results from the last session, which is jarring.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    } else {
      // Auto-focus the input slightly after the dialog opens so Radix
      // has time to mount + animate.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll the active item into view as the user arrows up/down.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const go = (item: FlatItem) => {
    onOpenChange(false);
    if (item.kind === 'action') {
      router.push(item.href);
    } else if (item.kind === 'job') {
      router.push(`/jobs/${item.slug}`);
    } else if (item.kind === 'service') {
      router.push(`/services/${item.slug}`);
    } else if (item.kind === 'user' && item.username) {
      router.push(`/u/${item.username}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = items[activeIndex];
      if (item) {
        e.preventDefault();
        go(item);
      }
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className={cn(
            'fixed left-1/2 top-[15%] z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2',
            'overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)]',
            'bg-[var(--color-background-secondary)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>

          {/* Input row */}
          <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4">
            <SearchIcon className="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jobs, services, freelancers…"
              className="h-14 flex-1 bg-transparent text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-tertiary)] sm:inline">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {!hasQuery ? (
              <SectionLabel>Quick actions</SectionLabel>
            ) : search.isPending ? (
              <SkeletonRows />
            ) : items.length === 0 ? (
              <EmptyHint q={trimmed} />
            ) : null}

            {hasQuery && (search.data?.totals.jobs ?? 0) > 0 ? (
              <SectionLabel>Jobs</SectionLabel>
            ) : null}
            {items.map((item, i) => {
              const isActive = i === activeIndex;
              return (
                <li
                  key={`${item.kind}-${'id' in item ? item.id : item.href}`}
                  data-index={i}
                  role="option"
                  aria-selected={isActive}
                >
                  {/* Inject a section label *between* result groups when
                      the kind changes. The first job/service/user row
                      gets its label rendered above the previous row's
                      output, by checking the prev item's kind. */}
                  {hasQuery &&
                  i > 0 &&
                  items[i - 1] &&
                  items[i - 1]!.kind !== item.kind &&
                  item.kind !== 'action' ? (
                    <SectionLabel>
                      {item.kind === 'service' ? 'Services' : 'Freelancers'}
                    </SectionLabel>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => go(item)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors',
                      isActive
                        ? 'bg-[var(--color-glow-brand)]'
                        : 'hover:bg-[var(--color-text-primary)]/[0.04]',
                    )}
                  >
                    <RowIcon item={item} />
                    <div className="min-w-0 flex-1">
                      <RowTitle item={item} />
                      <RowSubtitle item={item} />
                    </div>
                    {isActive ? (
                      <CornerDownLeft className="size-3.5 text-[var(--color-brand-primary)]" />
                    ) : (
                      <ArrowRight className="size-3.5 text-[var(--color-text-tertiary)]" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40 px-4 py-2 text-[11px] text-[var(--color-text-tertiary)]">
            <span className="hidden sm:inline">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate · <Kbd>↵</Kbd> to open · <Kbd>esc</Kbd> to close
            </span>
            <span className="sm:hidden">Tap a result to open</span>
            <Link
              href="/jobs"
              onClick={() => onOpenChange(false)}
              className="hover:text-[var(--color-text-secondary)]"
            >
              Full search →
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-1 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
      {children}
    </li>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="size-8 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-background-tertiary)]" />
          <div className="flex-1">
            <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-background-tertiary)]" />
            <div className="mt-1.5 h-2 w-1/3 animate-pulse rounded bg-[var(--color-background-tertiary)]" />
          </div>
        </li>
      ))}
    </>
  );
}

function EmptyHint({ q }: { q: string }) {
  return (
    <li className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <SearchIcon className="size-5 text-[var(--color-text-tertiary)]" />
      <p className="text-sm font-medium text-[var(--color-text-primary)]">
        No results for &ldquo;{q}&rdquo;
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">
        Try a broader keyword or a freelancer&rsquo;s username.
      </p>
    </li>
  );
}

function RowIcon({ item }: { item: FlatItem }) {
  if (item.kind === 'action') {
    const Icon = item.icon;
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
        <Icon className="size-4" />
      </span>
    );
  }
  if (item.kind === 'job') {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
        <Briefcase className="size-4" />
      </span>
    );
  }
  if (item.kind === 'service') {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-accent)]/15 text-[var(--color-brand-accent)]">
        <Sparkles className="size-4" />
      </span>
    );
  }
  return (
    <UserAvatar
      name={item.displayName ?? item.username ?? 'User'}
      imageUrl={item.avatarUrl}
      size="sm"
    />
  );
}

function RowTitle({ item }: { item: FlatItem }) {
  let text: string;
  if (item.kind === 'action') text = item.label;
  else if (item.kind === 'job' || item.kind === 'service') text = item.title;
  else text = item.displayName ?? item.username ?? 'User';
  return (
    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{text}</p>
  );
}

function RowSubtitle({ item }: { item: FlatItem }) {
  let sub: string | null = null;
  if (item.kind === 'action') sub = item.hint ?? null;
  else if (item.kind === 'job') sub = item.budget;
  else if (item.kind === 'service') sub = `From ${item.from}`;
  else if (item.kind === 'user') sub = item.username ? `@${item.username}` : item.tagline;
  if (!sub) return null;
  return <p className="truncate text-xs text-[var(--color-text-tertiary)]">{sub}</p>;
}
