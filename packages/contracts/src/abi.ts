/**
 * Hand-curated ABI for the WorkChainEscrow contract.
 *
 * This file is the single source of truth that the frontend (`apps/web`)
 * and backend (`packages/api`) import. It's authored by hand instead of
 * auto-generated so we can document each entry inline and so dependent
 * packages don't need to import the entire Hardhat artifact JSON.
 *
 * When you add or rename a function in `WorkChainEscrow.sol`, you must
 * mirror the change here. `pnpm --filter @forj/contracts compile`
 * will catch type drift via `typechain-types/` if you forget.
 */

export const workChainEscrowAbi = [
  // ─────────────────── Constructor ───────────────────
  {
    type: 'constructor',
    inputs: [
      { name: 'usdc_', type: 'address', internalType: 'contract IERC20' },
      { name: 'feeRecipient_', type: 'address', internalType: 'address' },
      { name: 'defaultFeeBps_', type: 'uint16', internalType: 'uint16' },
      { name: 'autoReleaseWindow_', type: 'uint64', internalType: 'uint64' },
      { name: 'initialOwner', type: 'address', internalType: 'address' },
    ],
    stateMutability: 'nonpayable',
  },

  // ─────────────────── Lifecycle (write) ───────────────────
  {
    type: 'function',
    name: 'fund',
    inputs: [
      { name: 'freelancer', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint128', internalType: 'uint128' },
      { name: 'deliveryDeadline', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [{ name: 'escrowId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submit',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'release',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'requestRevision',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimAfterTimeout',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refund',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'raiseDispute',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ─────────────────── Arbiter / admin (write) ───────────────────
  {
    type: 'function',
    name: 'resolveDispute',
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'toFreelancer', type: 'uint256' },
      { name: 'toClient', type: 'uint256' },
      { name: 'toFee', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    name: 'setFeeRecipient',
    inputs: [{ name: 'next', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setDefaultFeeBps',
    inputs: [{ name: 'next', type: 'uint16' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAutoReleaseWindow',
    inputs: [{ name: 'next', type: 'uint64' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ─────────────────── Views ───────────────────
  {
    type: 'function',
    name: 'escrows',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'client', type: 'address' },
      { name: 'freelancer', type: 'address' },
      { name: 'amount', type: 'uint128' },
      { name: 'platformFeeBps', type: 'uint128' },
      { name: 'fundedAt', type: 'uint64' },
      { name: 'submittedAt', type: 'uint64' },
      { name: 'deliveryDeadline', type: 'uint64' },
      { name: 'autoReleaseAt', type: 'uint64' },
      { name: 'status', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getEscrow',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [
      {
        components: [
          { name: 'client', type: 'address' },
          { name: 'freelancer', type: 'address' },
          { name: 'amount', type: 'uint128' },
          { name: 'platformFeeBps', type: 'uint128' },
          { name: 'fundedAt', type: 'uint64' },
          { name: 'submittedAt', type: 'uint64' },
          { name: 'deliveryDeadline', type: 'uint64' },
          { name: 'autoReleaseAt', type: 'uint64' },
          { name: 'status', type: 'uint8' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isReleasable',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'feeRecipient',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'defaultFeeBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'autoReleaseWindow',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextEscrowId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },

  // ─────────────────── Events ───────────────────
  {
    type: 'event',
    name: 'EscrowFunded',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'freelancer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'deliveryDeadline', type: 'uint64', indexed: false },
      { name: 'feeBps', type: 'uint16', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WorkSubmitted',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'autoReleaseAt', type: 'uint64', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RevisionRequested',
    inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Released',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'freelancer', type: 'address', indexed: true },
      { name: 'freelancerAmount', type: 'uint256', indexed: false },
      { name: 'feeAmount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Refunded',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DisputeRaised',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DisputeResolved',
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'toFreelancer', type: 'uint256', indexed: false },
      { name: 'toClient', type: 'uint256', indexed: false },
      { name: 'toFee', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

export type WorkChainEscrowAbi = typeof workChainEscrowAbi;

/**
 * Minimal ERC-20 ABI — only the functions the WorkChain frontend calls
 * directly on USDC (`approve`, `allowance`, `balanceOf`, `decimals`).
 * Avoids pulling in the full OpenZeppelin ABI for one-off reads.
 */
export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;
