'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  FileSignature,
  Globe,
  MessageSquare,
  Bell,
  Bookmark,
  Sparkles,
  Settings,
  User,
  ChevronLeft,
} from 'lucide-react';
import { useAuth, hasPrivy } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { useT } from '@/lib/i18n/provider';
import { ModeSwitcher } from '@/components/dashboard/mode-switcher';
import { cn } from '@/lib/utils';

/**
 * Mode-aware group visibility. We filter whole *groups* (not individual
 * items) by mode — that way "Saved Jobs" lives under the same Work
 * header it semantically belongs to (freelancer perspective), and
 * "Saved Services" sits under Hiring (client perspective). In `both`
 * mode the user sees BOTH groups, which is the whole point of Both —
 * a visible split between hiring activity and freelancing activity.
 */
type Mode = 'client' | 'freelancer' | 'both';
const GROUPS_BY_MODE: Record<Mode, Set<string>> = {
  client: new Set(['overview', 'hiring', 'contracts', 'inbox', 'account']),
  freelancer: new Set(['overview', 'work', 'contracts', 'inbox', 'account']),
  both: new Set(['overview', 'hiring', 'work', 'contracts', 'inbox', 'account']),
};

interface NavItem {
  /** i18n key resolved at render time. e.g. `sidebar.myJobs`. */
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'messages' | 'notifications';
  /** Optional tour-target hook so `dashboard-tour.tsx` can highlight
   *  this row without relying on `href` selectors that change with
   *  routing renames. */
  dataTour?: string;
}

interface NavGroup {
  /** Stable id used by `GROUPS_BY_MODE` to decide visibility. */
  id: string;
  /** i18n key for the section header; null hides the header. */
  titleKey: string | null;
  items: NavItem[];
}

// Grouped navigation. Each group renders with a SMALL CAPS header above
// it (except headerless ones) and a 4px gap between groups. Labels
// reference i18n keys (`sidebar.*`) — resolved per-render so switching
// language re-renders with the new strings without a reload.
//
// IMPORTANT: groups are split by *perspective*, not by feature. "My
// Jobs" and "Saved Services" both live under HIRING (client-side
// affordances). "My Proposals", "My Services", "Saved Jobs" live under
// WORK (freelancer-side). This is the structural fix for the earlier
// bug where "Saved Jobs" was mis-nested as a sub-item of "My Jobs" —
// it never belonged there because they're for opposite roles.
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    titleKey: null,
    items: [{ labelKey: 'sidebar.overview', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'hiring',
    titleKey: 'sidebar.hiring',
    items: [
      { labelKey: 'sidebar.myJobs', href: '/dashboard/jobs', icon: Briefcase },
      { labelKey: 'sidebar.savedServices', href: '/dashboard/saved-services', icon: Bookmark },
    ],
  },
  {
    id: 'work',
    titleKey: 'sidebar.work',
    items: [
      { labelKey: 'sidebar.myProposals', href: '/dashboard/proposals', icon: FileText },
      { labelKey: 'sidebar.myServices', href: '/dashboard/services', icon: Sparkles },
      { labelKey: 'sidebar.savedJobs', href: '/dashboard/saved', icon: Bookmark, dataTour: 'sidebar-saved' },
    ],
  },
  {
    // Contracts is shared between client and freelancer perspectives,
    // so it gets its own headerless group between the two work groups
    // and inbox. Always visible regardless of mode.
    id: 'contracts',
    titleKey: null,
    items: [{ labelKey: 'sidebar.contracts', href: '/dashboard/contracts', icon: FileSignature }],
  },
  {
    id: 'inbox',
    titleKey: 'sidebar.inbox',
    items: [
      { labelKey: 'sidebar.messages', href: '/dashboard/messages', icon: MessageSquare, badgeKey: 'messages' },
      { labelKey: 'sidebar.notifications', href: '/dashboard/notifications', icon: Bell, badgeKey: 'notifications' },
    ],
  },
  {
    id: 'account',
    titleKey: 'sidebar.account',
    items: [
      { labelKey: 'sidebar.settings', href: '/dashboard/settings', icon: Settings, dataTour: 'sidebar-settings' },
    ],
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();

  const mode = (user?.role ?? 'both') as Mode;
  // Filter nav groups by mode via `GROUPS_BY_MODE`. `both` shows
  // everything — *the visible split between Hiring and Work IS the
  // point of Both mode*; users get a clear at-a-glance view of both
  // perspectives. `client` hides the Work group entirely (and vice
  // versa) so the sidebar stays uncluttered for single-role users.
  const visibleGroups = NAV_GROUPS.filter((g) => GROUPS_BY_MODE[mode].has(g.id));

  const isAuthed = Boolean(user?.id);
  const msgUnread = api.message.unreadCount.useQuery(undefined, {
    enabled: isAuthed,
    refetchInterval: isAuthed ? 20_000 : false,
    refetchOnWindowFocus: true,
  });
  const notifUnread = api.notification.unreadCount.useQuery(undefined, {
    enabled: isAuthed,
    refetchInterval: isAuthed ? 30_000 : false,
    refetchOnWindowFocus: true,
  });

  const badgeCounts: Record<string, number> = {
    messages: msgUnread.data?.count ?? 0,
    notifications: notifUnread.data?.count ?? 0,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-[var(--color-border-default)] px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Home">
          <Image src="/logo.svg" alt="" width={28} height={28} className="size-7" />
          <span className="font-display text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
            For<span className="text-[var(--color-brand-primary)]">j</span>
          </span>
        </Link>
      </div>

      {/* Mode switcher — sits above the nav so users see their
          current perspective FIRST. Hidden if user data isn't loaded
          yet (avoids flash of empty mode badge). */}
      {user ? (
        <div className="px-3 pt-3">
          <ModeSwitcher />
        </div>
      ) : null}

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto p-3">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && 'mt-5')}>
            {group.titleKey ? (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                {t(group.titleKey)}
              </p>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={item.dataTour}
                    className={cn(
                      // Distinctive nav item: a vermillion slab marker on the
                      // left edge appears for the active item. Bauhaus cue —
                      // the same anvil slab idea from the logo, now a tiny
                      // accent that reads as "you are here". Hover state
                      // shows a faded version of the same slab so the
                      // transition feels mechanical, not animated soup.
                      'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full bg-[var(--color-brand-primary)] transition-all',
                        isActive
                          ? 'h-5 w-[3px] opacity-100'
                          : 'h-3 w-[2px] opacity-0 group-hover:opacity-50',
                      )}
                    />
                    <item.icon
                      className={cn(
                        'size-[18px]',
                        isActive ? 'text-[var(--color-brand-primary)]' : 'opacity-60',
                      )}
                    />
                    <span className="flex-1">{t(item.labelKey)}</span>
                    {badgeCount > 0 && (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-brand-primary)] px-1.5 text-[10px] font-bold text-white">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Public-site escape hatch. Sits above the user card so it's near
          the natural eye path of "exit the app" gestures (like the user
          avatar / settings). Subtle, not loud — most dashboard users don't
          need this on every visit. */}
      <div className="border-t border-[var(--color-border-subtle)] px-3 pt-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-secondary)]"
        >
          <Globe className="size-3.5 opacity-70" />
          {t('nav.viewPublicSite')}
        </Link>
      </div>

      {/* User card at bottom */}
      {user && (
        <div className="border-t border-[var(--color-border-default)] p-3">
          <Link
            href={user.username ? `/u/${user.username}` : '/dashboard/settings'}
            className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-text-primary)]/[0.04]"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand-primary)]/30 to-[var(--color-brand-secondary)]/30 text-xs font-bold text-[var(--color-text-primary)]">
              {(user.displayName ?? user.username ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                {user.displayName ?? user.username ?? 'User'}
              </p>
              <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                {user.username ? `@${user.username}` : user.email ?? ''}
              </p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

export function DashboardSidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-[var(--color-border-default)] bg-[var(--color-background-secondary)] lg:block">
        <SidebarContent />
      </aside>
    </>
  );
}
