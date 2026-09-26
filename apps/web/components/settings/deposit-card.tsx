'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  Copy,
  CreditCard,
  Droplet,
  ExternalLink,
} from 'lucide-react';
import { useChainId } from 'wagmi';
import { Badge } from '@/components/ui';
import { useCanonicalWallet } from '@/hooks/use-canonical-wallet';
import { cn } from '@/lib/utils';

/**
 * "Top up your wallet" surface — the only on-ramp affordance in the
 * dashboard. Combines:
 *   1. Smart wallet address + QR code (for copy/scan-from-another-wallet)
 *   2. MoonPay widget link (buy USDC with card)
 *   3. Circle faucet link (testnet only)
 *
 * Why one card instead of "Wallet card with Fund button" + "Deposit card":
 *   The two were redundant — both nudged the user to add USDC. Folding
 *   them into a single surface clarifies the affordance: "this is where
 *   money comes IN" lives in one place, sibling to the Withdraw card
 *   ("this is where money goes OUT"). Keeps the mental model symmetric.
 *
 * MoonPay link is built client-side from `NEXT_PUBLIC_MOONPAY_API_KEY` +
 * `NEXT_PUBLIC_MOONPAY_ENV`. Sandbox env opens `buy-sandbox.moonpay.com`
 * with test cards; production env opens `buy.moonpay.com`. No widget
 * SDK is loaded — we just hand off via URL with prefilled params so
 * the user lands on a checkout that already knows their wallet, the
 * currency, and the network. Closing the MoonPay tab returns to Forj
 * unchanged; the on-ramp partner is fully responsible for the flow.
 */
export function DepositCard() {
  const { address } = useCanonicalWallet();
  const chainId = useChainId();
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  const isTestnet = chainId === 84532;
  const networkLabel = isTestnet ? 'Base Sepolia' : 'Base';
  const explorerBase = isTestnet
    ? 'https://sepolia.basescan.org'
    : 'https://basescan.org';

  const moonpayKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY ?? '';
  const moonpayEnv = process.env.NEXT_PUBLIC_MOONPAY_ENV ?? 'sandbox';
  // MoonPay sandbox doesn't support Base Sepolia (no testnet support for
  // chain settlement). On testnet we hide the MoonPay button and point
  // people at the Circle faucet instead — they don't need a credit card
  // to play with test USDC.
  const moonpayAvailable = !isTestnet && moonpayKey.length > 0;
  const moonpayBaseUrl =
    moonpayEnv === 'production'
      ? 'https://buy.moonpay.com'
      : 'https://buy-sandbox.moonpay.com';
  const moonpayUrl =
    `${moonpayBaseUrl}?apiKey=${encodeURIComponent(moonpayKey)}` +
    `&currencyCode=usdc_base` +
    `&walletAddress=${address}` +
    `&baseCurrencyCode=usd&baseCurrencyAmount=20` +
    `&redirectURL=${encodeURIComponent(
      typeof window !== 'undefined' ? window.location.origin + '/dashboard/settings' : '',
    )}`;

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
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]">
      {/* Header strip — slightly tinted so the eye treats this card as
          a distinct surface from the Wallet card above it. */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
            <ArrowDownToLine className="size-3.5" />
          </span>
          <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Top up your wallet
          </h3>
        </div>
        <Badge variant={isTestnet ? 'warning' : 'brand'}>{networkLabel}</Badge>
      </header>

      <div className="p-5">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Send USDC from any wallet or buy with card.
          {' '}Address below is your smart wallet — same one that pays escrows.
        </p>

        {/* QR + address — featured prominent block.
            Mobile stacks (QR centred), desktop side-by-side. */}
        <div className="mt-5 flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
          {/* QR pane with subtle Bauhaus corner accents */}
          <div className="relative mx-auto shrink-0 sm:mx-0">
            {/* Decorative corner ticks — vermillion + cobalt L-shaped
                marks at three of the four corners. Reads as a viewfinder
                without being literal, ties the QR into the brand. */}
            <span aria-hidden className="absolute -left-1 -top-1 size-3 border-l-2 border-t-2 border-[var(--color-brand-primary)]" />
            <span aria-hidden className="absolute -right-1 -top-1 size-3 border-r-2 border-t-2 border-[var(--color-brand-secondary)]" />
            <span aria-hidden className="absolute -bottom-1 -left-1 size-3 border-b-2 border-l-2 border-[var(--color-brand-accent)]" />
            <div className="flex items-center justify-center rounded-[var(--radius-md)] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
              <QRCodeSVG
                value={address}
                size={140}
                level="M"
                marginSize={0}
                bgColor="#ffffff"
                fgColor="#16150F"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
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

            {/* Primary on-ramp CTAs — what most non-crypto users actually
                want. Buy USDC with card, or claim test USDC on Sepolia. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {moonpayAvailable ? (
                <a
                  href={moonpayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-brand)] transition-all hover:bg-[var(--color-brand-secondary)]"
                >
                  <CreditCard className="size-4" />
                  Buy USDC with card
                </a>
              ) : isTestnet ? (
                <a
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-brand)] transition-all hover:bg-[var(--color-brand-secondary)]"
                >
                  <Droplet className="size-4" />
                  Claim testnet USDC
                </a>
              ) : null}
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {isTestnet
                ? 'Testnet USDC is free — claim from Circle\'s faucet. MoonPay does not support test networks.'
                : 'Card → USDC. Settles on Base in ~3 minutes. MoonPay handles the money — Forj never touches it.'}
            </p>
          </div>
        </div>

        {/* Warning callout — chain-mismatch is the #1 way users lose money */}
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-3 text-xs text-[var(--color-text-secondary)]">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" />
          <div>
            <p className="font-medium text-[var(--color-text-primary)]">
              Send USDC on {networkLabel} only
            </p>
            <p className="mt-0.5">
              Sending from a different chain (Ethereum, Polygon, BNB) or a
              different token will result in lost funds.
            </p>
          </div>
        </div>

        {/* Compact source hints. Quieter than before — small footer
            grid so the QR + on-ramp CTAs above remain the focus. */}
        <div className="mt-4 grid gap-2 text-[11px] text-[var(--color-text-tertiary)] sm:grid-cols-3">
          <SourceHint label="MetaMask" steps="Send → USDC → Base network" />
          <SourceHint label="Exchange" steps="Withdraw USDC, network: Base" />
          <SourceHint label="Another wallet" steps="Scan QR or copy address" />
        </div>
      </div>
    </section>
  );
}

function SourceHint({ label, steps }: { label: string; steps: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-2">
      <p className="font-semibold text-[var(--color-text-primary)]">{label}</p>
      <p className="mt-0.5">{steps}</p>
    </div>
  );
}
