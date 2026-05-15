# Smart Wallets + Gas Sponsorship — Architecture & Migration

> **Status**: design only. Decision: **YES, we should migrate.** This doc
> lays out *how* and *what costs / risks come with it*.

## The vision

A non-crypto user signs up with email. They never see "MetaMask",
"Sepolia ETH", "approve transaction", or "gas". They click **Fund**, the
button spins for 3 seconds, and the escrow is locked. That's the whole
flow.

This is the **Web2-feel-with-Web3-rails** moment that Coinbase Smart
Wallet, Privy Smart Wallets, and ERC-4337 in general are built for.

## Why our current setup blocks this

Today every Privy email signup gets an **EOA** (externally-owned
account). EOAs have one fundamental constraint: they **must** sign and
pay for their own transactions in the chain's native gas token.

Consequences:
- User needs ETH on Base before they can do anything → faucet / bridge /
  buy ETH. Three steps that lose 60 % of users.
- Every escrow action triggers a wallet popup the user has to confirm.
  For Privy embedded wallets the popup is in-app (good), but it's still
  a "do you trust this transaction" moment that requires reading hex
  data.

## The solution: ERC-4337 Smart Wallets + Paymaster

A **smart wallet** is a contract account, not a private key. Two
properties matter:

1. **Sponsored gas** — a paymaster contract pays the network's gas bill
   on behalf of the user. The platform pre-funds the paymaster, the
   end user pays $0 in ETH.
2. **Batched transactions** — `approve(USDC)` + `fund(escrow)` can ship
   as a single user-op. From the user's perspective, ONE click → ONE
   spinner → done.

Both are built into the **ERC-4337 account abstraction standard** that
Base, Coinbase Smart Wallet, and Privy Smart Wallets all implement.

## Implementation paths

### Path A — Privy Smart Wallets (recommended)

Privy ships first-party smart wallet support. Configuration sits in our
existing `privyConfig`:

```ts
// apps/web/lib/privy/config.ts
export const privyConfig: PrivyClientConfig = {
  // ...existing fields...
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: false,
  },
  smartWallets: {
    // Each chain gets its own paymaster URL. The configured smart-wallet
    // implementation defaults to Coinbase Smart Wallet for Base — same
    // contract Coinbase uses for their own product, well-audited.
    configForChainId: {
      [base.id]: {
        paymasterURL: process.env.NEXT_PUBLIC_BASE_PAYMASTER_URL,
        bundlerURL:   process.env.NEXT_PUBLIC_BASE_BUNDLER_URL,
      },
      [baseSepolia.id]: {
        paymasterURL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_PAYMASTER_URL,
        bundlerURL:   process.env.NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL,
      },
    },
  },
};
```

The paymaster + bundler URLs come from **Pimlico** (or **Alchemy
Account Kit** / **Stackup** — interchangeable). Sign-up flow:

1. Pimlico account → create Project → enable Base Sepolia + Base.
2. They give you a paymaster + bundler URL per chain.
3. Top up the paymaster's ETH balance (this is the ETH that pays user
   gas; it sits in a contract Pimlico controls, you can withdraw any
   time).
4. Set policy: "sponsor up to $0.05 per user per day" — protects
   against abuse without limiting honest use.

**Transaction flow under the hood**:
1. User clicks "Fund escrow" in our UI.
2. `useFundEscrow` hook builds a UserOperation: target = escrow,
   data = `fund(...)` calldata, plus a `paymasterAndData` field.
3. Privy SDK sends the UserOp to the bundler (instead of broadcasting
   directly).
4. Bundler verifies the paymaster signature, packages the UserOp into
   a real on-chain tx, broadcasts.
5. Contract executes → emits `EscrowFunded` event → done.

Backend verifier code stays IDENTICAL — it still reads
`getTransactionReceipt(txHash)` and decodes `EscrowFunded`. The only
difference is `tx.from` is the smart wallet address (not the user's
email-derived EOA). Our DB tracks the smart wallet as
`users.walletAddress`.

**Transaction batching** — Privy's hook lets us send a single
UserOperation with multiple internal calls:

```ts
// New hook: useFundEscrowBatched
const userOp = await sendUserOperation([
  { to: USDC_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [escrow, amount] }) },
  { to: ESCROW_ADDRESS, data: encodeFunctionData({ abi: workChainEscrowAbi, functionName: 'fund', args: [...] }) },
]);
```

User sees ONE in-app confirmation popup ("Forj wants to lock
$5 USDC for Bob — confirm?"), not two MetaMask popups. Major UX win.

### Path B — Coinbase Smart Wallet (alternative)

Coinbase publishes a free Smart Wallet at https://smartwallet.com/.
Their paymaster is **free for the first 1M user-ops** on Base mainnet
(testnet is unlimited). Privy supports it as a wallet provider.

**Pros**:
- Free at our scale for ~6 months.
- Coinbase brand → users may trust it more.

**Cons**:
- Locks us to Coinbase's roadmap. If they change pricing or sunset the
  free tier we have to migrate again.
- Less control over the smart wallet implementation.

**Verdict**: ship Path A first (Pimlico is the most flexible / chain-
agnostic), evaluate Path B once we have real volume.

### Path C — Custom paymaster (defer)

Deploy our own paymaster contract that ONLY sponsors calls to
`WorkChainEscrow`. Ultimate control, but adds an audit obligation and
operational burden. Not worth it until we exceed $500/month in
paymaster spend, at which point in-housing might save money.

## Cost projection (Path A)

| Action | Gas (Base mainnet) | USD per tx | At 1k users / month |
|---|---|---|---|
| approve() | ~50k | $0.001 | ≈$50 |
| fund() | ~180k | $0.003 | ≈$150 |
| submit() | ~50k | $0.001 | ≈$50 |
| release() | ~120k | $0.002 | ≈$100 |
| **Total / month at 1k contracts** | | | **≈$350** |

That's ~$0.35 platform-subsidised per completed contract. Compared to
the 5% fee on a $50 contract ($2.50 revenue), the gas subsidy eats ~14
% of fees. Acceptable margin for the UX win.

## Migration path (concrete steps)

The migration is intrusive — every user gets a new wallet address.
Sequencing matters:

### Phase 12A — Parallel run (1 sprint)

1. Sign up for Pimlico, get paymaster URLs for both chains.
2. Add `smartWallets` config to `privyConfig`.
3. New hook `useFundEscrowBatched` that sends a UserOp via Privy.
4. **Don't change** the existing `useFundEscrow` yet — keep the EOA
   path working for existing users + as fallback.
5. Add a feature flag: `NEXT_PUBLIC_USE_SMART_WALLETS=true`. When on,
   the contract detail page calls `useFundEscrowBatched`. When off,
   it calls the legacy `useFundEscrow`.
6. Test extensively on Sepolia with the flag on.

### Phase 12B — User migration (1 sprint)

1. Add a per-user `walletKind: 'eoa' | 'smart'` column.
2. New users default to `walletKind='smart'` and get a smart wallet
   address from the moment of signup. Their EOA still exists in
   Privy but we just don't use it on-chain — it's the signer for the
   smart wallet.
3. Existing EOA users see a banner: "Upgrade to gasless transactions
   for free".
4. Upgrade flow:
   - Generate a new smart wallet from their existing Privy session
     (Privy SDK handles this).
   - Backend updates `users.walletAddress` to the smart wallet
     address.
   - **Crucial**: any USDC the user already had on the old EOA must
     be migrated. We provide a one-time "Move my funds" button that
     batches `transferFrom(oldEOA, smartWallet, amount)` paid for
     by the paymaster.
   - Contracts in flight stay tied to old EOA. New contracts use
     smart wallet. Both addresses stay valid forever (chain doesn't
     forget).

### Phase 12C — EOA deprecation (3 months later)

Once 95 % of activity is via smart wallets, hide the EOA toggle for
new users and require the upgrade for any new fund operation.

## Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Paymaster runs dry mid-sprint | Med | Pimlico dashboard alerts at 20 % balance + auto-topup from a multisig |
| Smart wallet contract has a bug | Low | Coinbase Smart Wallet is the most widely-deployed AA contract on Base; thoroughly audited |
| User wants to "self-custody" their wallet | Med | Privy lets them export the EOA key any time. Smart wallet itself is a contract — they keep the EOA signer |
| Sponsorship abuse (sybil for free txs) | High | Privy already requires email + (optional) phone; per-user spend cap; only sponsor calls to whitelisted contracts |

## Recommendation

**Ship Phase 12A within the next 2 weeks.** The UX win is dramatic:
- Email signup → fund escrow with no faucet, no MetaMask, no gas talk.
- Same flow Coinbase, Farcaster Frames, Friend.tech use.
- Cost is bounded ($0.35 / contract) and easily covered by the 5% fee.

The longer we wait, the more EOA users we have to migrate. Smart wallets
should have been the default from day one — the sooner we course-correct,
the smaller the migration surface.

---

## What it looks like in code (preview)

`apps/web/lib/privy/config.ts`:
```ts
import { base, baseSepolia } from 'viem/chains';

export const privyConfig: PrivyClientConfig = {
  // ...
  smartWallets: {
    configForChainId: {
      [base.id]: {
        paymasterURL: process.env.NEXT_PUBLIC_BASE_PAYMASTER_URL!,
        bundlerURL: process.env.NEXT_PUBLIC_BASE_BUNDLER_URL!,
      },
      [baseSepolia.id]: {
        paymasterURL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_PAYMASTER_URL!,
        bundlerURL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL!,
      },
    },
  },
};
```

`apps/web/hooks/use-fund-escrow-batched.ts` (new):
```ts
'use client';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { encodeFunctionData } from 'viem';
import { workChainEscrowAbi, erc20Abi, getAddresses } from '@forj/contracts';

export function useFundEscrowBatched() {
  const { client } = useSmartWallets();

  return async (params: { freelancer: Hex; amount: bigint; deadline: bigint; chainId: number }) => {
    const { escrow, usdc } = getAddresses(params.chainId);
    // ONE UserOp, TWO inner calls. User sees one popup, no gas.
    const txHash = await client!.sendTransaction({
      calls: [
        {
          to: usdc,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [escrow, params.amount],
          }),
        },
        {
          to: escrow,
          data: encodeFunctionData({
            abi: workChainEscrowAbi,
            functionName: 'fund',
            args: [params.freelancer, params.amount, params.deadline],
          }),
        },
      ],
    });
    return txHash;
  };
}
```

That's the entire client-side change. The `WorkChainEscrow.sol` contract
doesn't change at all — it still takes a `msg.sender` and emits the
same `EscrowFunded` event. The backend verifier doesn't change. Every-
thing else is identical.

The only platform-side commitment is the paymaster top-up + monitoring.
