'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Briefcase, Check, ChevronDown, Hammer, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Mode switcher — toggles the user's preferred dashboard view between
 * Client / Freelancer / Both. Surfaces the choice they made at signup
 * (or last switched to) and lets them flip without re-onboarding.
 *
 * Mode is a soft UI gate: it filters the sidebar nav and tunes some
 * dashboard hero copy, but it doesn't restrict what the user can DO.
 * A client-mode user clicking "Apply to a job" still works — they'll
 * just be prompted to fill the freelancer profile fields first
 * (lazy escalation, see docs/design/role-and-mode.md).
 *
 * Mounted at the top of the sidebar so it's the first thing users see
 * after the logo — establishes "this is your perspective right now"
 * before they scan the nav.
 */

type Mode = 'client' | 'freelancer' | 'both';

const MODE_META: Record<
  Mode,
  { label: string; description: string; icon: typeof Briefcase }
> = {
  client: {
    label: 'Client',
    description: 'Hire freelancers, manage jobs',
    icon: Briefcase,
  },
  freelancer: {
    label: 'Freelancer',
    description: 'Find work, ship deliverables',
    icon: Hammer,
  },
  both: {
    label: 'Both',
    description: 'See everything',
    icon: Layers,
  },
};

export function ModeSwitcher() {
  const { user } = useAuth();
  const utils = api.useUtils();

  const setRoleMut = api.user.setRole.useMutation({
    onMutate: async ({ role }) => {
      // Optimistic — flip the cache so the sidebar re-renders before
      // the round-trip resolves. Lifts perceived latency from ~120ms to ~0.
      await utils.user.me.cancel();
      const prev = utils.user.me.getData();
      if (prev) utils.user.me.setData(undefined, { ...prev, role });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) utils.user.me.setData(undefined, ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => {
      utils.user.me.invalidate();
    },
  });

  if (!user) return null;
  const mode = (user.role ?? 'both') as Mode;
  const current = MODE_META[mode];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            'group flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--color-border-strong)]',
          )}
          aria-label="Switch dashboard mode"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
            <CurrentIcon className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
              Mode
            </span>
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {current.label}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[244px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-1.5 shadow-xl shadow-black/30"
        >
          {(Object.keys(MODE_META) as Mode[]).map((m) => {
            const meta = MODE_META[m];
            const Icon = meta.icon;
            const isActive = m === mode;
            return (
              <DropdownMenu.Item
                key={m}
                disabled={setRoleMut.isPending}
                onSelect={() => {
                  if (m === mode) return;
                  setRoleMut.mutate({ role: m });
                }}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm outline-none transition-colors',
                  isActive
                    ? 'bg-[var(--color-glow-brand)]'
                    : 'hover:bg-[var(--color-text-primary)]/[0.04]',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
                    isActive
                      ? 'bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)]'
                      : 'bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)]',
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      isActive
                        ? 'text-[var(--color-brand-primary)]'
                        : 'text-[var(--color-text-primary)]',
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="block text-[11px] text-[var(--color-text-tertiary)]">
                    {meta.description}
                  </span>
                </span>
                {isActive ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-brand-primary)]" />
                ) : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Helper for sidebar/header filters. Returns the user's current mode
 *  or `'both'` as fallback when user data isn't loaded yet. */
export function useUserMode(): Mode {
  const { user } = useAuth();
  return (user?.role ?? 'both') as Mode;
}
