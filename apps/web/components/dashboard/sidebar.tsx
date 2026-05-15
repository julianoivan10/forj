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
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'messages' | 'notifications';
}

// Every authenticated user sees every nav item. We deliberately don't gate
// by role — a "client" who submits one proposal should see "My Proposals"
// from then on without flipping a setting. Empty lists are fine for users
// who haven't done that activity yet; they're a soft prompt to try.
const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Jobs', href: '/dashboard/jobs', icon: Briefcase },
  { label: 'My Proposals', href: '/dashboard/proposals', icon: FileText },
  { label: 'My Services', href: '/dashboard/services', icon: Sparkles },
  { label: 'Saved Jobs', href: '/dashboard/saved', icon: Bookmark },
  { label: 'Contracts', href: '/dashboard/contracts', icon: FileSignature },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare, badgeKey: 'messages' },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell, badgeKey: 'notifications' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

function SidebarContent() {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleItems = NAV_ITEMS;

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

      {/* Nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                // Distinctive nav item: a vermillion slab marker on the
                // left edge appears for the active item. Bauhaus cue —
                // the same anvil slab idea from the logo, now a tiny
                // accent that reads as "you are here". Hover state
                // shows a faded version of the same slab so the
                // transition feels mechanical, not animated soup.
                'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-all',
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
              <item.icon className={cn('size-[18px]', isActive ? 'text-[var(--color-brand-primary)]' : 'opacity-60')} />
              <span className="flex-1">{item.label}</span>
              {badgeCount > 0 && (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-brand-primary)] px-1.5 text-[10px] font-bold text-white">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
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
          View public site
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
