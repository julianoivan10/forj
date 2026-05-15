'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpFromLine,
  Building2,
  Loader2,
  Send,
  Wallet,
} from 'lucide-react';
import {
  encodeFunctionData,
  erc20Abi as viemErc20Abi,
  isAddress,
  parseUnits,
  type Hex,
} from 'viem';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { getAddresses } from '@forj/contracts';
import { Badge, Button, Input, Label } from '@/components/ui';
import { useUsdcBalance } from '@/hooks/use-escrow';
import { SMART_WALLETS_ENABLED } from '@/hooks/use-fund-escrow-smart';
import { formatUSD } from '@/lib/utils';

/**
 * Withdraw / send-out flows for the smart wallet.
 *
 * Two destinations are exposed:
 *
 *  1. **External crypto wallet** (live now) — sends an ERC-20 transfer
 *     from the smart wallet to any 0x address the user supplies. Goes
 *     through the Pimlico paymaster (no gas paid by the user) so the
 *     experience matches the rest of the app.
 *
 *  2. **Bank account** (coming soon) — fiat off-ramp via Transak. Locked
 *     behind a "Coming soon" state because Transak's API requires a
 *     verified business entity (BV / PT / LLC) and we don't have the
 *     legal incorporation yet. Once we register the company and Transak
 *     issues prod credentials, this card flips to an inline widget.
 *
 * The EOA fallback path (when smart wallets are disabled) intentionally
 * isn't implemented here — the legacy MetaMask flow will show its own
 * native send UI, no need to reimplement.
 */
export function WithdrawCard() {
  const chainId = useChainId();
  const { address } = useAccount();
  const balance = useUsdcBalance();
  const publicClient = usePublicClient();
  const { client } = useSmartWallets();

  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!SMART_WALLETS_ENABLED || !address) return null;

  const isTestnet = chainId === 84532;
  const networkLabel = isTestnet ? 'Base Sepolia' : 'Base';

  const balanceUnits = (balance.data as bigint | undefined) ?? 0n;
  const balanceUsdc = Number(balanceUnits) / 1_000_000;

  const destinationValid = isAddress(destination);
  const amountNum = Number(amount);
  const amountValid = amountNum > 0 && amountNum <= balanceUsdc;
  const canSubmit = destinationValid && amountValid && !submitting && client;

  const handleWithdraw = async () => {
    if (!client) {
      toast.error('Smart wallet not ready — try again in a moment');
      return;
    }
    if (!publicClient) {
      toast.error('No RPC client');
      return;
    }
    if (!destinationValid) {
      toast.error('Enter a valid wallet address (0x...)');
      return;
    }
    if (!amountValid) {
      toast.error('Amount must be greater than 0 and not exceed your balance');
      return;
    }

    setSubmitting(true);
    try {
      const addresses = getAddresses(chainId);
      const usdc = addresses.usdc as Hex;
      const amountUnits = parseUnits(amount, 6);

      const txHash = (await client.sendTransaction({
        calls: [
          {
            to: usdc,
            // Use viem's built-in ERC-20 ABI here (not our minimal copy
            // in `@forj/contracts`, which only includes approve +
            // balanceOf + allowance — the surfaces the escrow flow needs).
            data: encodeFunctionData({
              abi: viemErc20Abi,
              functionName: 'transfer',
              args: [destination as Hex, amountUnits],
            }),
          },
        ],
      })) as Hex;

      toast.success('Sending — confirming on-chain…');
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      if (receipt.status !== 'success') {
        throw new Error('Transfer reverted on-chain');
      }
      toast.success(`Sent ${amount} USDC successfully`);
      setAmount('');
      setDestination('');
      await balance.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Withdraw failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="size-4 text-[var(--color-brand-primary)]" />
          <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Withdraw
          </h3>
        </div>
        <Badge variant={isTestnet ? 'warning' : 'brand'}>{networkLabel}</Badge>
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Send USDC from your smart wallet to an external wallet, or cash out
        to a bank account (coming soon).
      </p>

      {/* ── To external wallet ─────────────────────────────────── */}
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-4">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-[var(--color-brand-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Send to crypto wallet
          </h4>
          <Badge variant="success" className="ml-auto">Free · No gas</Badge>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Move USDC to MetaMask, an exchange deposit address, or any{' '}
          {networkLabel} address.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="withdraw-address" className="text-xs">
              Destination address
            </Label>
            <Input
              id="withdraw-address"
              placeholder="0x..."
              value={destination}
              onChange={(e) => setDestination(e.target.value.trim())}
              disabled={submitting}
              className="mt-1 font-mono text-xs"
            />
            {destination && !destinationValid ? (
              <p className="mt-1 text-[11px] text-[var(--color-error)]">
                That doesn&apos;t look like a valid 0x address.
              </p>
            ) : null}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="withdraw-amount" className="text-xs">
                Amount (USDC)
              </Label>
              <button
                type="button"
                onClick={() => setAmount(balanceUsdc.toString())}
                disabled={submitting || balanceUsdc === 0}
                className="text-[11px] font-medium text-[var(--color-brand-primary)] hover:underline disabled:opacity-40"
              >
                Available: {formatUSD(balanceUsdc)}
              </button>
            </div>
            <Input
              id="withdraw-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
              className="mt-1"
            />
            {amount && amountNum > balanceUsdc ? (
              <p className="mt-1 text-[11px] text-[var(--color-error)]">
                Amount exceeds your available balance.
              </p>
            ) : null}
          </div>

          <Button
            onClick={handleWithdraw}
            disabled={!canSubmit}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="mr-1.5 size-4" />
                Send USDC
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── To bank (Transak) ─────────────────────────────────── */}
      <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/40 p-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-[var(--color-text-tertiary)]" />
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Withdraw to bank account
          </h4>
          <Badge variant="default" className="ml-auto">Coming soon</Badge>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Convert USDC to IDR / USD and deposit straight into your bank via
          Transak. Available once we finish the partner KYB. In the meantime,
          you can cash out by sending USDC to your exchange account
          (Indodax, Pintu, Binance) and withdrawing IDR from there.
        </p>
      </div>
    </section>
  );
}
