'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';
import { ShieldCheck, X, ArrowRight } from 'lucide-react';

/**
 * Recovery-setup nudge banner on /dashboard.
 *
 * Why: most users skip the Security tab on signup ("boring settings")
 * but it's where the recovery levers live. Once funded escrows start
 * sitting in their wallet, losing access has real cost. This banner
 * gets in front of them on the dashboard until they've configured at
 * least one of:
 *
 *   - a recovery method on the embedded wallet
 *     (`wallet.recoveryMethod` set), OR
 *   - a backup sign-in method (>1 linked account)
 *
 * Either is enough to NOT lock out on primary auth loss.
 *
 * Dismiss: localStorage, 30-day expiry. Re-shows after the dismissal
 * window so we re-nudge users who put it off — recovery hygiene
 * matters, this isn't a one-time prompt to forget.
 *
 * Mounts once at the top of /dashboard. Hides itself when the
 * underlying state changes (e.g. user just linked an email in
 * Settings → Security): Privy re-renders with fresh linkedAccounts,
 * `eligibleToNudge` flips false, banner unmounts.
 */
const STORAGE_KEY = 'forj:recovery-nudge-dismissed-at';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function RecoveryNudge() {
  const privy = usePrivy();
  const [, force] = useState(0);

  const eligibleToNudge = useMemo(() => {
    if (!privy.ready || !privy.authenticated || !privy.user) return false;
    const linked = privy.user.linkedAccounts ?? [];
    // Distinct sign-in methods (wallet types are separate from
    // email/oauth for this check — losing a wallet doesn't help if
    // you also can't sign in to retrieve it).
    const nonWalletMethods = linked.filter(
      (a) => a.type !== 'wallet' && a.type !== 'smart_wallet',
    );
    const hasBackupAuth = nonWalletMethods.length > 1;
    // Embedded wallet's `recoveryMethod` is set when the user
    // completed Privy's setWalletRecovery flow. Multiple wallets ⇒
    // any one configured is fine.
    const walletAccounts = linked.filter(
      (a): a is Extract<typeof a, { type: 'wallet' }> => a.type === 'wallet',
    );
    const hasWalletRecovery = walletAccounts.some(
      (w) => w.recoveryMethod && w.recoveryMethod !== 'privy',
    );
    return !(hasBackupAuth || hasWalletRecovery);
  }, [privy.ready, privy.authenticated, privy.user]);

  const dismissedRecently = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (Number.isNaN(at)) return false;
    return Date.now() - at < DISMISS_DURATION_MS;
  }, []);

  if (!eligibleToNudge || dismissedRecently) return null;

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    // Force remount the memo so the banner unmounts immediately
    // instead of waiting on a parent re-render. (Same trick as
    // profile-completeness: trivial state bump.)
    force((n) => n + 1);
  };

  return (
    <motion.section
      data-recovery-nudge
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-warning)]/30 bg-gradient-to-br from-[var(--color-warning)]/10 via-[var(--color-background-secondary)] to-[var(--color-background-secondary)] p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss recovery setup nudge"
        className="absolute right-3 top-3 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.06] hover:text-[var(--color-text-primary)]"
      >
        <X className="size-3.5" />
      </button>

      <div className="flex flex-wrap items-start gap-4 sm:flex-nowrap">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)] sm:text-lg">
            Set up account recovery
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            You&apos;re only one lost login away from being locked out. Add a
            backup sign-in method or wallet recovery passcode — takes 30
            seconds. Without it, losing access to your primary email or
            OAuth means losing access to funded escrows too.
          </p>
          <div className="mt-3 flex items-center gap-2 pr-8 sm:pr-0">
            <Link
              href="/dashboard/settings?tab=security"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-warning)] px-3 py-1.5 text-sm font-semibold text-[var(--color-background-primary)] transition-opacity hover:opacity-90"
            >
              Configure recovery
              <ArrowRight className="size-3.5" />
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
