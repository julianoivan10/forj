'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n/provider';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ModeSwitcher } from '@/components/dashboard/mode-switcher';
import { NetworkIndicator } from '@/components/dashboard/network-indicator';
import { isActive, resolveHref, sectionsFor, type Mode } from '@/components/dashboard/nav-config';

/** Unread counts for nav badges, shared by the rail and the mobile bar. */
export function useInboxCounts() {
  const { user } = useAuth();
  const summary = api.inbox.summary.useQuery(undefined, {
    enabled: Boolean(user?.id),
    refetchInterval: user?.id ? 25_000 : false,
    refetchOnWindowFocus: true,
  });
  return {
    messages: summary.data?.messages ?? 0,
    notifications: summary.data?.notifications ?? 0,
  };
}

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="Forj home">
      <Image src="/logo.svg" alt="" width={24} height={24} className="size-6" />
      <span className="font-display text-[19px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">Forj</span>
    </Link>
  );
}

/**
 * Desktop navigation rail. Text-first: section labels in mono, items as
 * plain words with an accent rule on the active one. No icon grid, no
 * filled pills.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();
  const counts = useInboxCounts();
  const mode = (user?.role ?? 'client') as Mode;
  const username = user?.username ?? null;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-background)] lg:flex">
      <div className="flex h-14 items-center border-b border-[var(--color-rule)] px-5">
        <Wordmark href="/dashboard" />
      </div>

      {user ? (
        <div className="border-b border-[var(--color-border-default)] px-3 py-3">
          <ModeSwitcher />
        </div>
      ) : null}

      <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-3 py-4">
        {sectionsFor(mode).map((section) => (
          <div key={section.key} className="mb-5 last:mb-0">
            <p className="label-mono px-3 pb-1.5">{t(section.titleKey)}</p>
            <ul>
              {section.items.map((item) => {
                const href = resolveHref(item, username);
                const active = isActive(item, href, pathname);
                const badge = item.badge ? counts[item.badge] : 0;
                return (
                  <li key={item.key}>
                    <Link
                      href={href}
                      data-tour={item.dataTour}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex min-h-9 items-center justify-between gap-3 px-3 text-[14px] transition-colors',
                        active
                          ? 'font-semibold text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'absolute inset-y-1.5 left-0 w-[2px]',
                          active ? 'bg-[var(--color-brand-primary)]' : 'bg-transparent',
                        )}
                      />
                      {t(item.labelKey)}
                      {badge > 0 ? (
                        <span className="font-mono text-[11px] font-semibold text-[var(--color-brand-primary)] tnum">
                          {badge > 99 ? '99+' : badge}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-[var(--color-border-default)] px-5 py-4">
        <NetworkIndicator stacked />
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          {t('shell.publicSite')}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
