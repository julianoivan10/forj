'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import { NotificationsBell } from '@/components/dashboard/notifications-bell';
import { SearchTrigger } from '@/components/search/search-trigger';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { ModeSwitcher } from '@/components/dashboard/mode-switcher';
import { NetworkIndicator } from '@/components/dashboard/network-indicator';
import { useInboxCounts } from '@/components/dashboard/sidebar';
import { isActive, resolveHref, sectionsFor, tabsFor, type Mode } from '@/components/dashboard/nav-config';
import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

const TRAIL: Array<{ match: RegExp; label: string }> = [
  { match: /^\/dashboard\/contracts\/.+/, label: 'Contracts / Escrow' },
  { match: /^\/dashboard\/contracts\/?$/, label: 'Contracts' },
  { match: /^\/dashboard\/messages/, label: 'Inbox / Messages' },
  { match: /^\/dashboard\/notifications/, label: 'Inbox / Activity' },
  { match: /^\/dashboard\/jobs\/new/, label: 'Jobs / New' },
  { match: /^\/dashboard\/jobs/, label: 'Posted jobs' },
  { match: /^\/dashboard\/proposals/, label: 'Proposals' },
  { match: /^\/dashboard\/services/, label: 'Services' },
  { match: /^\/dashboard\/saved-services/, label: 'Saved / Services' },
  { match: /^\/dashboard\/saved/, label: 'Saved / Jobs' },
  { match: /^\/dashboard\/settings/, label: 'Settings' },
  { match: /^\/dashboard\/?$/, label: 'Console' },
];

/**
 * Top bar: where you are (mono trail) and global tools. On mobile it pairs
 * with <MobileTabBar>, which carries navigation.
 */
export function DashboardHeader() {
  const pathname = usePathname();
  const trail = TRAIL.find((r) => r.match.test(pathname))?.label ?? 'Workspace';

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-background)] px-4 sm:px-6 lg:px-8">
      <p className="min-w-0 flex-1 truncate font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
        <span className="text-[var(--color-text-tertiary)]">Forj / </span>
        {trail}
      </p>
      <div className="flex items-center gap-1 sm:gap-2">
        <SearchTrigger />
        <span className="hidden sm:inline-flex">
          <LanguageSwitcher />
        </span>
        <ThemeToggle />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}

/**
 * Mobile navigation: the four destinations that matter most for this
 * perspective as a bottom bar (thumb reach), everything else in a sheet.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();
  const counts = useInboxCounts();
  const [moreOpen, setMoreOpen] = useState(false);
  const mode = (user?.role ?? 'client') as Mode;
  const username = user?.username ?? null;
  const tabs = tabsFor(mode);

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [moreOpen]);

  const tabHrefs = new Set(tabs.map((i) => resolveHref(i, username)));
  const moreActive = !tabs.some((i) => isActive(i, resolveHref(i, username), pathname));

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--color-rule)] bg-[var(--color-background)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {tabs.map((item) => {
          const href = resolveHref(item, username);
          const active = isActive(item, href, pathname);
          const badge = item.badge ? counts[item.badge] : 0;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]',
                active ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]',
              )}
            >
              <span aria-hidden className={cn('absolute inset-x-4 top-0 h-[2px]', active && 'bg-[var(--color-brand-primary)]')} />
              <item.icon className="size-5" />
              {t(item.labelKey)}
              {badge > 0 ? (
                <span className="absolute right-[22%] top-2 min-w-4 bg-[var(--color-brand-primary)] px-1 font-mono text-[10px] leading-4 text-[var(--color-on-brand)] tnum">
                  {badge > 9 ? '9+' : badge}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="more-sheet"
          className={cn(
            'relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]',
            moreActive ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]',
          )}
        >
          <span aria-hidden className={cn('absolute inset-x-4 top-0 h-[2px]', moreActive && 'bg-[var(--color-brand-primary)]')} />
          <MoreHorizontal className="size-5" />
          {t('shell.more')}
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="All sections" id="more-sheet">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-[#16150f]/45" onClick={() => setMoreOpen(false)} />
          <div className="page-enter absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto border-t-2 border-[var(--color-rule)] bg-[var(--color-background)] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
            <div className="flex items-center justify-between">
              <NetworkIndicator />
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="inline-flex size-11 items-center justify-center text-[var(--color-text-secondary)]"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            {user ? (
              <div className="mt-2">
                <ModeSwitcher />
              </div>
            ) : null}
            {sectionsFor(mode).map((section) => (
              <div key={section.key} className="mt-5">
                <p className="label-mono">{t(section.titleKey)}</p>
                <ul className="mt-1 divide-y divide-[var(--color-border-default)] border-y border-[var(--color-border-default)]">
                  {section.items.map((item) => {
                    const href = resolveHref(item, username);
                    const active = isActive(item, href, pathname);
                    const badge = item.badge ? counts[item.badge] : 0;
                    return (
                      <li key={item.key}>
                        <Link
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-12 items-center justify-between text-[15px]',
                            active ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]',
                            tabHrefs.has(href) && 'text-[var(--color-text-tertiary)]',
                          )}
                        >
                          {t(item.labelKey)}
                          {badge > 0 ? <span className="font-mono text-xs text-[var(--color-brand-primary)] tnum">{badge}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
