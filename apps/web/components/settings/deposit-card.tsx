'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * "Top up your smart wallet" surface.
 *
 * Why this exists:
 *   Smart-wallet users (the default in Forj) hold USDC in their
 *   ERC-4337 smart wallet, NOT in any external wallet they may have
 *   connected during sign-in. So someone who has 50 USDC in MetaMask,
 *   Binance, or Indodax can't spend it directly here — they have to
 *   move it to the smart wallet first.
 *
 *   This card surfaces the smart wallet address with a QR code so users
 *   can scan it from a phone wallet, copy it into an exchange withdraw
 *   form, or share it with anyone who's paying them in USDC.
 *
 * Why we don't auto-build a "Transfer from MetaMask" button:
 *   It would require a wagmi `writeContract` from MetaMask to do the
 *   ERC-20 transfer — meaning a MetaMask popup, gas the user pays
 *   themselves, and the exact UX we're trying to avoid for non-crypto
 *   users. Manual copy-paste is uglier but predictable, and we keep the
 *   "no MetaMask in the happy path" promise intact. Power users who
 *   want the button can use MetaMask's own Send flow.
 */
export function DepositCard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [copied, setCopied] = useState(false);

  if (!isConnected || !address) return null;

  const isTestnet = chainId === 84532;
  const networkLabel = isTestnet ? 'Base Sepolia' : 'Base';
  const explorerBase = isTestnet
    ? 'https://sepolia.basescan.org'
    : 'https://basescan.org';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success('Address copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — clipboard blocked");
    }
  };

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="size-4 text-[var(--color-brand-primary)]" />
          <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Top up your wallet
          </h3>
        </div>
        <Badge variant={isTestnet ? 'warning' : 'brand'}>{networkLabel}</Badge>
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Already have USDC on MetaMask, an exchange, or another wallet? Send it
        to your smart wallet address below to use it here.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[auto,1fr]">
        {/* QR */}
        <div className="flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-white p-3">
          <QRCodeSVG
            value={address}
            size={120}
            // Brand the QR with a subtle dot in the centre when we have
            // room. Keep it minimal — overstyling hurts scan reliability.
            level="M"
            marginSize={0}
            bgColor="#ffffff"
            fgColor="#0a0a0a"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Your deposit address
            </p>
            <code className="mt-1 block break-all font-mono text-xs text-[var(--color-text-primary)]">
              {address}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium transition-colors',
                copied
                  ? 'border-[var(--color-success)]/50 bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy address'}
            </button>
            <a
              href={`${explorerBase}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
            >
              View on Basescan
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-3 text-xs text-[var(--color-text-secondary)]">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" />
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">
            Send USDC on {networkLabel} only
          </p>
          <p className="mt-0.5">
            Sending from a different chain (Ethereum, Polygon, BNB) or a
            different token will result in lost funds. Always double-check
            the network in your sending wallet before confirming.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <SourceHint
          label="From MetaMask"
          steps="Send → USDC → paste address → Base network"
        />
        <SourceHint
          label="From an exchange"
          steps="Withdraw → USDC → network: Base → paste address"
        />
        <SourceHint
          label="From another wallet"
          steps="Scan the QR code or copy address"
        />
      </div>
    </section>
  );
}

function SourceHint({ label, steps }: { label: string; steps: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-2.5">
      <p className="font-medium text-[var(--color-text-primary)]">{label}</p>
      <p className="mt-0.5 text-[var(--color-text-tertiary)]">{steps}</p>
    </div>
  );
}
