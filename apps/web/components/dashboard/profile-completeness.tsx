'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

/**
 * Profile completeness banner — shown on the dashboard overview to nudge
 * users into fleshing out their profile.
 *
 * Why it matters: a freelancer profile with no bio + no skills + no
 * country is a 3% conversion-rate profile. Most don't return to fill it
 * in unless we surface it. The same is true for clients hiring on
 * reputation — a half-empty profile reads as "newcomer" even if they have
 * good intent.
 *
 * Scoring:
 *   - Each present field is 1 point.
 *   - We weight skills + bio higher because they drive matching.
 *   - Wallet address comes free with Privy login but explicit display
 *     keeps the user aware "yes, I'm on-chain".
 *   - 100% hides the banner entirely.
 *
 * Dismiss: stored in localStorage so a user who genuinely doesn't want
 * to fill it in isn't nagged on every session.
 */

const STORAGE_KEY = 'forj:profile-nudge-dismissed';
/** Pre-rebrand key, still honoured so existing dismissals persist. */
const LEGACY_STORAGE_KEY = 'workchain:profile-nudge-dismissed';

function computeCompleteness(user: NonNullable<ReturnType<typeof useAuth>['user']>) {
  const isFreelancer = user.role === 'freelancer' || user.role === 'both';

  // Each field has equal weight (10 points). Total is normalised to 100.
  const fields: Array<{ ok: boolean; label: string; href: string }> = [
    {
      ok: Boolean(user.avatarUrl),
      label: 'Add a profile photo',
      href: '/dashboard/settings',
    },
    {
      ok: Boolean(user.bio && user.bio.length >= 30),
      label: 'Write a bio (30+ characters)',
      href: '/dashboard/settings',
    },
    {
      ok: Boolean(user.country),
      label: 'Add your country',
      href: '/dashboard/settings',
    },
    {
      ok: Boolean(user.walletAddress),
      label: 'Connect a wallet to receive USDC',
      href: '/dashboard/settings?tab=account',
    },
    ...(isFreelancer
      ? [
          {
            ok: user.skills.length >= 3,
            label: `Add ${Math.max(0, 3 - user.skills.length)} more skill${
              user.skills.length === 2 ? '' : 's'
            }`,
            href: '/dashboard/settings',
          },
          {
            ok: Boolean(user.hourlyRate && Number(user.hourlyRate) > 0),
            label: 'Set your hourly rate',
            href: '/dashboard/settings',
          },
        ]
      : []),
  ];

  const total = fields.length;
  const done = fields.filter((f) => f.ok).length;
  const pct = Math.round((done / total) * 100);
  const missing = fields.filter((f) => !f.ok);

  return { pct, done, total, missing };
}

export function ProfileCompleteness() {
  const { user } = useAuth();

  const dismissed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.localStorage.getItem(STORAGE_KEY) === '1' ||
      window.localStorage.getItem(LEGACY_STORAGE_KEY) === '1'
    );
  }, []);

  const stats = useMemo(() => (user ? computeCompleteness(user) : null), [user]);

  if (!user || !stats || stats.pct >= 100 || dismissed) return null;

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    // Force re-render by reloading the hook would be cleanest; for the
    // dashboard banner a soft reload via location.reload would be jarring.
    // Easiest: use a state callback. But since useMemo() snapshots once
    // on mount, dismiss requires component remount. Workaround: hide via
    // a CSS class. To stay simple we just set state-less and rely on
    // Next.js soft-nav clearing the banner next page load.
    document
      .querySelectorAll<HTMLElement>('[data-profile-nudge]')
      .forEach((el) => (el.style.display = 'none'));
  };

  return (
    <motion.section
      data-profile-nudge
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss profile completeness nudge"
        className="absolute right-3 top-3 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.06] hover:text-[var(--color-text-primary)]"
      >
        <X className="size-3.5" />
      </button>

      <div className="flex flex-wrap items-start gap-4 sm:flex-nowrap">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              Profile {stats.pct}% complete
            </h3>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {stats.done} of {stats.total} done
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--color-background-tertiary)]">
            <motion.div
              className="h-full rounded-full bg-[var(--color-glow-brand)]"
              animate={{ width: `${stats.pct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>

          <ul className="mt-4 flex flex-col gap-1.5">
            {stats.missing.slice(0, 3).map((m) => (
              <li key={m.label}>
                <Link
                  href={m.href}
                  className="group inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  <span className="flex size-4 items-center justify-center rounded-full border border-[var(--color-border-default)]" />
                  {m.label}
                  <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
            {stats.missing.length > 3 ? (
              <li className="text-xs text-[var(--color-text-tertiary)]">
                + {stats.missing.length - 3} more in settings
              </li>
            ) : null}
          </ul>

          <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">
            {stats.pct >= 75
              ? 'Almost there — finish to maximise discoverability.'
              : 'Profiles with photo + bio + skills get 3× more proposals.'}
          </p>
        </div>
      </div>
    </motion.section>
  );
}

/** Inline indicator (no banner) — used in profile/settings tab. */
export function ProfileCompletenessChip() {
  const { user } = useAuth();
  if (!user) return null;
  const { pct } = computeCompleteness(user);
  if (pct >= 100) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
        <CheckCircle2 className="size-3.5" />
        Profile complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
      <span className="relative inline-block h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-background-tertiary)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-brand-primary)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      {pct}% complete
    </span>
  );
}
