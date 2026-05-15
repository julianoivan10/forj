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
  /** USDC paid in addition to `amount` as the client-side fee. v2 only. */
  clientFee: bigint;
  /** Freelancer-side fee bps snapshotted at fund time. Deducted at release. */
  freelancerFeeBps: number;
  deliveryDeadline: bigint;
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

  // We used to require `receipt.to === escrow` here. That works for plain
  // EOA-signed transactions, but BREAKS for smart-wallet (ERC-4337) flows:
  // the bundler sends `handleOps([...])` to the EntryPoint contract
  // (0x0000…71727de2…), and the EntryPoint then calls our smart wallet
  // which calls the escrow. So `receipt.to` is the EntryPoint, not our
  // escrow — making the strict check reject every sponsored fund tx.
  //
  // The proper check: confirm that *one of the logs* on the receipt was
  // emitted by our escrow address. That's enough to prove the funds
  // actually flowed through our contract regardless of how the tx was
  // routed. `decodeFirstMatchingEvent` does that filter downstream — we
  // just need to make sure at least one log has our address as emitter.
  const fromEscrow = receipt.logs.some(
    (log) => log.address.toLowerCase() === expectedTo.toLowerCase(),
  );
  if (!fromEscrow) {
    throw new EscrowVerificationError(
      'wrong_contract',
      `Tx ${txHash} has no logs from escrow ${expectedTo}. ` +
        `Receipt targeted ${receipt.to} — neither the EOA direct path ` +
        `nor a UserOp routed through this escrow.`,
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
 * Find the first log on `receipt` that:
 *   1. Was emitted by `escrowAddress` (not just any contract).
 *   2. Decodes as the named event of our escrow ABI.
 *
 * The address filter is defence-in-depth for the UserOp case: a single
 * receipt can contain logs from many contracts (USDC, EntryPoint, etc.),
 * and we don't want to accidentally accept an `EscrowFunded`-shaped
 * event emitted by some unrelated contract that happened to be touched
 * in the same UserOp. By anchoring decode to our address, only events
 * our contract emitted count.
 */
function decodeFirstMatchingEvent(
  logs: readonly { address: Hex; topics: readonly Hex[]; data: Hex }[],
  eventName: EscrowEventName,
  escrowAddress: Hex,
) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== escrowAddress.toLowerCase()) continue;
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
    `Receipt did not contain a ${eventName} event from ${escrowAddress}`,
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

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'EscrowFunded', registry);
  // v2 event shape: amount + clientFee + freelancerFeeBps + deliveryDeadline.
  // The old v1 event only had `feeBps` (single side); v2 splits it.
  const args = decoded.args as {
    escrowId: bigint;
    client: Hex;
    freelancer: Hex;
    amount: bigint;
    clientFee: bigint;
    freelancerFeeBps: number;
    deliveryDeadline: bigint;
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
    clientFee: args.clientFee,
    freelancerFeeBps: Number(args.freelancerFeeBps),
    deliveryDeadline: args.deliveryDeadline,
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

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'Released', registry);
  // v2 emits `totalFee` (clientFee + freelancerCut combined); v1 emitted
  // just `feeAmount` (single side). The ABI was regenerated for v2 so
  // viem decodes the new field name — we just need to surface it
  // consistently in our return type.
  const args = decoded.args as {
    escrowId: bigint;
    freelancer: Hex;
    freelancerAmount: bigint;
    totalFee: bigint;
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
    feeAmount: args.totalFee,
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

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'Refunded', registry);
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

  const decoded = decodeFirstMatchingEvent(receipt.logs, 'DisputeResolved', registry);
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
