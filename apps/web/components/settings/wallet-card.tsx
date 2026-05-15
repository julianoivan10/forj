'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { formatUnits } from 'viem';
import { Badge, Button, Skeleton } from '@/components/ui';
import { FundWalletButton } from '@/components/settings/fund-wallet-button';
import { useUsdcBalance } from '@/hooks/use-escrow';
import { SMART_WALLETS_ENABLED } from '@/hooks/use-fund-escrow-smart';
import { cn } from '@/lib/utils';

const CHAIN_META: Record<number, { name: string; explorer: string; testnet: boolean }> = {
  8453: { name: 'Base', explorer: 'https://basescan.org', testnet: false },
  84532: { name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org', testnet: true },
};

const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_META).map(Number);

/**
 * Wallet status card for the settings → Account tab.
 *
 * Goals:
 *  - Surface the wallet a user can give a client to receive USDC payouts.
 *  - Show their live USDC balance (so they're not surprised when funding fails).
 *  - Indicate which chain they're on, and warn when it's an unsupported network
 *    (Privy may default to Ethereum mainnet for some auth methods).
 *
 * The card stays *display-only* for now — actual chain switching happens via
 * Privy's modal, which we don't reach into. A "switch network" affordance
 * could land in a later iteration once we wire `useSwitchChain` against the
 * Privy embedded wallet.
 */
export function WalletCard({ dbWallet }: { dbWallet: string | null }) {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const usdc = useUsdcBalance();
  const [copied, setCopied] = useState(false);

  // The DB wallet (from `users.walletAddress`, written at first auth) is the
  // canonical address other users see on the freelancer's profile. The
  // wagmi address is the *currently connected* one — when smart wallets are
  // enabled this returns the **smart wallet** (because `SmartWalletsProvider`
  // sits outside `WagmiProvider`), so it can legitimately differ from
  // `dbWallet` until the next `getUserFromToken` sync rewrites the DB.
  //
  // Display priority:
  //   - In smart-wallet mode: prefer the live (smart) address. The DB row
  //     auto-syncs to this value on the next session check, but we don't
  //     want to wait — we want the user to see the address they should
  //     actually fund, immediately.
  //   - In EOA mode: prefer the DB address. wagmi's `address` can blink
  //     `undefined` between auth state changes; falling back to a stale
  //     DB value avoids "No wallet on file" flashes.
  const liveAddress = address ?? null;
  const chainInfo = chainId ? CHAIN_META[chainId] : undefined;
  const isSupported = chainId ? SUPPORTED_CHAIN_IDS.includes(chainId) : false;

  const displayAddress = SMART_WALLETS_ENABLED
    ? liveAddress ?? dbWallet
    : dbWallet ?? liveAddress;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Wallet address copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — your browser may have blocked clipboard access");
    }
  };

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-[var(--color-brand-primary)]" />
          <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Wallet
          </h3>
        </div>
        {isConnected ? (
          <Badge variant="success">Connected</Badge>
        ) : isConnecting ? (
          <Badge variant="default">Connecting…</Badge>
        ) : (
          <Badge variant="warning">Not connected</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        This address receives your freelance payouts in USDC. Share it with confidence —
        it's your on-chain identity on Forj.
      </p>

      {!displayAddress ? (
        <EmptyWallet />
      ) : (
        <>
          <div className="mt-4 flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2.5">
              <code className="truncate font-mono text-xs text-[var(--color-text-primary)]">
                {displayAddress}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copy(displayAddress)}
              className={cn(
                'inline-flex items-center justify-center rounded-[var(--radius-md)] border px-3 transition-colors',
                copied
                  ? 'border-[var(--color-success)]/50 bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
              )}
              aria-label="Copy wallet address"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
            {chainInfo ? (
              <a
                href={`${chainInfo.explorer}/address/${displayAddress}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                aria-label="View on block explorer"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
          </div>

          {/* Drift warning — DB has one address, wallet shows another.
              In smart-wallet mode the auto-sync in `getUserFromToken`
              rewrites the DB on the next round-trip, so this branch is
              usually a one-render flash and we suppress the warning to
              avoid scaring the user. In EOA mode it's still an actionable
              warning ("you switched Privy accounts"). */}
          {!SMART_WALLETS_ENABLED &&
          dbWallet &&
          liveAddress &&
          dbWallet.toLowerCase() !== liveAddress.toLowerCase() ? (
            <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-3 text-xs text-[var(--color-text-secondary)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" />
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">
                  Different wallet detected
                </p>
                <p className="mt-0.5">
                  Your saved address ends in {dbWallet.slice(-6)} but your wallet is showing{' '}
                  {liveAddress.slice(-6)}. Sign out and back in to update your saved address.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <UsdcStat
              loading={usdc.isLoading}
              units={(usdc.data as bigint | undefined) ?? null}
              chainName={chainInfo?.name ?? null}
            />
            <ChainStat chainId={chainId} info={chainInfo} supported={isSupported} />
          </div>

          {/* Fiat on-ramp / faucet shortcut.
              On mainnet: Privy's hosted on-ramp (MoonPay / Coinbase) sends
                USDC straight to this address.
              On testnet: link to the Circle faucet (real on-ramps don't
                sell test USDC — that would defeat the point). */}
          <div className="mt-4">
            <FundWalletButton walletAddress={displayAddress} className="w-full sm:w-auto" />
            <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
              {chainInfo?.testnet
                ? 'Testnet USDC is free — claim from the Circle faucet to get started.'
                : 'Card → USDC. Funds settle on Base in a few minutes. We never touch the money — Privy + the on-ramp partner handle it directly.'}
            </p>
          </div>

          {!isSupported && chainId ? (
            <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-3 text-xs text-[var(--color-text-secondary)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-error)]" />
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">
                  Wrong network
                </p>
                <p className="mt-0.5">
                  Forj settles on Base. Switch to Base or Base Sepolia in your wallet
                  before funding or claiming an escrow.
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function UsdcStat({
  loading,
  units,
  chainName,
}: {
  loading: boolean;
  units: bigint | null;
  chainName: string | null;
}) {
  const value = units != null ? Number(formatUnits(units, 6)) : null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-3">
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
        USDC balance
      </p>
      {loading ? (
        <Skeleton className="mt-1 h-5 w-20" />
      ) : value == null ? (
        <p className="mt-0.5 text-sm text-[var(--color-text-tertiary)]">—</p>
      ) : (
        <p className="mt-0.5 font-display text-lg font-semibold text-[var(--color-text-primary)]">
          {value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">USDC</span>
        </p>
      )}
      {chainName ? (
        <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
          on {chainName}
        </p>
      ) : null}
    </div>
  );
}

function ChainStat({
  chainId,
  info,
  supported,
}: {
  chainId: number | undefined;
  info: { name: string; testnet: boolean } | undefined;
  supported: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-3">
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Network
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Zap
          className={cn(
            'size-3.5',
            supported
              ? 'text-[var(--color-brand-primary)]'
              : 'text-[var(--color-text-tertiary)]',
          )}
        />
        <span className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
          {info?.name ?? (chainId ? `Chain ${chainId}` : 'No wallet')}
        </span>
        {info?.testnet ? <Badge variant="warning">Testnet</Badge> : null}
      </div>
    </div>
  );
}

function EmptyWallet() {
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/40 p-5 text-center">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">
        No wallet on file
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Sign in with email + create an embedded wallet, or connect an external wallet
        through Privy. You'll need this to receive USDC payouts.
      </p>
    </div>
  );
}
