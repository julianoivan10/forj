'use client';

import { useFundWallet } from '@privy-io/react-auth';
import { CreditCard, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { base, baseSepolia } from 'viem/chains';
import { Button } from '@/components/ui';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

/**
 * "Buy USDC with card" button.
 *
 * Privy ships a hosted fiat-to-crypto on-ramp via MoonPay (default) and
 * Coinbase Onramp. `useFundWallet` opens their modal, takes the user's card
 * details, and sends USDC straight to the connected wallet on the configured
 * chain — we never touch the funds or PII.
 *
 * Chain handling:
 *   - **Mainnet**: pass `chain: base` explicitly. Without this, Privy
 *     defaults to Ethereum mainnet (chainId 1) which isn't in our
 *     supported chains list → "Funding chain 1 is not in PrivyProvider
 *     chains list" error.
 *   - **Testnet**: MoonPay / Coinbase on-ramp only sells real USDC on real
 *     chains. There's no fiat-to-test-USDC product. So instead of the
 *     button we link to the Circle faucet which is the actual path
 *     testers should use.
 *
 * Why this matters for Forj:
 *   On-chain settlement is one of our key advantages, but "go buy USDC on
 *   an exchange and bridge it to Base" is a hard ask for a non-crypto
 *   client. Embedding the on-ramp removes that friction — they sign in
 *   with email, hit "Buy USDC with card", and within minutes have USDC
 *   ready to fund an escrow.
 */
export function FundWalletButton({
  walletAddress,
  className,
}: {
  walletAddress: string | null;
  className?: string;
}) {
  const { fundWallet } = useFundWallet();
  // Read chainId from the env baked at build time. We can't read from
  // `useChainId()` because the user's wallet might be on a different
  // chain (e.g. a "wrong network" state) — what we want here is the
  // chain Forj itself runs on, not the wallet's current selection.
  const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? base.id);
  const isTestnet = envChainId === baseSepolia.id;

  if (!walletAddress) return null;

  // ── Testnet path: faucet link, no on-ramp ──
  if (isTestnet) {
    return (
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noreferrer"
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/50 px-4 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-background-tertiary)]',
          className,
        )}
      >
        <CreditCard className="size-4 text-[var(--color-brand-primary)]" />
        Get testnet USDC from faucet
        <ExternalLink className="size-3.5 text-[var(--color-text-tertiary)]" />
      </a>
    );
  }

  // ── Mainnet path: real fiat on-ramp ──
  const handleClick = async () => {
    try {
      await fundWallet(walletAddress, {
        // Explicit chain so Privy doesn't default to Ethereum mainnet.
        // `useFundWallet` accepts a `chain` option matching its supported
        // chain registry — passing the viem `base` import is the
        // documented pattern.
        chain: base,
        asset: 'USDC',
        amount: '50',
      });
    } catch (err) {
      logger.error('settings/fund-wallet', 'on-ramp failed', err);
      toast.error(
        'Could not open the funding modal. Try again or top up from an exchange.',
      );
    }
  };

  return (
    <Button
      onClick={handleClick}
      leftIcon={<CreditCard />}
      variant="secondary"
      className={className}
    >
      Buy USDC with card
    </Button>
  );
}
