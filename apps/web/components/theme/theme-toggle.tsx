'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme, type ThemePreference } from './theme-provider';
import { cn } from '@/lib/utils';

/**
 * Segmented 3-button theme toggle.
 *
 * Replaces the old single-button cycle (which forced users to memorise
 * "current state → next state"). All three options are visible at once;
 * the active one is highlighted by a sliding pill background that animates
 * with framer-motion's shared `layoutId`.
 *
 * Compact: 3×24px buttons + 4px gap = 84px wide. Fits in any header.
 */

const OPTIONS: Array<{
  value: ThemePreference;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { value: 'light', icon: Sun, label: 'Light theme' },
  { value: 'system', icon: Monitor, label: 'Follow system theme' },
  { value: 'dark', icon: Moon, label: 'Dark theme' },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-1',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const isActive = theme === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'relative inline-flex size-7 items-center justify-center rounded-[var(--radius-full)] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]',
              isActive
                ? 'text-[var(--color-brand-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {isActive ? (
              <motion.span
                layoutId="theme-toggle-active"
                className="absolute inset-0 rounded-[var(--radius-full)] bg-[var(--color-glow-brand)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                aria-hidden
              />
            ) : null}
            <Icon className="relative z-10 size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact icon-only version for very tight spots (mobile menu footer etc).
 * Cycles through the same 3 states on click.
 */
export function ThemeToggleCompact({ className }: { className?: string }) {
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'light' ? Sun : Moon;
  const label =
    theme === 'system'
      ? `Theme: system (${resolvedTheme}). Click to switch.`
      : `Theme: ${theme}. Click to switch.`;
  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors',
        'hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]',
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
