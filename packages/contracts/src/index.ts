/**
 * Public surface of `@forj/contracts`.
 *
 * Frontend + backend should import from this barrel — it gives them a
 * stable API even if internal file layout changes.
 */
export { workChainEscrowAbi, erc20Abi, type WorkChainEscrowAbi } from './abi';
export { forjEscrowAbi, type ForjEscrowAbi } from './forj-escrow-abi';
export { forjEscrowV3Abi, type ForjEscrowV3Abi } from './forj-escrow-v3-abi';
export { BASE, BASE_SEPOLIA, getAddresses, type SupportedChainId } from './addresses';

/**
 * On-chain Status enum mirror. Keep in sync with `WorkChainEscrow.sol`.
 * Used by the API to interpret raw escrow reads from the chain.
 */
export const EscrowStatus = {
  None: 0,
  Funded: 1,
  Submitted: 2,
  Released: 3,
  Refunded: 4,
  Disputed: 5,
  Resolved: 6,
} as const;

export type EscrowStatusValue = (typeof EscrowStatus)[keyof typeof EscrowStatus];

/** Reverse map for logging / debugging — id → label. */
export const ESCROW_STATUS_LABEL: Record<EscrowStatusValue, string> = {
  0: 'None',
  1: 'Funded',
  2: 'Submitted',
  3: 'Released',
  4: 'Refunded',
  5: 'Disputed',
  6: 'Resolved',
};

/**
 * Default platform fee, in basis points. Kept for backwards compatibility
 * with anything still pointing at v1 `WorkChainEscrow`. New code should
 * read `DEFAULT_CLIENT_FEE_BPS` + `DEFAULT_FREELANCER_FEE_BPS` instead —
 * together they describe the v2 ForjEscrow split fee.
 */
export const DEFAULT_FEE_BPS = 500;

/**
 * v2 split fee bps. Client pays this on top of the agreed amount at
 * funding time; freelancer has the other bps deducted at release time.
 * Combined effective fee on a $100 job: 7% total ($5 from client, $2
 * from freelancer). The number is sourced here so every UI label, every
 * mutation, and the on-chain default all stay aligned — change in one
 * place to A/B the pricing.
 */
export const DEFAULT_CLIENT_FEE_BPS = 500;       // 5%
export const DEFAULT_FREELANCER_FEE_BPS = 200;   // 2%

/** Default auto-release window after submit, in seconds. 7 days. */
export const DEFAULT_AUTO_RELEASE_WINDOW = 7 * 24 * 60 * 60;

/**
 * ForjEscrowV3.Status mirror, index-aligned with the Solidity enum.
 * Keep in sync with contracts/ForjEscrowV3.sol.
 */
export const ESCROW_V3_STATUS = [
  'none',
  'funded',
  'submitted',
  'revision_requested',
  'disputed',
  'released',
  'refunded',
  'resolved',
] as const;
export type EscrowV3Status = (typeof ESCROW_V3_STATUS)[number];

/** Terminal V3 states: no further transition is possible on-chain. */
export const ESCROW_V3_TERMINAL: readonly EscrowV3Status[] = ['released', 'refunded', 'resolved'];
