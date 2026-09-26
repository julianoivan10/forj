'use client';

import { useCallback, useRef, useState } from 'react';
import { encodeFunctionData, type Hex } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { erc20Abi, forjEscrowV3Abi } from '@forj/contracts';
import { api } from '@/lib/trpc/client';
import { SMART_WALLETS_ENABLED } from './use-fund-escrow-smart';

export type EscrowV3Action =
  | 'fund'
  | 'submit_work'
  | 'request_revision'
  | 'release'
  | 'release_after_review'
  | 'cancel_by_freelancer'
  | 'refund_after_deadline'
  | 'raise_dispute'
  | 'resolve_expired_dispute';

/** Chains wagmi is configured for (lib/wagmi/config.ts). */
type WagmiChainId = 8453 | 84532;

/** What the UI tells the user while an action runs. */
export type EscrowV3Stage = 'idle' | 'preparing' | 'switching' | 'approving' | 'wallet' | 'recording';

const FUNCTION_FOR: Record<Exclude<EscrowV3Action, 'fund'>, string> = {
  submit_work: 'submitWork',
  request_revision: 'requestRevision',
  release: 'release',
  release_after_review: 'releaseAfterReview',
  cancel_by_freelancer: 'cancelByFreelancer',
  refund_after_deadline: 'refundAfterDeadline',
  raise_dispute: 'raiseDispute',
  resolve_expired_dispute: 'resolveExpiredDispute',
};

export interface EscrowV3Metadata {
  message?: string;
  files?: string[];
  reason?: string;
}

/**
 * Sends ForjEscrowV3 transactions and reports them to Forj.
 *
 * The hook never declares success on its own. It returns once the hash is
 * recorded; the contract only changes state after the server has decoded
 * the matching event from the chain (immediately if already mined,
 * otherwise via polling or the indexer).
 *
 * A ref-based guard blocks a second action while one is in flight, on top
 * of the server's one-pending-transaction-per-contract constraint.
 */
export function useEscrowV3() {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { client: smartClient } = useSmartWallets();
  const config = api.escrow.config.useQuery(undefined, { staleTime: 5 * 60_000 });
  const prepare = api.escrow.prepareFunding.useMutation();
  const record = api.escrow.recordTransaction.useMutation();

  const [stage, setStage] = useState<EscrowV3Stage>('idle');
  const inFlight = useRef(false);

  const useSmart = SMART_WALLETS_ENABLED && Boolean(smartClient);

  const ensureChain = useCallback(
    async (target: number) => {
      if (useSmart || chainId === target) return;
      setStage('switching');
      await switchChainAsync({ chainId: target as WagmiChainId });
    },
    [chainId, switchChainAsync, useSmart],
  );

  const withGuard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (inFlight.current) throw new Error('Another escrow action is already in progress.');
    inFlight.current = true;
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setStage('idle');
    }
  }, []);

  /** Client: create + fund the escrow with server-computed terms. */
  const fund = useCallback(
    (contractId: string) =>
      withGuard(async () => {
        setStage('preparing');
        const t = await prepare.mutateAsync({ contractId });
        await ensureChain(t.chainId);
        const total = BigInt(t.total);
        const fundArgs = [
          t.contractRef as Hex,
          t.freelancer as Hex,
          BigInt(t.amount),
          BigInt(t.deliveryDeadline),
          t.maxClientFeeBps,
          t.maxFreelancerFeeBps,
        ] as const;

        let txHash: Hex;
        if (useSmart && smartClient) {
          setStage('wallet');
          txHash = (await smartClient.sendTransaction({
            calls: [
              {
                to: t.usdcAddress as Hex,
                data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [t.escrowAddress as Hex, total] }),
              },
              {
                to: t.escrowAddress as Hex,
                data: encodeFunctionData({ abi: forjEscrowV3Abi, functionName: 'fund', args: fundArgs }),
              },
            ],
          })) as Hex;
        } else {
          if (!address || !publicClient) throw new Error('Connect your wallet first.');
          if (address.toLowerCase() !== t.client.toLowerCase()) {
            throw new Error('The connected wallet is not the wallet on your Forj account.');
          }
          const allowance = await publicClient.readContract({
            address: t.usdcAddress as Hex,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, t.escrowAddress as Hex],
          });
          if ((allowance as bigint) < total) {
            setStage('approving');
            const approveHash = await writeContractAsync({
              address: t.usdcAddress as Hex,
              abi: erc20Abi,
              functionName: 'approve',
              args: [t.escrowAddress as Hex, total],
              chainId: t.chainId as WagmiChainId,
              gas: 100_000n,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          }
          // Pre-flight: surfaces the real revert reason (balance, deadline, fees) before the wallet popup.
          await publicClient.simulateContract({
            address: t.escrowAddress as Hex,
            abi: forjEscrowV3Abi,
            functionName: 'fund',
            args: fundArgs,
            account: address,
          });
          setStage('wallet');
          txHash = await writeContractAsync({
            address: t.escrowAddress as Hex,
            abi: forjEscrowV3Abi,
            functionName: 'fund',
            args: fundArgs,
            chainId: t.chainId as WagmiChainId,
            gas: 400_000n,
          });
        }
        setStage('recording');
        return record.mutateAsync({ contractId, action: 'fund', txHash, chainId: t.chainId });
      }),
    [address, ensureChain, prepare, publicClient, record, smartClient, useSmart, withGuard, writeContractAsync],
  );

  /** Any single-escrow action after funding. */
  const act = useCallback(
    (
      action: Exclude<EscrowV3Action, 'fund'>,
      params: { contractId: string; escrowId: number; metadata?: EscrowV3Metadata },
    ) =>
      withGuard(async () => {
        const cfg = config.data;
        if (!cfg?.enabled) throw new Error('Escrow is not available on this network.');
        await ensureChain(cfg.chainId);
        const functionName = FUNCTION_FOR[action];
        const args = [BigInt(params.escrowId)] as const;
        setStage('wallet');
        let txHash: Hex;
        if (useSmart && smartClient) {
          txHash = (await smartClient.sendTransaction({
            calls: [
              {
                to: cfg.escrowAddress as Hex,
                data: encodeFunctionData({ abi: forjEscrowV3Abi, functionName: functionName as never, args: args as never }),
              },
            ],
          })) as Hex;
        } else {
          if (publicClient && address) {
            await publicClient.simulateContract({
              address: cfg.escrowAddress as Hex,
              abi: forjEscrowV3Abi,
              functionName: functionName as never,
              args: args as never,
              account: address,
            });
          }
          txHash = await writeContractAsync({
            address: cfg.escrowAddress as Hex,
            abi: forjEscrowV3Abi,
            functionName: functionName as never,
            args: args as never,
            chainId: cfg.chainId as WagmiChainId,
            gas: 300_000n,
          });
        }
        setStage('recording');
        return record.mutateAsync({
          contractId: params.contractId,
          action,
          txHash,
          chainId: cfg.chainId,
          metadata: params.metadata,
        });
      }),
    [address, config.data, ensureChain, publicClient, record, smartClient, useSmart, withGuard, writeContractAsync],
  );

  return { fund, act, stage, busy: stage !== 'idle', config: config.data, walletChainId: chainId, smartWallet: useSmart };
}

export const STAGE_COPY: Record<EscrowV3Stage, string> = {
  idle: '',
  preparing: 'Preparing the escrow terms…',
  switching: 'Switch your wallet to the right network…',
  approving: 'Approve USDC in your wallet (step 1 of 2)…',
  wallet: 'Confirm the transaction in your wallet…',
  recording: 'Sent. Waiting for the network to confirm…',
};
