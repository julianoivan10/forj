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

// Mobile nav mirrors the sidebar — every authenticated user sees every entry.
// Role gating was removed in Phase 6: empty lists are a softer prompt than a
// hidden menu item ("you don't have any proposals yet" beats "you don't have
// permission to bid").
const MOBILE_NAV: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Jobs', href: '/dashboard/jobs', icon: Briefcase },
  { label: 'My Proposals', href: '/dashboard/proposals', icon: FileText },
  { label: 'My Services', href: '/dashboard/services', icon: Sparkles },
  { label: 'Saved Jobs', href: '/dashboard/saved', icon: Bookmark },
  { label: 'Contracts', href: '/dashboard/contracts', icon: FileSignature },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function DashboardHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = MOBILE_NAV;

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
              <nav className="space-y-1 p-3">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
                      )}
                    >
                      {/* Same vermillion slab marker as desktop sidebar
                          — visual consistency across breakpoints. */}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full bg-[var(--color-brand-primary)] transition-all',
                          isActive ? 'h-5 w-[3px] opacity-100' : 'h-0 w-0 opacity-0',
                        )}
                      />
                      <item.icon className={cn('size-[18px]', isActive && 'text-[var(--color-brand-primary)]')} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
