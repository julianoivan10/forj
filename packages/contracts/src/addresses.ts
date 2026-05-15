/**
 * Per-chain contract addresses for the Forj escrow stack.
 *
 * Deploy flow:
 *   1. `pnpm --filter @forj/contracts hardhat run scripts/deploy-forj.ts --network <name>`
 *   2. Copy the printed address into the matching `escrow` field below.
 *   3. Update `.env`: `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=<new>`.
 *   4. Add the address to your Pimlico sponsorship policy whitelist.
 *   5. Push, deploy frontend, smoke-test funding flow.
 *
 * The legacy v1 address (`workchain_v1_escrow`) is kept here as a comment
 * so anyone debugging an old contract row can find the right contract
 * on Basescan — DO NOT route new fund() calls to it from the app.
 *
 * USDC addresses are canonical per network — sourced from Circle's docs:
 *   https://www.circle.com/en/multi-chain-usdc/base
 */
export const BASE = {
  chainId: 8453,
  /** Native USDC on Base mainnet. */
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
  /** ForjEscrow registry on Base mainnet. Empty until first deploy. */
  escrow: '' as `0x${string}` | '',
} as const;

export const BASE_SEPOLIA = {
  chainId: 84532,
  /** USDC on Base Sepolia (Circle testnet faucet). */
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
  /**
   * ForjEscrow (v2 — split fee) registry on Base Sepolia.
   * Deployed: 2026-05-15. Constructor args:
   *   - usdc:                    0x036CbD53842c5426634e7929541eC2318f3dCF7e
   *   - feeRecipient:            0x7B3E3953bF5D6FaB66A0EC374341b6C629Ad8322
   *   - defaultClientFeeBps:     500 (5%)
   *   - defaultFreelancerFeeBps: 200 (2%)
   *   - autoReleaseWindow:       604800 (7 days)
   *   - initialOwner:            0xA3B1d4ad2E756571530c9e54D4A5c52eb9E71052
   *
   * Legacy v1 (WorkChainEscrow, single 5% fee deducted from freelancer):
   *   0x079fe8805faac09fead18eb56a37967311e4cf8b
   * Kept here as a comment — left active for any in-flight v1 escrow but
   * NOT referenced by the running app.
   */
  escrow: '0x09fb654f30637258d30e3f03b06f5370a0cf8954' as `0x${string}`,
} as const;

export type SupportedChainId = typeof BASE.chainId | typeof BASE_SEPOLIA.chainId;

/**
 * Strict accessor — throws if called with a chainId we haven't deployed to.
 * Frontend should always go through this rather than reaching into the
 * constants directly so we get a loud failure when on the wrong network.
 */
export function getAddresses(chainId: number) {
  switch (chainId) {
    case BASE.chainId:
      return BASE;
    case BASE_SEPOLIA.chainId:
      return BASE_SEPOLIA;
    default:
      throw new Error(`Unsupported chainId for WorkChain escrow: ${chainId}`);
  }
}
