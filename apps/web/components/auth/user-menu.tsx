'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  User as UserIcon,
  Briefcase,
  FileText,
  Globe,
  Settings,
  LogOut,
  ChevronDown,
  Wallet,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

function shortAddr(addr?: string | null) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function UserMenu() {
  const router = useRouter();
  const { user, privyUser, logout } = useAuth();

  if (!user) return null;

  const displayName = user.displayName ?? user.username ?? 'You';
  const handle = user.username ? `@${user.username}` : shortAddr(user.walletAddress);
  const isFreelancer = user.role === 'freelancer' || user.role === 'both';
  const isClient = user.role === 'client' || user.role === 'both';
  const email = privyUser?.email?.address;

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="group inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-transparent pl-1 pr-2 py-1 text-sm font-medium text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-border-default)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]"
          aria-label="Account menu"
        >
          <UserAvatar name={displayName} imageUrl={user.avatarUrl} size="sm" />
          <span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
          <ChevronDown className="size-4 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className={cn(
            'z-50 min-w-[260px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]',
            'bg-[var(--color-background-secondary)]',
            'data-[state=open]:animate-fade-in-up',
          )}
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
            <UserAvatar name={displayName} imageUrl={user.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                {displayName}
              </p>
              <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                {handle || email}
              </p>
            </div>
          </div>

          {/* Wallet chip */}
          {user.walletAddress ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-[var(--color-text-tertiary)]">
              <Wallet className="size-3.5" />
              <span className="font-mono">{shortAddr(user.walletAddress)}</span>
            </div>
          ) : null}

          <DropdownMenu.Separator className="h-px bg-[var(--color-border-subtle)]" />

          <MenuLink href="/dashboard" icon={LayoutDashboard}>Dashboard</MenuLink>
          {user.username ? (
            <MenuLink href={`/u/${user.username}`} icon={UserIcon}>My Profile</MenuLink>
          ) : null}
          {isFreelancer ? (
            <MenuLink href="/dashboard/proposals" icon={FileText}>My Proposals</MenuLink>
          ) : null}
          {isClient ? (
            <MenuLink href="/dashboard/jobs" icon={Briefcase}>My Jobs</MenuLink>
          ) : null}

          <DropdownMenu.Separator className="h-px bg-[var(--color-border-subtle)]" />

          {/* Escape hatches back to the public site — handy for users who
              landed deep in the dashboard and want to re-share / browse. */}
          <MenuLink href="/" icon={Globe}>Public site</MenuLink>
          <MenuLink href="/dashboard/settings" icon={Settings}>Settings</MenuLink>

          <DropdownMenu.Item
            onSelect={handleLogout}
            className="flex cursor-pointer select-none items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-error)] outline-none transition-colors hover:bg-[var(--color-error)]/10 focus:bg-[var(--color-error)]/10"
          >
            <LogOut className="size-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item asChild>
      <Link
        href={href}
        className="flex cursor-pointer select-none items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-text-secondary)] outline-none transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)] focus:bg-[var(--color-text-primary)]/[0.04] focus:text-[var(--color-text-primary)]"
      >
        <Icon className="size-4 opacity-70" />
        {children}
      </Link>
    </DropdownMenu.Item>
  );
}
