/**
 * Hand-curated ABI for the ForjEscrow contract (v2 — split client +
 * freelancer fee).
 *
 * Imported by frontend hooks (`use-escrow.ts`, `use-fund-escrow-smart.ts`)
 * and backend verifiers (`packages/api`) for typed calls and event decoding.
 *
 * Keep in sync with `contracts/ForjEscrow.sol`. The legacy v1 ABI in
 * `abi.ts` (`workChainEscrowAbi`) is intentionally kept around in case
 * a stranded v1 escrow needs to be released or refunded after we cut
 * over — same chain, different contract address.
 */

export const forjEscrowAbi = [
  // ─────────────────── Constructor ───────────────────
  {
    type: 'constructor',
    inputs: [
      { name: 'usdc_', type: 'address', internalType: 'contract IERC20' },
      { name: 'feeRecipient_', type: 'address', internalType: 'address' },
      { name: 'defaultClientFeeBps_', type: 'uint16', internalType: 'uint16' },
      { name: 'defaultFreelancerFeeBps_', type: 'uint16', internalType: 'uint16' },
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
    name: 'submitWork',
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
    name: 'setDefaultFees',
    inputs: [
      { name: 'clientBps', type: 'uint16' },
      { name: 'freelancerBps', type: 'uint16' },
    ],
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
    name: 'quoteFund',
    inputs: [{ name: 'amount', type: 'uint128' }],
    outputs: [
      { name: 'totalIn', type: 'uint256' },
      { name: 'clientFee', type: 'uint256' },
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
          { name: 'clientFee', type: 'uint128' },
          { name: 'freelancerFeeBps', type: 'uint16' },
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
    name: 'defaultClientFeeBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'defaultFreelancerFeeBps',
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
      { name: 'clientFee', type: 'uint256', indexed: false },
      { name: 'freelancerFeeBps', type: 'uint16', indexed: false },
      { name: 'deliveryDeadline', type: 'uint64', indexed: false },
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
      { name: 'totalFee', type: 'uint256', indexed: false },
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

export type ForjEscrowAbi = typeof forjEscrowAbi;
