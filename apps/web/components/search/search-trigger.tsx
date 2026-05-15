'use client';

import { useEffect, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { useCommandPalette } from './command-palette-provider';
import { cn } from '@/lib/utils';

/**
 * Compact navbar/header button that opens the command palette.
 *
 * Two breakpoint modes:
 *   - **Mobile / narrow desktop**: icon-only button.
 *   - **Wide desktop** (md+): a fake input pill that hints at the
 *     search behaviour ("Search…  ⌘K") so first-time users know the
 *     palette exists without having to read docs.
 *
 * Modifier hint adapts to the user's OS — `⌘` on Mac, `Ctrl` everywhere
 * else. We detect once on mount and cache it; SSR renders the desktop
 * version which is safe since both labels are short.
 */
export function SearchTrigger() {
  const { open } = useCommandPalette();
  const [mod, setMod] = useState<'⌘' | 'Ctrl'>('⌘');

  useEffect(() => {
    // navigator.platform is deprecated but still works in every browser
    // we care about. The newer `navigator.userAgentData.platform` isn't
    // available in Safari yet, so falling back here is fine.
    const plat = typeof navigator !== 'undefined' ? navigator.platform : '';
    setMod(/Mac|iPhone|iPad/.test(plat) ? '⌘' : 'Ctrl');
  }, []);

  return (
    <>
      {/* Mobile / narrow — icon only */}
      <button
        type="button"
        onClick={open}
        aria-label="Open search"
        className={cn(
          'inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)] md:hidden',
        )}
      >
        <SearchIcon className="size-4" />
      </button>

      {/* Wide — pill with shortcut hint */}
      <button
        type="button"
        onClick={open}
        aria-label="Open search"
        className={cn(
          'hidden h-9 min-w-[220px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-3 text-sm text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-secondary)] md:inline-flex',
        )}
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-background)]/60 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {mod}K
        </kbd>
      </button>
    </>
  );
}
