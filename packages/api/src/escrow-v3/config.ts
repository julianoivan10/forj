import { createPublicClient, http, keccak256, toBytes, type Hex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getAddresses } from '@forj/contracts';
import { EscrowVerificationError, getConfiguredChainId } from '../services/escrow';

/**
 * Server-side view of the ForjEscrowV3 deployment for the configured chain.
 *
 * There is no fallback: if NEXT_PUBLIC_CHAIN_ID is missing or V3 isn't
 * deployed on that chain, every V3 operation fails with an explicit error
 * rather than silently using another network or contract.
 */
export interface EscrowV3Config {
  chainId: number;
  escrowAddress: Hex;
  usdcAddress: Hex;
  deployBlock: bigint;
  /** Blocks the log indexer stays behind head to avoid shallow reorgs. */
  confirmations: bigint;
  explorer: string;
}

export function getEscrowV3Config(): EscrowV3Config {
  const chainId = getConfiguredChainId();
  const addrs = getAddresses(chainId);
  if (!addrs.escrowV3) {
    throw new EscrowVerificationError(
      'wrong_contract',
      `ForjEscrowV3 is not deployed on chain ${chainId}. Set escrowV3 in packages/contracts/src/addresses.ts after deploying.`,
    );
  }
  return {
    chainId,
    escrowAddress: addrs.escrowV3 as Hex,
    usdcAddress: addrs.usdc as Hex,
    deployBlock: addrs.escrowV3DeployBlock,
    confirmations: BigInt(process.env.ESCROW_CONFIRMATIONS ?? '3'),
    explorer: addrs.explorer,
  };
}

/** True when V3 is deployed on the configured chain (new escrows use it). */
export function isEscrowV3Enabled(): boolean {
  try {
    getEscrowV3Config();
    return true;
  } catch {
    return false;
  }
}

export function getV3Client(cfg: EscrowV3Config) {
  const chain = cfg.chainId === base.id ? base : baseSepolia;
  const url =
    cfg.chainId === base.id
      ? process.env.BASE_RPC_URL ?? 'https://mainnet.base.org'
      : process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
  return createPublicClient({ chain, transport: http(url, { retryCount: 2 }) });
}

export type V3Client = ReturnType<typeof getV3Client>;

/**
 * Deterministic bytes32 reference for a contract row. The contract scopes
 * it per funding client, so it only needs to be unique per contract.
 */
export function contractRefFor(contractId: string): Hex {
  return keccak256(toBytes(`forj:contract:${contractId}`));
}
