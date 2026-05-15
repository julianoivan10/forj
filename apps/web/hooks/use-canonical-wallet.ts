'use client';

import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import type { Hex } from 'viem';
import { SMART_WALLETS_ENABLED } from './use-fund-escrow-smart';

/**
 * Returns the address that Forj considers "the user's wallet" regardless
 * of what wagmi happens to think is connected.
 *
 * Why this exists:
 *   `useAccount()` from wagmi returns whichever address the active
 *   connector exposes. On a browser with MetaMask installed, that's
 *   frequently the MetaMask EOA — even when Privy has separately
 *   provisioned a smart wallet for the same user. Showing MetaMask's
 *   address while transactions actually run from the smart wallet
 *   creates the worst kind of bug: the deposit address the user copies
 *   isn't the address that funds the escrow, so their USDC ends up
 *   somewhere the contract can't pull from.
 *
 *   This hook clamps the canonical identity to the smart wallet when
 *   smart wallets are enabled. The smart wallet client is the same
 *   surface that actually signs and sends transactions, so the address
 *   we display always matches the address that moves money.
 *
 * Behaviour:
 *   - SW enabled + smart wallet provisioned → returns smart wallet
 *   - SW enabled + smart wallet not yet ready → falls back to wagmi
 *     (rare race during Privy init; treat as a transient state)
 *   - SW disabled (legacy EOA flow) → returns wagmi address as-is
 */
export function useCanonicalWallet(): {
  address: Hex | undefined;
  isReady: boolean;
} {
  const { client } = useSmartWallets();
  const { address: wagmiAddress } = useAccount();

  return useMemo(() => {
    const smart = client?.account?.address as Hex | undefined;
    if (SMART_WALLETS_ENABLED) {
      return { address: smart ?? (wagmiAddress as Hex | undefined), isReady: Boolean(smart) };
    }
    return { address: wagmiAddress as Hex | undefined, isReady: Boolean(wagmiAddress) };
  }, [client, wagmiAddress]);
}
