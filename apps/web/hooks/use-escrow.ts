'use client';

import { useCallback, useMemo, useState } from 'react';
import { decodeEventLog, parseUnits, type Hex } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import {
  DEFAULT_CLIENT_FEE_BPS,
  erc20Abi,
  forjEscrowAbi,
  getAddresses,
} from '@forj/contracts';

/**
 * On-chain escrow client hook bundle. Lives in one file because the four
 * actions (fund / submit / release / claim) all share the same wagmi plumbing
 * and chain-id guards — splitting them across files would duplicate the
 * common dance: validate chain → write → wait for receipt → return.
 *
 * Each hook returns `{ run, status, txHash, error }`:
 *  - `run(args)` kicks off the wallet flow. Resolves with the data the
 *    backend needs to verify the tx (txHash + escrowId, where applicable).
 *    Rejects on user reject / chain failure with a typed error.
 *  - `status` mirrors the underlying wagmi mutation but adds an `'approving'`
 *    sub-state for the USDC approve step — the UI uses this to show a
 *    multi-step progress indicator.
 *
 * USDC math:
 *   The DB stores USD as a decimal string ("500.00"). We always pass that
 *   string verbatim into `parseUnits(amount, 6)` so 500.00 USD → 500_000_000
 *   USDC base units. Don't multiply manually.
 */

const USDC_DECIMALS = 6;

export type EscrowFlowStatus =
  | 'idle'
  | 'checking-allowance'
  | 'approving'
  | 'funding'
  | 'submitting'
  | 'releasing'
  | 'claiming'
  | 'confirming'
  | 'success'
  | 'error';

export interface FundEscrowArgs {
  /** Freelancer's wallet — the address that will receive USDC at release. */
  freelancer: Hex;
  /** USD amount as a decimal string, e.g. "500.00". */
  amountUsd: string;
  /** Unix seconds. The on-chain `deliveryDeadline`. */
  deliveryDeadline: number;
  /**
   * Optional progress callback fired as the multi-step flow advances.
   * Lets callers update a sticky "Step 1/2 — approve USDC" toast
   * without subscribing to the hook's `status` state. Identical
   * progression to `EscrowFlowStatus`.
   */
  onStageChange?: (stage: EscrowFlowStatus) => void;
}

export interface FundEscrowResult {
  txHash: Hex;
  /** The escrow id emitted in the EscrowFunded event log. */
  onChainContractId: bigint;
}

/**
 * Reads the USDC balance of the connected wallet on the active chain.
 * Useful for showing "you need X more USDC" before triggering the wallet flow.
 */
export function useUsdcBalance() {
  const { address } = useAccount();
  const chainId = useChainId();
  const usdc = chainId ? safeAddresses(chainId)?.usdc : undefined;
  return useReadContract({
    address: usdc as Hex | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdc && address) },
  });
}

/**
 * Returns the live ERC-20 allowance from `address` to the escrow registry.
 * The fund hook reads this to decide whether to skip the approve step.
 */
function useUsdcAllowance(spender: Hex | undefined) {
  const { address } = useAccount();
  const chainId = useChainId();
  const usdc = chainId ? safeAddresses(chainId)?.usdc : undefined;
  return useReadContract({
    address: usdc as Hex | undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    query: { enabled: Boolean(usdc && address && spender) },
  });
}

function safeAddresses(chainId: number) {
  try {
    return getAddresses(chainId);
  } catch {
    return null;
  }
}

/**
 * Two-step fund flow:
 *   1. If allowance < amount, send `approve(escrow, amount)` and wait.
 *   2. Send `fund(freelancer, amount, deliveryDeadline)` and wait.
 *   3. Decode `EscrowFunded` from the receipt logs and return the id.
 *
 * The hook never calls the backend — caller does that with the returned
 * `{ txHash, onChainContractId }` so error handling stays caller-side.
 */
export function useFundEscrow() {
  const chainId = useChainId();
  const addresses = useMemo(() => (chainId ? safeAddresses(chainId) : null), [chainId]);
  const escrowAddr = addresses?.escrow as Hex | undefined;
  const usdcAddr = addresses?.usdc as Hex | undefined;
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const allowanceQuery = useUsdcAllowance(escrowAddr);

  const [status, setStatus] = useState<EscrowFlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (args: FundEscrowArgs): Promise<FundEscrowResult> => {
      setError(null);
      if (!address) throw new Error('Wallet not connected');
      if (!escrowAddr) throw new Error('Escrow registry not deployed on this chain');
      if (!usdcAddr) throw new Error('USDC address unknown for this chain');
      if (!publicClient) throw new Error('No RPC client');

      // Local helper so we don't sprinkle `args.onStageChange?.(x)` everywhere.
      // Keeps the hook's `status` state in sync with the caller callback.
      const advance = (next: EscrowFlowStatus) => {
        setStatus(next);
        args.onStageChange?.(next);
      };

      // Defensive: catch the silent-error case where any of these args is
      // undefined. `BigInt(undefined)` throws with a useless stack trace,
      // which made debugging the v2 cutover painful — these explicit
      // checks surface the actual misconfig instead.
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

      const amountUnits = parseUnits(args.amountUsd, USDC_DECIMALS);
      // ForjEscrow v2: the client pays `amount + clientFee` at fund time.
      // Compute the client-side fee locally — the on-chain default is
      // sourced from the same `DEFAULT_CLIENT_FEE_BPS` constant so they
      // can never drift. The contract has a `quoteFund()` view that
      // returns the same value if you ever want to verify on-chain.
      const clientFee = (amountUnits * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
      const depositUnits = amountUnits + clientFee;

      // Conservative gas ceilings. Some wallets (notably MetaMask on Base
      // Sepolia) misbehave when they fall back to estimateGas — they
      // sometimes report the block gas limit as the estimate, then refuse
      // to broadcast with a "exceeds max transaction gas limit" error.
      // Hard-coding values that comfortably exceed real consumption side-
      // steps the buggy estimator. Real costs:
      //   approve(): ~50k
      //   fund():    ~200k (slightly higher in v2 due to extra storage write)
      const APPROVE_GAS = 100_000n;
      const FUND_GAS = 380_000n;

      // ── 1. Allowance check + approve if needed ──
      // Approve the FULL deposit (amount + clientFee) so the contract
      // can pull both in a single transferFrom. We do NOT simulate fund()
      // yet — without an allowance the simulation always reverts with
      // "insufficient allowance", which would falsely block honest users
      // at step zero. Simulation happens after approve confirms.
      advance('checking-allowance');
      const refetch = await allowanceQuery.refetch();
      const current = (refetch.data as bigint | undefined) ?? 0n;
      if (current < depositUnits) {
        advance('approving');
        const approveTx = await writeContractAsync({
          address: usdcAddr,
          abi: erc20Abi,
          functionName: 'approve',
          // Approve the exact deposit, not max-uint. Lower attack surface if
          // the registry is ever compromised — only one contract's worth of
          // funds is at risk, not the user's whole USDC balance.
          args: [escrowAddr, depositUnits],
          gas: APPROVE_GAS,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      // ── 2. Pre-flight simulation (allowance now in place) ──
      // Catches the *other* reasons fund() might revert: deadline in the
      // past, freelancer == msg.sender, contract paused. Surfaces the
      // real revert reason BEFORE MetaMask shows its generic "exceeds
      // gas limit" alert.
      try {
        await publicClient.simulateContract({
          address: escrowAddr,
          abi: forjEscrowAbi,
          functionName: 'fund',
          args: [args.freelancer, amountUnits, BigInt(args.deliveryDeadline)],
          account: address,
        });
      } catch (err) {
        setStatus('error');
        const msg = err instanceof Error ? err.message : 'Pre-flight failed';
        setError(msg);
        throw new Error(`Pre-flight check failed: ${msg}`);
      }

      // ── 3. fund() ──
      advance('funding');
      const txHash = await writeContractAsync({
        address: escrowAddr,
        abi: forjEscrowAbi,
        functionName: 'fund',
        args: [args.freelancer, amountUnits, BigInt(args.deliveryDeadline)],
        gas: FUND_GAS,
      });

      advance('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        setStatus('error');
        setError('Funding tx reverted on-chain');
        throw new Error('Funding tx reverted on-chain');
      }

      // ── 3. Decode EscrowFunded to grab the id ──
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
        setError('Funded but EscrowFunded event was missing from the receipt');
        throw new Error('EscrowFunded event missing — chain integration mismatch?');
      }

      advance('success');
      return { txHash, onChainContractId };
    },
    [address, allowanceQuery, escrowAddr, publicClient, usdcAddr, writeContractAsync],
  );

  return { run, status, error, allowance: allowanceQuery.data, escrowAddr, usdcAddr };
}

/**
 * Client-side `release()` — used after the freelancer has submitted.
 * Returns the txHash so the caller can post it to `contract.approveWork`
 * for backend verification.
 */
export function useReleaseEscrow() {
  const chainId = useChainId();
  const escrowAddr = useMemo(
    () => (chainId ? (safeAddresses(chainId)?.escrow as Hex | undefined) : undefined),
    [chainId],
  );
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<EscrowFlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (escrowId: bigint): Promise<Hex> => {
      setError(null);
      if (!escrowAddr) throw new Error('Escrow registry not deployed on this chain');
      if (!publicClient) throw new Error('No RPC client');

      setStatus('releasing');
      const txHash = await writeContractAsync({
        address: escrowAddr,
        abi: forjEscrowAbi,
        functionName: 'release',
        args: [escrowId],
        // See comment in useFundEscrow above — explicit gas dodges
        // MetaMask's flaky Base-Sepolia estimator. Release does USDC
        // transfers so it's slightly heavier than fund.
        gas: 250_000n,
      });
      setStatus('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        setStatus('error');
        setError('Release tx reverted on-chain');
        throw new Error('Release tx reverted');
      }
      setStatus('success');
      return txHash;
    },
    [escrowAddr, publicClient, writeContractAsync],
  );

  return { run, status, error, escrowAddr };
}

/**
 * Client-side `claimAfterTimeout()` — for the freelancer after auto-release
 * window has passed.
 */
export function useClaimRelease() {
  const chainId = useChainId();
  const escrowAddr = useMemo(
    () => (chainId ? (safeAddresses(chainId)?.escrow as Hex | undefined) : undefined),
    [chainId],
  );
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<EscrowFlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (escrowId: bigint): Promise<Hex> => {
      setError(null);
      if (!escrowAddr) throw new Error('Escrow registry not deployed on this chain');
      if (!publicClient) throw new Error('No RPC client');

      setStatus('claiming');
      const txHash = await writeContractAsync({
        address: escrowAddr,
        abi: forjEscrowAbi,
        functionName: 'claimAfterTimeout',
        args: [escrowId],
        gas: 250_000n,
      });
      setStatus('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        setStatus('error');
        setError('Claim tx reverted on-chain');
        throw new Error('Claim tx reverted');
      }
      setStatus('success');
      return txHash;
    },
    [escrowAddr, publicClient, writeContractAsync],
  );

  return { run, status, error, escrowAddr };
}

/**
 * Arbiter-only — sign `resolveDispute(escrowId, toFreelancer, toClient, toFee)`.
 * The contract's `onlyOwner` modifier rejects callers who aren't the
 * registry owner, so a non-arbiter wallet will see the wallet pop up but
 * the chain will revert the tx. Backend records the resolution after.
 */
export function useResolveDispute() {
  const chainId = useChainId();
  const escrowAddr = useMemo(
    () => (chainId ? (safeAddresses(chainId)?.escrow as Hex | undefined) : undefined),
    [chainId],
  );
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<EscrowFlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (args: {
      escrowId: bigint;
      toFreelancer: bigint;
      toClient: bigint;
      toFee: bigint;
    }): Promise<Hex> => {
      setError(null);
      if (!escrowAddr) throw new Error('Escrow registry not deployed on this chain');
      if (!publicClient) throw new Error('No RPC client');

      // Match the on-chain split-equals-amount invariant client-side so we
      // give a friendlier error than waiting for the chain to revert.
      const sum = args.toFreelancer + args.toClient + args.toFee;
      if (sum === 0n) {
        throw new Error('Split must be non-zero');
      }

      setStatus('releasing');
      const txHash = await writeContractAsync({
        address: escrowAddr,
        abi: forjEscrowAbi,
        functionName: 'resolveDispute',
        args: [args.escrowId, args.toFreelancer, args.toClient, args.toFee],
      });
      setStatus('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        setStatus('error');
        setError('Resolution tx reverted on-chain — are you the registry owner?');
        throw new Error('Resolution tx reverted');
      }
      setStatus('success');
      return txHash;
    },
    [escrowAddr, publicClient, writeContractAsync],
  );

  return { run, status, error, escrowAddr };
}

/**
 * Human-readable label for the multi-step status. Fine to import from a
 * component to render a "Step 2 of 3 — confirming on-chain" string.
 */
export const ESCROW_STATUS_LABEL: Record<EscrowFlowStatus, string> = {
  idle: 'Ready',
  'checking-allowance': 'Checking USDC allowance…',
  approving: 'Approving USDC spend…',
  funding: 'Funding escrow…',
  submitting: 'Submitting work…',
  releasing: 'Releasing funds…',
  claiming: 'Claiming funds…',
  confirming: 'Waiting for confirmation…',
  success: 'Done',
  error: 'Failed',
};
