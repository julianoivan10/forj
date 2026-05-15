import {
  createPublicClient,
  decodeEventLog,
  http,
  parseUnits,
  type Hex,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  ESCROW_STATUS_LABEL,
  EscrowStatus,
  forjEscrowAbi,
  getAddresses,
  type EscrowStatusValue,
} from '@forj/contracts';

/**
 * Server-side companion to the on-chain WorkChainEscrow contract.
 *
 * Why this exists:
 *   The frontend signs a fund / release tx with the user's Privy wallet, then
 *   tells the backend "here's the txHash, please update the contract row".
 *   We must NOT trust that hint blindly — anyone could send any txHash to our
 *   API. Instead we pull the receipt from the chain ourselves, parse the
 *   expected event, and verify:
 *     - the tx was sent to OUR escrow registry on the expected chain
 *     - the tx succeeded (`status: 'success'`)
 *     - the event payload matches the off-chain contract row exactly
 *       (parties, amount, escrowId)
 *   Only after that do we mutate the DB.
 *
 *   Treat the chain as the source of truth, and the DB as a denormalised
 *   cache that can always be re-derived if it drifts.
 */

// USDC has 6 decimals on every chain. Hard-coded here because we never want
// to trust an attacker-controlled `decimals()` call from a fake token at the
// expected USDC address.
const USDC_DECIMALS = 6;

// ─────────────────────────────────────────────────────────────────
// Chain plumbing
// ─────────────────────────────────────────────────────────────────

function rpcUrl(chainId: number): string {
  if (chainId === base.id) {
    return process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  }
  if (chainId === baseSepolia.id) {
    return process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  }
  throw new Error(`Unsupported chainId: ${chainId}`);
}

/**
 * Build a public client for a specific chain. We deliberately don't cache
 * across chains — viem's PublicClient is generic over its `chain` field, and
 * a `Map<number, PublicClient>` widens to a union that no longer typechecks
 * against viem's strict per-chain method overloads (Base's deposit-tx variant
 * vs Sepolia's standard variant). The `http()` transport itself is stateless
 * fetch-based, so creating one per call is essentially free.
 */
function getClient(chainId: number) {
  const chain = chainId === base.id ? base : chainId === baseSepolia.id ? baseSepolia : null;
  if (!chain) throw new Error(`Unsupported chainId: ${chainId}`);
  return createPublicClient({ chain, transport: http(rpcUrl(chainId)) });
}

// ─────────────────────────────────────────────────────────────────
// Verification result types
// ─────────────────────────────────────────────────────────────────

export class EscrowVerificationError extends Error {
  constructor(
    public readonly code:
      | 'tx_not_found'
      | 'tx_failed'
      | 'wrong_contract'
      | 'wrong_chain'
      | 'event_missing'
      | 'event_mismatch'
      | 'rpc_error',
    message: string,
  ) {
    super(message);
    this.name = 'EscrowVerificationError';
  }
}

export interface VerifiedFunding {
  escrowId: bigint;
  client: Hex;
  freelancer: Hex;
  amount: bigint;
  deliveryDeadline: bigint;
  feeBps: number;
  blockNumber: bigint;
}

export interface VerifiedRelease {
  escrowId: bigint;
  freelancer: Hex;
  freelancerAmount: bigint;
  feeAmount: bigint;
  blockNumber: bigint;
}

export interface VerifiedRefund {
  escrowId: bigint;
  client: Hex;
  amount: bigint;
  blockNumber: bigint;
}

export interface VerifiedResolution {
  escrowId: bigint;
  toFreelancer: bigint;
  toClient: bigint;
  toFee: bigint;
  blockNumber: bigint;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Convert a USDC amount string from the DB (e.g. "500.00") into the on-chain
 * uint128 representation. We do this in the backend rather than trusting the
 * frontend so a malicious client can't fund $1 and claim it was $500.
 */
export function dollarsToUsdcUnits(amount: string | number): bigint {
  // numeric strings like "500.00" or "12.5" parse cleanly via parseUnits.
  return parseUnits(typeof amount === 'string' ? amount : amount.toString(), USDC_DECIMALS);
}

function expectedRegistry(chainId: number): Hex {
  const addrs = getAddresses(chainId);
  if (!addrs.escrow) {
    throw new EscrowVerificationError(
      'wrong_contract',
      `WorkChainEscrow not yet deployed on chainId ${chainId}. Update packages/contracts/src/addresses.ts.`,
    );
  }
  return addrs.escrow as Hex;
}

async function getReceiptOrThrow(
  client: ReturnType<typeof getClient>,
  txHash: Hex,
  chainId: number,
  expectedTo: Hex,
) {
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      throw new EscrowVerificationError(
        'tx_not_found',
        `Tx ${txHash} not yet mined on chain ${chainId}`,
      );
    }
    throw new EscrowVerificationError(
      'rpc_error',
      `RPC failed while fetching receipt: ${(err as Error).message}`,
    );
  }
  if (receipt.status !== 'success') {
    throw new EscrowVerificationError('tx_failed', `Tx ${txHash} reverted on-chain`);
  }
  if (receipt.to?.toLowerCase() !== expectedTo.toLowerCase()) {
    throw new EscrowVerificationError(
      'wrong_contract',
      `Tx ${txHash} targeted ${receipt.to}, expected ${expectedTo}`,
    );
  }
  return receipt;
}

/**
 * Names of the events our ABI emits. Constraining to this union lets the
 * `eventName` arg of `decodeEventLog` keep its strict type from viem.
 */
type EscrowEventName =
  | 'EscrowFunded'
  | 'WorkSubmitted'
  | 'RevisionRequested'
  | 'Released'
  | 'Refunded'
  | 'DisputeRaised'
  | 'DisputeResolved';

/**
 * Find the first log on `receipt` that decodes as the named event of our
 * escrow ABI. Returns the decoded args + the index. Throws if not present.
 */
function decodeFirstMatchingEvent(
  logs: readonly { topics: readonly Hex[]; data: Hex }[],
  eventName: EscrowEventName,
) {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: forjEscrowAbi,
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
        eventName,
      });
      return decoded;
    } catch {
      // log isn't this event — keep looking
    }
  }
  throw new EscrowVerificationError(
    'event_missing',
    `Receipt did not contain a ${eventName} event`,
  );
}

// ─────────────────────────────────────────────────────────────────
// Public verifiers
// ─────────────────────────────────────────────────────────────────

/**
 * Verify a `fund()` transaction. The caller passes what they *think* the
 * deposit looked like (parties + amount). We pull the receipt, decode the
 * `EscrowFunded` event, and bail loudly on any mismatch.
 */
export async function verifyEscrowFunding(params: {
  chainId: number;
  txHash: Hex;
  expected: {
    client: Hex;
    freelancer: Hex;
    amount: bigint; // USDC base units (6 decimals)
  };
}): Promise<VerifiedFunding> {
  const { chainId, txHash, expected } = params;
  const registry = expectedRegistry(chainId);
  const client = getClient(chainId);
  const receipt = await getReceiptOrThrow(client, txHash, chainId, registry);

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'EscrowFunded');
  const args = decoded.args as {
    escrowId: bigint;
    client: Hex;
    freelancer: Hex;
    amount: bigint;
    deliveryDeadline: bigint;
    feeBps: number;
  };

  // Strict compare — case-insensitive for addresses (checksum doesn't always
  // round-trip through wagmi/viem), exact for amount.
  const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (!sameAddress(args.client, expected.client)) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `EscrowFunded.client=${args.client} expected ${expected.client}`,
    );
  }
  if (!sameAddress(args.freelancer, expected.freelancer)) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `EscrowFunded.freelancer=${args.freelancer} expected ${expected.freelancer}`,
    );
  }
  if (args.amount !== expected.amount) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `EscrowFunded.amount=${args.amount} expected ${expected.amount}`,
    );
  }

  return {
    escrowId: args.escrowId,
    client: args.client,
    freelancer: args.freelancer,
    amount: args.amount,
    deliveryDeadline: args.deliveryDeadline,
    feeBps: Number(args.feeBps),
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Verify a `release()` (or `claimAfterTimeout()`) transaction. Confirms the
 * escrowId matches what we have in the DB and that funds went to the
 * expected freelancer.
 */
export async function verifyEscrowRelease(params: {
  chainId: number;
  txHash: Hex;
  expected: {
    escrowId: bigint;
    freelancer: Hex;
  };
}): Promise<VerifiedRelease> {
  const { chainId, txHash, expected } = params;
  const registry = expectedRegistry(chainId);
  const client = getClient(chainId);
  const receipt = await getReceiptOrThrow(client, txHash, chainId, registry);

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'Released');
  const args = decoded.args as {
    escrowId: bigint;
    freelancer: Hex;
    freelancerAmount: bigint;
    feeAmount: bigint;
  };

  if (args.escrowId !== expected.escrowId) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `Released.escrowId=${args.escrowId} expected ${expected.escrowId}`,
    );
  }
  if (args.freelancer.toLowerCase() !== expected.freelancer.toLowerCase()) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `Released.freelancer=${args.freelancer} expected ${expected.freelancer}`,
    );
  }

  return {
    escrowId: args.escrowId,
    freelancer: args.freelancer,
    freelancerAmount: args.freelancerAmount,
    feeAmount: args.feeAmount,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Verify a `refund()` transaction.
 */
export async function verifyEscrowRefund(params: {
  chainId: number;
  txHash: Hex;
  expected: { escrowId: bigint; client: Hex };
}): Promise<VerifiedRefund> {
  const { chainId, txHash, expected } = params;
  const registry = expectedRegistry(chainId);
  const client = getClient(chainId);
  const receipt = await getReceiptOrThrow(client, txHash, chainId, registry);

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'Refunded');
  const args = decoded.args as {
    escrowId: bigint;
    client: Hex;
    amount: bigint;
  };

  if (args.escrowId !== expected.escrowId) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `Refunded.escrowId=${args.escrowId} expected ${expected.escrowId}`,
    );
  }
  if (args.client.toLowerCase() !== expected.client.toLowerCase()) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `Refunded.client=${args.client} expected ${expected.client}`,
    );
  }

  return {
    escrowId: args.escrowId,
    client: args.client,
    amount: args.amount,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Verify an arbiter `resolveDispute()` transaction. Returns the split. The
 * backend uses this to record the outcome — chain enforces only-owner so
 * the mere existence of a `DisputeResolved` event for our escrowId proves
 * the caller WAS the registered arbiter at the time.
 */
export async function verifyEscrowResolution(params: {
  chainId: number;
  txHash: Hex;
  expected: { escrowId: bigint };
}): Promise<VerifiedResolution> {
  const { chainId, txHash, expected } = params;
  const registry = expectedRegistry(chainId);
  const client = getClient(chainId);
  const receipt = await getReceiptOrThrow(client, txHash, chainId, registry);

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'DisputeResolved');
  const args = decoded.args as {
    escrowId: bigint;
    toFreelancer: bigint;
    toClient: bigint;
    toFee: bigint;
  };

  if (args.escrowId !== expected.escrowId) {
    throw new EscrowVerificationError(
      'event_mismatch',
      `DisputeResolved.escrowId=${args.escrowId} expected ${expected.escrowId}`,
    );
  }

  return {
    escrowId: args.escrowId,
    toFreelancer: args.toFreelancer,
    toClient: args.toClient,
    toFee: args.toFee,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Direct read of the on-chain Escrow struct. Used by a background reconciler
 * (Phase 3C-5) to detect drift between DB cache and chain truth.
 */
export async function readEscrowState(params: {
  chainId: number;
  escrowId: bigint;
}): Promise<{
  status: EscrowStatusValue;
  statusLabel: string;
  amount: bigint;
  client: Hex;
  freelancer: Hex;
  autoReleaseAt: bigint;
}> {
  const registry = expectedRegistry(params.chainId);
  const client = getClient(params.chainId);
  const result = (await client.readContract({
    address: registry,
    abi: forjEscrowAbi,
    functionName: 'getEscrow',
    args: [params.escrowId],
  })) as {
    client: Hex;
    freelancer: Hex;
    amount: bigint;
    autoReleaseAt: bigint;
    status: number;
  };

  const status = result.status as EscrowStatusValue;
  return {
    status,
    statusLabel: ESCROW_STATUS_LABEL[status] ?? 'Unknown',
    amount: result.amount,
    client: result.client,
    freelancer: result.freelancer,
    autoReleaseAt: result.autoReleaseAt,
  };
}

/**
 * Sentinel re-export so callers can do `if (status === EscrowStatus.Funded)`
 * without a separate import.
 */
export { EscrowStatus };
