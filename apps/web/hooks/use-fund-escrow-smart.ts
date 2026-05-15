'use client';

import { useCallback, useState } from 'react';
import {
  decodeEventLog,
  encodeFunctionData,
  parseUnits,
  type Hex,
} from 'viem';
import { useChainId, usePublicClient } from 'wagmi';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import {
  DEFAULT_CLIENT_FEE_BPS,
  erc20Abi,
  forjEscrowAbi,
  getAddresses,
} from '@forj/contracts';

import type { EscrowFlowStatus, FundEscrowArgs, FundEscrowResult } from './use-escrow';

/**
 * Smart-wallet variant of `useFundEscrow`.
 *
 * What changes vs the EOA hook:
 *  - **One transaction**, not two. The user signs a single UserOperation
 *    that batches `approve(USDC)` + `fund(escrow)` into one on-chain
 *    call via the smart wallet's `executeBatch`.
 *  - **Zero gas paid by the user**. The Privy + Pimlico paymaster covers
 *    the bill. The user doesn't need ETH on Base at all.
 *  - **No MetaMask popup**. Privy's in-app modal asks for approval (with
 *    a clean human-readable summary), then ships the UserOp.
 *
 * What stays identical:
 *  - The `WorkChainEscrow.sol` contract is unchanged.
 *  - The backend verifier (`verifyEscrowFunding`) decodes the same
 *    `EscrowFunded` event from the same on-chain receipt. The only
 *    difference it sees is `tx.from` is the smart wallet address
 *    instead of the user's EOA.
 *  - The DB row's `walletAddress` is the smart wallet address (set at
 *    sign-up).
 *
 * Activation:
 *   `NEXT_PUBLIC_USE_SMART_WALLETS=true` flips the contract detail page
 *   from `useFundEscrow` to this hook. Until that flag flips, this code
 *   is dead — pure scaffolding ready for the day Pimlico is wired up.
 *
 * Pre-requisites for this hook to actually work at runtime:
 *  1. Pimlico account + paymaster URL configured in Privy SDK config
 *     (see `apps/web/lib/privy/config.ts` `smartWallets` block).
 *  2. The user's session has a smart wallet provisioned (Privy auto-
 *     creates one when the SDK is configured).
 *  3. The paymaster has enough ETH to sponsor the user-op.
 */
export function useFundEscrowSmart() {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { client } = useSmartWallets();

  const [status, setStatus] = useState<EscrowFlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (args: FundEscrowArgs): Promise<FundEscrowResult> => {
      setError(null);
      if (!client) throw new Error('Smart wallet not ready');
      if (!publicClient) throw new Error('No RPC client');

      const advance = (next: EscrowFlowStatus) => {
        setStatus(next);
        args.onStageChange?.(next);
      };

      const addresses = getAddresses(chainId);
      const escrow = addresses.escrow as Hex;
      const usdc = addresses.usdc as Hex;
      if (!escrow) throw new Error('Escrow registry not deployed on this chain');

      // Defensive: BigInt(undefined) throws "Cannot convert undefined to a BigInt"
      // with no useful stack, so we surface a readable error before reaching
      // any BigInt construction below. These checks have caught me out when
      // `@forj/contracts` was imported from a stale `dist/` that
      // didn't yet export the new constants.
      if (!args.amountUsd) {
        throw new Error('Funding aborted — no amount on the contract row.');
      }
      if (!Number.isFinite(args.deliveryDeadline) || args.deliveryDeadline <= 0) {
        throw new Error('Funding aborted — contract is missing a valid delivery deadline.');
      }
      if (typeof DEFAULT_CLIENT_FEE_BPS !== 'number') {
        throw new Error(
          'Funding aborted — fee config not loaded. Restart the dev server so `@forj/contracts` rebuilds.',
        );
      }

      const amountUnits = parseUnits(args.amountUsd, 6);
      // ForjEscrow v2 deposit = amount + clientFee. Approve the full
      // deposit so the contract can pull both buckets in one transferFrom.
      const clientFee = (amountUnits * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
      const depositUnits = amountUnits + clientFee;

      // ── Single sponsored UserOp: approve + fund in one shot ──
      // The Privy smart-wallet client wraps `sendTransaction` to accept a
      // `calls[]` array — under the hood it builds a UserOperation whose
      // `callData` is `executeBatch(targets, values, datas)`. Bundler
      // routes via paymaster → user pays $0.
      advance('funding');
      const txHash = (await client.sendTransaction({
        // viem-style call list. Both calls execute atomically: if `fund()`
        // reverts, the `approve()` is also rolled back. Cleaner than the
        // EOA path where a half-completed flow leaves a stale allowance.
        calls: [
          {
            to: usdc,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [escrow, depositUnits],
            }),
          },
          {
            to: escrow,
            data: encodeFunctionData({
              abi: forjEscrowAbi,
              functionName: 'fund',
              args: [
                args.freelancer,
                amountUnits,
                BigInt(args.deliveryDeadline),
              ],
            }),
          },
        ],
      })) as Hex;

      advance('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        setStatus('error');
        setError('Funding tx reverted on-chain');
        throw new Error('Funding tx reverted on-chain');
      }

      // Decode EscrowFunded — same as EOA flow.
      let onChainContractId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: forjEscrowAbi,
            topics: log.topics as [Hex, ...Hex[]],
            data: log.data,
            eventName: 'EscrowFunded',
          });
          onChainContractId = (decoded.args as { escrowId: bigint }).escrowId;
          break;
        } catch {
          // not the event we want
        }
      }
      if (onChainContractId === null) {
        setStatus('error');
        setError('Funded but EscrowFunded event was missing');
        throw new Error('EscrowFunded event missing');
      }

      advance('success');
      return { txHash, onChainContractId };
    },
    [chainId, client, publicClient],
  );

  return { run, status, error, ready: Boolean(client) };
}

/**
 * Boolean feature flag for whether the contract detail page should call
 * `useFundEscrowSmart` (sponsored, one-popup) instead of the legacy
 * `useFundEscrow` (user pays gas, two popups). Kept here so callers
 * don't have to re-derive the env check.
 *
 * Flips on when:
 *  1. `NEXT_PUBLIC_USE_SMART_WALLETS=true` in env, AND
 *  2. The Privy SDK config has a paymaster URL for the active chain.
 *
 * Until both are true, the EOA path is what users get.
 */
export const SMART_WALLETS_ENABLED =
  process.env.NEXT_PUBLIC_USE_SMART_WALLETS === 'true';
