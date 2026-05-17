'use client';

import { useState } from 'react';
import {
  AtSign,
  Check,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Twitter,
  Unlink,
  Wallet,
} from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { DeleteAccountCard } from '@/components/settings/delete-account-card';
import { cn } from '@/lib/utils';

/**
 * Security & recovery panel.
 *
 * Sections, in order:
 *
 *   1. Recovery setup — explanatory framing card (why this tab matters).
 *
 *   2. Recovery method — Privy's setWalletRecovery flow. Fallback
 *      login if the user loses their primary auth method.
 *      (`docs/design/emergency-recovery.md` §2a)
 *
 *   3. Export wallet — Privy's exportWallet flow. One-shot private
 *      key reveal so the user owns their wallet independently of
 *      Privy. (§2b)
 *
 *   4. Sign-in methods — list linkedAccounts from Privy, with add /
 *      remove for each method. Email + OAuth (Google, Twitter, etc.)
 *      live here. Lets a user add a BACKUP sign-in path: if their
 *      primary email gets compromised, the Google link still gets
 *      them back in.
 *
 *   5. Connected wallets — wallet-type linked accounts. Embedded
 *      wallet shown read-only (it's the canonical one); externals
 *      can be added (MetaMask, etc.) for the auto-re-link recovery
 *      path (see `getUserFromToken` wallet-match branch in
 *      `apps/web/lib/privy/server.ts`).
 *
 *   6. Counter-party escape valve — soft pointer to the
 *      auto-release help page (other side of recovery — what to do
 *      when your counter-party ghosts).
 *
 *   7. Danger zone — delete account. Lives here, not in Account, so
 *      destructive levers cluster with the recovery/sign-out
 *      controls. Industry convention; reduces accidental delete.
 *
 * Note re "change password": Privy's auth is email magic-link /
 * OAuth / wallet — there's no traditional password. The closest
 * equivalent is the embedded wallet's recovery method (#2 above),
 * which already exists. So no separate "change password" CTA.
 *
 * Note re "verify email": Privy verifies email at link time
 * (magic-link or OAuth flow), so anything on file is verified by
 * definition. We surface that confidence via the "Verified" badge in
 * the Account tab + indicator on each linked email here.
 */
export function SecurityTab() {
  const privy = usePrivy();
  const { user: dbUser } = useAuth();
  const [exportBusy, setExportBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState<string | null>(null);

  const isReady = privy.ready;
  const canAct = isReady && privy.authenticated;

  // Privy SDK exposes user as `usePrivy().user` — a richer object
  // than our DB row. Linked accounts live there.
  const privyUser = privy.user;
  const linkedAccounts = privyUser?.linkedAccounts ?? [];

  // Bucket linked accounts by type so each section renders the right
  // subset. Walletu uses linkedAccounts because Privy keeps wallet
  // metadata (chainType, walletClientType) attached there.
  const emails = linkedAccounts.filter(
    (a): a is Extract<typeof a, { type: 'email' }> => a.type === 'email',
  );
  const googles = linkedAccounts.filter(
    (a): a is Extract<typeof a, { type: 'google_oauth' }> => a.type === 'google_oauth',
  );
  const twitters = linkedAccounts.filter(
    (a): a is Extract<typeof a, { type: 'twitter_oauth' }> => a.type === 'twitter_oauth',
  );
  // Wallet-type accounts include both the Privy embedded wallet
  // (walletClientType === 'privy' / 'privy-v2') and externals
  // (MetaMask = 'metamask', WalletConnect, etc.).
  const wallets = linkedAccounts.filter(
    (a): a is Extract<typeof a, { type: 'wallet' }> => a.type === 'wallet',
  );
  const smartWallets = linkedAccounts.filter(
    (a): a is Extract<typeof a, { type: 'smart_wallet' }> => a.type === 'smart_wallet',
  );

  const handleSetRecovery = async () => {
    setRecoveryBusy(true);
    try {
      await privy.setWalletRecovery();
      toast.success('Recovery method updated.');
    } catch (err) {
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

  // Generic unlink. Privy requires ≥1 account remaining — refusing to
  // remove the last one is server-side. We surface that error.
  const handleUnlink = async (
    kind: 'email' | 'google' | 'twitter' | 'wallet',
    handle: string,
  ) => {
    setUnlinkBusy(handle);
    try {
      if (kind === 'email') await privy.unlinkEmail(handle);
      else if (kind === 'google') await privy.unlinkGoogle(handle);
      else if (kind === 'twitter') await privy.unlinkTwitter(handle);
      else if (kind === 'wallet') await privy.unlinkWallet(handle);
      toast.success('Sign-in method removed.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not remove that method.',
      );
    } finally {
      setUnlinkBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Intro / framing */}
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

      {/* 2. Recovery method */}
      <SecurityCard
        icon={<KeyRound className="size-5" />}
        title="Recovery method"
        body="Set a passcode or link a recovery email/wallet so you can sign back in if you lose your primary login. Privy verifies this with cryptography — guardians can help you recover but can never move your funds."
        cta={
          <Button
            type="button"
            variant="secondary"
            onClick={handleSetRecovery}
            disabled={!canAct || recoveryBusy}
            leftIcon={recoveryBusy ? <Loader2 className="animate-spin" /> : undefined}
          >
            {recoveryBusy ? 'Opening…' : 'Configure recovery'}
          </Button>
        }
      />

      {/* 3. Wallet export */}
      <SecurityCard
        icon={<Download className="size-5" />}
        title="Export your wallet"
        body={
          <>
            One-shot export of your embedded wallet&apos;s private key. Import
            it into MetaMask, Rabby, or any wallet you control — from then
            on, losing your Privy account won&apos;t lose your funds. The key
            is shown once inside Privy&apos;s secure iframe.{' '}
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
            disabled={!canAct || exportBusy}
            leftIcon={exportBusy ? <Loader2 className="animate-spin" /> : undefined}
          >
            {exportBusy ? 'Opening…' : 'Export wallet'}
          </Button>
        }
      />

      {/* 4. Sign-in methods */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
        <h3 className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
          Sign-in methods
        </h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Linking more than one method means losing access to one (e.g. a
          compromised email) doesn&apos;t lock you out. Privy verifies each
          method at link time — there&apos;s no separate verification step.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {emails.map((e) => (
            <LinkedRow
              key={`email-${e.address}`}
              icon={<AtSign className="size-4" />}
              label="Email"
              value={e.address}
              verified
              busy={unlinkBusy === e.address}
              onUnlink={() => handleUnlink('email', e.address)}
            />
          ))}
          {googles.map((g) => (
            <LinkedRow
              key={`google-${g.subject}`}
              icon={<GoogleLogo />}
              label="Google"
              value={g.email ?? g.name ?? g.subject}
              verified
              busy={unlinkBusy === g.subject}
              onUnlink={() => handleUnlink('google', g.subject)}
            />
          ))}
          {twitters.map((t) => (
            <LinkedRow
              key={`twitter-${t.subject}`}
              icon={<Twitter className="size-4" />}
              label="X / Twitter"
              value={t.username ?? t.name ?? t.subject}
              verified
              busy={unlinkBusy === t.subject}
              onUnlink={() => handleUnlink('twitter', t.subject)}
            />
          ))}
          {emails.length + googles.length + twitters.length === 0 && (
            <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] px-3 py-3 text-xs text-[var(--color-text-tertiary)]">
              No email or OAuth methods linked yet. Add one below as a
              backup sign-in path.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {emails.length === 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => privy.linkEmail()}
              disabled={!canAct}
              leftIcon={<Plus />}
            >
              Link email
            </Button>
          )}
          {googles.length === 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => privy.linkGoogle()}
              disabled={!canAct}
              leftIcon={<Plus />}
            >
              Link Google
            </Button>
          )}
          {twitters.length === 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => privy.linkTwitter()}
              disabled={!canAct}
              leftIcon={<Plus />}
            >
              Link X / Twitter
            </Button>
          )}
        </div>
      </div>

      {/* 5. Connected wallets */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
        <h3 className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
          Connected wallets
        </h3>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          External wallets prove you own an off-Privy address — useful if
          you ever need to recover your account via a different sign-in
          path. The embedded wallet is your default; you can&apos;t unlink it.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {smartWallets.map((sw) => (
            <LinkedRow
              key={`smart-${sw.address}`}
              icon={<Wallet className="size-4" />}
              label="Smart wallet (Forj default)"
              value={shortAddr(sw.address)}
              monospace
              locked
              dbWallet={dbUser?.walletAddress?.toLowerCase() === sw.address.toLowerCase()}
            />
          ))}
          {wallets.map((w) => (
            <LinkedRow
              key={`wallet-${w.address}`}
              icon={<Wallet className="size-4" />}
              label={
                w.walletClientType === 'privy' ||
                w.walletClientType === 'privy-v2'
                  ? 'Embedded wallet'
                  : `External (${w.walletClientType ?? 'wallet'})`
              }
              value={shortAddr(w.address)}
              monospace
              busy={unlinkBusy === w.address}
              locked={
                w.walletClientType === 'privy' ||
                w.walletClientType === 'privy-v2'
              }
              dbWallet={dbUser?.walletAddress?.toLowerCase() === w.address.toLowerCase()}
              onUnlink={
                w.walletClientType === 'privy' ||
                w.walletClientType === 'privy-v2'
                  ? undefined
                  : () => handleUnlink('wallet', w.address)
              }
            />
          ))}
          {wallets.length + smartWallets.length === 0 && (
            <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] px-3 py-3 text-xs text-[var(--color-text-tertiary)]">
              No wallet connected yet.
            </p>
          )}
        </div>

        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => privy.linkWallet()}
            disabled={!canAct}
            leftIcon={<Plus />}
          >
            Link external wallet
          </Button>
        </div>
      </div>

      {/* 6. Counter-party escape valve */}
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

      {!isReady && (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Loading wallet session…
        </p>
      )}

      {/* 7. Danger zone — delete account */}
      {dbUser?.username && (
        <div className="mt-2">
          <DeleteAccountCard username={dbUser.username} />
        </div>
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

function LinkedRow({
  icon,
  label,
  value,
  verified,
  monospace,
  locked,
  busy,
  dbWallet,
  onUnlink,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  verified?: boolean;
  monospace?: boolean;
  /** Show as read-only (no unlink button). Used for the default embedded wallet. */
  locked?: boolean;
  busy?: boolean;
  /** Highlights this wallet as the one we have stored in `users.walletAddress`. */
  dbWallet?: boolean;
  onUnlink?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm',
        dbWallet
          ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)]',
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
        <p
          className={cn(
            'truncate text-sm text-[var(--color-text-primary)]',
            monospace && 'font-mono text-xs',
          )}
        >
          {value}
        </p>
      </div>
      {verified && (
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--color-brand-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand-primary)]">
          <Check className="size-3" />
          Verified
        </span>
      )}
      {locked ? (
        <span className="text-[10px] text-[var(--color-text-tertiary)]">Default</span>
      ) : onUnlink ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUnlink}
          disabled={busy}
          leftIcon={busy ? <Loader2 className="animate-spin" /> : <Unlink />}
        >
          {busy ? 'Removing…' : 'Remove'}
        </Button>
      ) : null}
    </div>
  );
}

function shortAddr(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Minimal Google "G" mark — we don't ship the official asset, this
 *  is a workable mono substitute matching the size of other lucide icons. */
function GoogleLogo() {
  return (
    <Globe className="size-4" aria-label="Google" />
  );
}
