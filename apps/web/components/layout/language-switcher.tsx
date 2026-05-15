'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Globe2 } from 'lucide-react';
import { LANGUAGES } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

/**
 * Compact language picker for the navbar / dashboard header.
 *
 * Closes on selection (Radix dropdown's default behaviour) and
 * persists the choice via the I18n provider — no page reload needed,
 * the tree re-renders with the new dictionary.
 */
export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Change language"
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-transparent px-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-default)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
          )}
        >
          <Globe2 className="size-4 opacity-70" />
          <span className="hidden text-xs uppercase tracking-wider sm:inline">
            {current?.code}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[200px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-1 shadow-xl shadow-black/30"
        >
          {LANGUAGES.map((l) => {
            const isActive = l.code === lang;
            return (
              <DropdownMenu.Item
                key={l.code}
                onSelect={() => setLang(l.code)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none transition-colors',
                  isActive
                    ? 'bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
                )}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span className="flex-1">{l.label}</span>
                {isActive ? <Check className="size-3.5" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
