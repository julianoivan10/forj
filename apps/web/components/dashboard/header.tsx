'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  X,
  LayoutDashboard,
  Briefcase,
  FileText,
  FileSignature,
  MessageSquare,
  Bell,
  Bookmark,
  Sparkles,
  Settings,
} from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import { NotificationsBell } from '@/components/dashboard/notifications-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { SearchTrigger } from '@/components/search/search-trigger';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useT } from '@/lib/i18n/provider';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const DASHBOARD_TITLE_MAP: Array<{ match: RegExp; label: string }> = [
  { match: /^\/dashboard\/messages(\/.*)?$/, label: 'Messages' },
  { match: /^\/dashboard\/notifications(\/.*)?$/, label: 'Notifications' },
  { match: /^\/dashboard\/contracts(\/.*)?$/, label: 'Contracts' },
  { match: /^\/dashboard\/jobs(\/.*)?$/, label: 'My Jobs' },
  { match: /^\/dashboard\/proposals(\/.*)?$/, label: 'My Proposals' },
  { match: /^\/dashboard\/settings(\/.*)?$/, label: 'Settings' },
  { match: /^\/dashboard\/?$/, label: 'Dashboard' },
];

function getDashboardTitle(pathname: string): string {
  return DASHBOARD_TITLE_MAP.find((r) => r.match.test(pathname))?.label ?? 'Dashboard';
}

// Mobile drawer mirrors the desktop sidebar's grouped layout so users
// get a consistent mental model across breakpoints. Same Hiring/Work
// perspective split; same group ids drive the same mode-aware filter.
type Mode = 'client' | 'freelancer' | 'both';
interface MobileNavItemKeyed {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}
interface MobileNavGroup {
  id: string;
  titleKey: string | null;
  items: MobileNavItemKeyed[];
}
const GROUPS_BY_MODE: Record<Mode, Set<string>> = {
  client: new Set(['overview', 'hiring', 'contracts', 'inbox', 'account']),
  freelancer: new Set(['overview', 'work', 'contracts', 'inbox', 'account']),
  both: new Set(['overview', 'hiring', 'work', 'contracts', 'inbox', 'account']),
};
const MOBILE_NAV: MobileNavGroup[] = [
  { id: 'overview', titleKey: null, items: [{ labelKey: 'sidebar.overview', href: '/dashboard', icon: LayoutDashboard }] },
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
      { labelKey: 'sidebar.savedJobs', href: '/dashboard/saved', icon: Bookmark },
    ],
  },
  {
    id: 'contracts',
    titleKey: null,
    items: [{ labelKey: 'sidebar.contracts', href: '/dashboard/contracts', icon: FileSignature }],
  },
  {
    id: 'inbox',
    titleKey: 'sidebar.inbox',
    items: [
      { labelKey: 'sidebar.messages', href: '/dashboard/messages', icon: MessageSquare },
      { labelKey: 'sidebar.notifications', href: '/dashboard/notifications', icon: Bell },
    ],
  },
  {
    id: 'account',
    titleKey: 'sidebar.account',
    items: [{ labelKey: 'sidebar.settings', href: '/dashboard/settings', icon: Settings }],
  },
];

export function DashboardHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Derive page title from pathname. We map known top-level dashboard routes to
  // readable labels; anything deeper falls back to the nearest matching label so
  // detail pages (e.g. /dashboard/messages/<uuid>) don't leak raw IDs into the header.
  const title = getDashboardTitle(pathname);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-[var(--color-border-default)] bg-[var(--color-background-primary)]/80 px-4 backdrop-blur-xl lg:px-8">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        <h1 className="flex-1 font-display text-lg font-bold text-[var(--color-text-primary)] lg:text-xl">
          {title}
        </h1>

        <div className="flex items-center gap-2">
          <SearchTrigger />
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationsBell />
          <UserMenu />
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-[var(--color-border-default)] bg-[var(--color-background-secondary)] lg:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b border-[var(--color-border-default)] px-5">
                <span className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                  Menu
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04]"
                  aria-label="Close menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="overflow-y-auto p-3">
                {MOBILE_NAV.filter((g) => {
                  const mode = (user?.role ?? 'both') as Mode;
                  return GROUPS_BY_MODE[mode].has(g.id);
                }).map((group, gi) => (
                  <div key={group.id} className={cn(gi > 0 && 'mt-5')}>
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
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
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
                                isActive ? 'h-5 w-[3px] opacity-100' : 'h-0 w-0 opacity-0',
                              )}
                            />
                            <item.icon
                              className={cn(
                                'size-[18px]',
                                isActive ? 'text-[var(--color-brand-primary)]' : 'opacity-60',
                              )}
                            />
                            {t(item.labelKey)}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
