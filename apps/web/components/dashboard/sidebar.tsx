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
 * Mode-aware nav visibility. Keyed on i18n label keys so we don't
 * stringly-couple to specific labels. `both` mode keeps the existing
 * behaviour (everything visible).
 */
const VISIBLE_BY_MODE: Record<'client' | 'freelancer', Set<string>> = {
  client: new Set([
    'sidebar.overview',
    'sidebar.myJobs',
    'sidebar.savedServices',  // buyer-side bookmarks
    // Saved Jobs hidden in client mode (worker affordance)
    'sidebar.contracts',
    'sidebar.messages',
    'sidebar.notifications',
    'sidebar.settings',
  ]),
  freelancer: new Set([
    'sidebar.overview',
    'sidebar.myProposals',
    'sidebar.myServices',
    'sidebar.savedJobs',
    // Saved Services hidden in freelancer mode (buyer affordance)
    'sidebar.contracts',
    'sidebar.messages',
    'sidebar.notifications',
    'sidebar.settings',
  ]),
};

interface NavItem {
  /** i18n key resolved at render time. e.g. `sidebar.myJobs`. */
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'messages' | 'notifications';
  /** Indents the row + drops the icon size — used for "Saved Jobs" as
   *  a sub-item of "My Jobs". Keeps related entries grouped without
   *  needing a separate expand/collapse mechanism. */
  sub?: boolean;
  /** Optional tour-target hook so `dashboard-tour.tsx` can highlight
   *  this row without relying on `href` selectors that change with
   *  routing renames. */
  dataTour?: string;
}

interface NavGroup {
  /** i18n key for the section header; null hides the header (for the
   *  first untitled group that holds Overview). */
  titleKey: string | null;
  items: NavItem[];
}

// Grouped navigation. Each group renders with a SMALL CAPS header above
// it (except the headerless first group) and a 4px gap between groups.
// Labels reference i18n keys (`sidebar.*`) — resolved per-render so
// switching language re-renders with the new strings without a reload.
const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: null,
    items: [{ labelKey: 'sidebar.overview', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    titleKey: 'sidebar.work',
    items: [
      { labelKey: 'sidebar.myJobs', href: '/dashboard/jobs', icon: Briefcase },
      { labelKey: 'sidebar.savedJobs', href: '/dashboard/saved', icon: Bookmark, sub: true, dataTour: 'sidebar-saved' },
      { labelKey: 'sidebar.myProposals', href: '/dashboard/proposals', icon: FileText },
      { labelKey: 'sidebar.myServices', href: '/dashboard/services', icon: Sparkles },
      { labelKey: 'sidebar.savedServices', href: '/dashboard/saved-services', icon: Bookmark, sub: true },
      { labelKey: 'sidebar.contracts', href: '/dashboard/contracts', icon: FileSignature },
    ],
  },
  {
    titleKey: 'sidebar.inbox',
    items: [
      { labelKey: 'sidebar.messages', href: '/dashboard/messages', icon: MessageSquare, badgeKey: 'messages' },
      { labelKey: 'sidebar.notifications', href: '/dashboard/notifications', icon: Bell, badgeKey: 'notifications' },
    ],
  },
  {
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

  const mode = (user?.role ?? 'both') as 'client' | 'freelancer' | 'both';
  // Filter nav groups by mode. `both` keeps the full list. Other modes
  // hide items irrelevant to that perspective (e.g. Saved Jobs hidden
  // for client-mode users — that's a worker affordance).
  const visibleGroups =
    mode === 'both'
      ? NAV_GROUPS
      : NAV_GROUPS.map((g) => ({
          ...g,
          items: g.items.filter((item) => VISIBLE_BY_MODE[mode].has(item.labelKey)),
        })).filter((g) => g.items.length > 0);

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
                      'group relative flex items-center gap-3 rounded-[var(--radius-md)] py-2 text-sm font-medium transition-all',
                      // Sub-items get pushed in by ~14px and use a smaller
                      // icon so the parent/child hierarchy reads at a glance
                      // without needing a connector line.
                      item.sub ? 'pl-8 pr-3' : 'px-3',
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
                        item.sub ? 'size-4' : 'size-[18px]',
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
