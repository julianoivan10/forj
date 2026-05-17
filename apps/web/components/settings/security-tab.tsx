'use client';

import { useState } from 'react';
import {
  Download,
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Security & recovery panel.
 *
 * Surfaces two pro-active recovery levers per
 * `docs/design/emergency-recovery.md` §2a + §2b:
 *
 *   1. Recovery method — Privy guardians / passcode. If the user
 *      loses their primary login (email, OAuth), one of these is the
 *      fallback that gets them back in WITHOUT support intervention.
 *      `usePrivy().setWalletRecovery()` opens Privy's hosted modal.
 *
 *   2. Wallet export — exports the embedded wallet's private key so
 *      the user owns it independently of Privy. Useful if Privy ever
 *      becomes unavailable or the user wants to migrate to MetaMask /
 *      Rabby. Privy's `exportWallet()` shows the key once in their
 *      iframe; we never see it.
 *
 * We deliberately keep the UI explanatory — recovery is a "boring"
 * feature most users skip, so each section explains the trade-off in
 * plain language. The two CTAs are visually equivalent (no "primary"
 * styling) because users should configure BOTH eventually.
 *
 * What's NOT here:
 *   - admin re-link path (admin-only, see docs/OPERATIONS.md §8)
 *   - guardian status badge from on-chain state (Phase 3, needs a
 *     Privy webhook to know whether `setWalletRecovery` succeeded
 *     after the modal closed)
 */
export function SecurityTab() {
  const privy = usePrivy();
  const [exportBusy, setExportBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const isReady = privy.ready;
  // Privy's `setWalletRecovery` requires an authenticated session +
  // an existing embedded wallet. `exportWallet` has the same gate.
  // We don't gate the BUTTONS on these — let Privy's modal surface
  // the actual error if something's off — but we do show a soft
  // unavailable state when we know auth isn't ready.
  const canConfigureRecovery = isReady && privy.authenticated;
  const canExport = isReady && privy.authenticated;

  const handleSetRecovery = async () => {
    setRecoveryBusy(true);
    try {
      // Privy opens its own modal. Closing the modal without finishing
      // resolves the promise — no error. We re-enable the button via
      // the finally branch regardless of outcome.
      await privy.setWalletRecovery();
      toast.success('Recovery method updated.');
    } catch (err) {
      // Privy surfaces user-cancellation as a thrown error in some
      // builds. Don't toast for those — they intentionally backed out.
      const msg = err instanceof Error ? err.message : '';
      if (!/cancel|abort|close/i.test(msg)) {
        toast.error(msg || 'Could not open the recovery dialog.');
      }
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleExport = async () => {
    setExportBusy(true);
    try {
      await privy.exportWallet();
      toast.success('Wallet exported. Store the key offline.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/cancel|abort|close/i.test(msg)) {
        toast.error(msg || 'Could not open the export dialog.');
      }
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Intro / framing — explains WHY recovery matters before showing
          the levers. Many users skip "boring settings"; one short
          paragraph that names the failure mode is worth the screen
          real estate. */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              Recovery setup
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Your Forj account is anchored to a Privy-managed wallet. If
              you ever lose access to the email or social login you signed
              up with, one of the options below is what gets you back in.{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                Configure at least one.
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Recovery method — guardian / passcode / Privy account
          recovery. Trade-off explanation sits above the button. */}
      <SecurityCard
        icon={<KeyRound className="size-5" />}
        title="Recovery method"
        body="Set a passcode or link a recovery email/wallet so you can sign back in if you lose your primary login. Privy verifies this with cryptography — guardians can help you recover but can never move your funds."
        cta={
          <Button
            type="button"
            variant="secondary"
            onClick={handleSetRecovery}
            disabled={!canConfigureRecovery || recoveryBusy}
            leftIcon={recoveryBusy ? <Loader2 className="animate-spin" /> : undefined}
          >
            {recoveryBusy ? 'Opening…' : 'Configure recovery'}
          </Button>
        }
      />

      {/* Wallet export — escape hatch from Privy itself. */}
      <SecurityCard
        icon={<Download className="size-5" />}
        title="Export your wallet"
        body={
          <>
            One-shot export of your embedded wallet's private key. Import it
            into MetaMask, Rabby, or any wallet you control — from then on,
            losing your Privy account won't lose your funds. The key is
            shown once inside Privy's secure iframe.{' '}
            <span className="font-medium text-[var(--color-warning)]">
              Anyone with this key can move your funds. Store it offline.
            </span>
          </>
        }
        cta={
          <Button
            type="button"
            variant="secondary"
            onClick={handleExport}
            disabled={!canExport || exportBusy}
            leftIcon={exportBusy ? <Loader2 className="animate-spin" /> : undefined}
          >
            {exportBusy ? 'Opening…' : 'Export wallet'}
          </Button>
        }
      />

      {/* Counter-party escape valve — link to the help page that
          explains the auto-release flow. Important alongside the
          self-recovery levers because some failure modes need the
          *other* party to act. */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-secondary)]/60 p-4 text-sm text-[var(--color-text-secondary)]">
        <ShieldAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-[var(--color-text-tertiary)]"
        />
        <p className="leading-relaxed">
          If the <em>other</em> party in one of your contracts loses access,
          you can still recover funds via the 7-day auto-release window.
          See the{' '}
          <a
            href="/help/disputes-and-recovery"
            className="inline-flex items-center gap-1 text-[var(--color-brand-primary)] hover:underline"
          >
            disputes &amp; recovery help page
            <ExternalLink className="size-3" />
          </a>
          .
        </p>
      </div>

      {/* Soft notice while Privy is still hydrating — the buttons
          above are already disabled, this just explains why. */}
      {!isReady && (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Loading wallet session…
        </p>
      )}
    </div>
  );
}

function SecurityCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  cta: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-xl)] border border-[var(--color-border-default)]',
        'bg-[var(--color-background-secondary)] p-5',
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)]">
          {icon}
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {body}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:ml-3">{cta}</div>
    </div>
  );
}
