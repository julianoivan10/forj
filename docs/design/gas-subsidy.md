# Gas Subsidy — Design

> **Status**: design only. Current behaviour: every wallet pays its own gas.
> Base mainnet gas is cheap (~$0.001–$0.005 per fund/release tx), so this
> is not a launch blocker — but for non-crypto users "I need ETH for gas"
> is still a confusing pre-requisite.

## Why subsidise

The pitch to a non-crypto client: "Sign up with email, click a button,
your money is locked safely." If that flow ends with "but first, top up
0.001 ETH for gas", we've already lost half the magic.

Two pain points the subsidy solves:
1. **Onboarding cliff** — users have a card and want USDC, but can't
   even *interact* with the escrow until they also acquire ETH.
2. **Bridge confusion** — testnet users especially hit "I have ETH
   on Sepolia mainnet but I need ETH on Base Sepolia". Bridges are
   alien terminology.

## Implementation paths

### Option A — Privy paymaster (recommended)

Privy ships a built-in gas sponsorship feature for embedded wallets via
**Pimlico** or **Coinbase Paymaster**. Configure once in
`privyConfig.embeddedWallets`, and Privy routes every embedded-wallet tx
through a 4337 bundler that forwards the gas bill to the configured
paymaster.

**Pros**:
- Zero contract changes. Works against the existing `WorkChainEscrow`.
- Privy SDK handles the user-op signing + bundler relay; we just enable a
  flag.
- We can cap monthly spend per-user via Pimlico dashboard so a malicious
  user can't drain our paymaster.

**Cons**:
- Requires Pimlico / Coinbase paymaster account + funded balance.
- Only works for Privy **embedded** wallets (not for users who connected
  external wallets like MetaMask). Their transactions still need ETH.

**Cost projection**: at ~$0.003 per fund tx + ~$0.003 per release tx,
1000 contracts/month = $6 of paymaster spend. Negligible.

### Option B — Custom paymaster contract

Deploy our own `ForjPaymaster.sol` that pays gas for any tx targeting
our `WorkChainEscrow`. Whitelist the registry as the only authorised
target. Top it up periodically from the platform multisig.

**Pros**:
- Works for embedded AND external wallets.
- We control eligibility rules (e.g. only sponsor users with verified
  email).

**Cons**:
- Requires another smart contract → another audit pass.
- We need to integrate ERC-4337 entry point; users' wallets must be
  smart accounts (not plain EOAs). Forces an upgrade for MetaMask users.
- More moving parts to monitor.

### Option C — Drip pool ("welcome ETH")

Backend cron auto-sends ~$0.10 worth of ETH to any new user with a
`walletAddress` and zero balance. They pay their own gas after that, but
the first 5–10 escrow operations are covered.

**Pros**:
- Trivial to implement: a worker that watches new sign-ups and signs
  send transactions from a hot wallet.
- Works for all wallet types (embedded + external).

**Cons**:
- Sybil vector: someone scripts thousands of sign-ups to drain the
  drip wallet.
- Doesn't actually solve the "I never have to think about gas" UX
  goal — once they exhaust the drip, they're back to needing ETH.

### Verdict

**Ship Option A first** (Privy paymaster) — least code, immediate UX win
for the dominant user segment (email signups → embedded wallet).

Layer **Option C** on top for external-wallet users so MetaMask folks
get the same first-N-txs-free benefit. Combined cost stays bounded
because most testers pick the email path.

Defer **Option B** unless paymaster spend becomes a real cost concern
or we want to gate sponsorship on platform-side rules.

## Implementation plan (Phase 12)

1. Create a Pimlico account on https://dashboard.pimlico.io.
2. Top up the paymaster with $20 of ETH on Base Sepolia (testnet) and
   $50 on Base mainnet.
3. Update `privyConfig` in `apps/web/lib/privy/config.ts`:
   ```ts
   embeddedWallets: {
     createOnLogin: 'users-without-wallets',
     requireUserPasswordOnCreate: false,
     // NEW:
     priceDisplay: { primary: 'fiat-currency', secondary: 'native-token' },
     transactionSponsorship: {
       enabled: true,
       paymasterUrl: process.env.NEXT_PUBLIC_PIMLICO_PAYMASTER_URL,
     },
   },
   ```
4. Add `NEXT_PUBLIC_PIMLICO_PAYMASTER_URL` to env schema.
5. Test: as Alice (embedded wallet, zero ETH), fund an escrow. Expect:
   no gas needed, tx still confirms.
6. Set up Pimlico's per-user spend cap (e.g. $0.10 per user per day).
7. Document the on-call runbook: how to top up the paymaster, what
   happens when it runs dry.

## Known limitation

Sponsorship is **opt-in per chain at deploy time**. We can't sponsor a
user's tx on Base Sepolia from a paymaster we set up for Base mainnet.
Phase 12 needs paymaster on both chains.

## Out of scope

- Sponsoring USDC approve+transferFrom from external wallets — this
  requires the user's wallet to be a smart account. Forcing a wallet
  upgrade is a worse UX than just reminding them to keep a few cents
  of ETH on Base. Revisit if Coinbase Smart Wallet adoption grows past
  ~50% of our user base.
