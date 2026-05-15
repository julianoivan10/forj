# Setting up Alice + Bob for testnet end-to-end testing

You need **two distinct wallets** to test the Forj flow — one acts
as the client (Alice), one as the freelancer (Bob). They cannot share an
identity because the smart contract enforces `client != freelancer`.

This guide walks you through the **easiest path**: Privy embedded wallets
via two different email accounts in two browser profiles. No MetaMask
account-switching needed.

## TL;DR

```
┌─────────────────────────────────────────────────────────┐
│  ARBITER (you, current setup)                           │
│   Wallet:  0xa3b1d4ad…71052  (deployer = escrow owner)  │
│   Role:    Resolves disputes                             │
│   ETH:     ~0.04 Sepolia ETH (already funded)            │
│                                                          │
│  ALICE (client) ── you sign up with email A in profile A│
│   Wallet:  fresh Privy embedded wallet, gets created    │
│            on first login                                │
│   Role:    Posts jobs, funds escrow, approves work       │
│   Needs:   ~0.005 ETH for gas + ~5 USDC for the test    │
│                                                          │
│  BOB (freelancer) ── you sign up with email B in profile│
│   Wallet:  fresh Privy embedded wallet                   │
│   Role:    Submits proposals, delivers work              │
│   Needs:   ~0.005 ETH for gas (USDC arrives at release)  │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1 — Open two browser profiles

You need **separate browser sessions** so the two accounts don't share
cookies / Privy storage.

### Option A (recommended): Brave / Chrome profiles

1. Click your avatar (top-right of Brave/Chrome) → **Add profile**.
2. Name them `Forj Alice` and `Forj Bob`.
3. Each profile gets its own bookmark bar, cookies, extensions.

### Option B: Browser + Incognito + a 3rd browser

1. Use your normal browser as Alice.
2. Use a different browser (Firefox / Edge) as Bob.

> Plain incognito windows in the **same** browser do NOT work — they
> share Privy's wallet storage. You'll see weird "wrong wallet"
> behaviour.

---

## Step 2 — Sign up Alice + Bob

In each browser profile, navigate to http://localhost:3000 and sign up.

### Profile "Alice"

1. Click **Sign in** → **Continue with Email**.
2. Use any email you control — `you+alice@gmail.com` works (Gmail
   ignores the `+suffix`, so `you@gmail.com` and `you+alice@gmail.com`
   route to the same inbox but Privy treats them as separate accounts).
3. Magic link → click → you're in.
4. Onboarding:
   - **Step 1**: pick **"I want to hire"**
   - **Step 2**: username `alice` (or whatever), display name `Alice`
   - **Skip step 3** (clients don't fill skills)
5. Land on `/dashboard`.
6. Open **Settings → Account tab → Wallet**.
7. **Copy Alice's wallet address.** It looks like `0x…`.

### Profile "Bob"

Same flow, different email (`you+bob@gmail.com`):

1. **Step 1**: pick **"I want to work"**
2. **Step 2**: username `bob`, display name `Bob`
3. **Step 3**: skills = `react`, `typescript`. Hourly rate `50`.
4. Settings → Account → **copy Bob's wallet address.**

📋 Note both addresses somewhere:

```
ALICE:  0x_______________________________________
BOB:    0x_______________________________________
```

✅ **Checkpoint**: visit `/u/alice` and `/u/bob` from any browser. Both
profiles render with their respective info, avatars (initial-based), and
empty review sections.

---

## Step 3 — Fund Alice + Bob with Sepolia ETH (for gas)

The deployer wallet still has ~0.04 ETH from the bridge. We'll split a
small amount to each tester.

### Option A: Send from MetaMask manually

1. Open your deployer wallet (the one with the bridged ETH).
2. Switch to **Base Sepolia** network in MetaMask.
3. Click **Send** → paste Alice's wallet address → amount `0.01` ETH.
4. Confirm. Wait ~10s.
5. Repeat for Bob: send `0.01` ETH.

### Option B: Use the helper script (one tx, two recipients)

Run from repo root:

```bash
ALICE_WALLET=0x... BOB_WALLET=0x... \
pnpm --filter @forj/contracts exec hardhat run scripts/fund-testers.ts --network baseSepolia
```

This script reads `DEPLOYER_PRIVATE_KEY` from `.env`, sends 0.01 ETH to
each address, and prints two tx hashes. Cheaper than two manual sends
because both go in the same RPC session.

✅ **Checkpoint**: in each browser profile, **Settings → Account →
Wallet** card shows balance ≥ 0.01 ETH. Refresh the page if it doesn't
update — the balance hook polls every 12s.

---

## Step 4 — Get USDC into Alice's wallet (5 USDC is enough for test)

Bob doesn't need USDC up front — he receives it when Alice releases.

1. Go to https://faucet.circle.com.
2. Connect any wallet (or just paste Alice's address).
3. Pick **Base Sepolia**.
4. Claim. Wait ~10s.
5. Refresh the wallet card in profile Alice → balance shows **10.00 USDC**.

✅ **Checkpoint**: Alice's wallet card → USDC balance ≥ 5 USDC.

---

## Step 5 — Verify everything is wired

In **profile Alice**:
- Top bar shows the Forj logo + theme toggle + **Browse open jobs / Hire on-chain** CTAs.
- Sidebar (after signing in) shows: Overview, My Jobs, My Proposals, My Services, Contracts, Messages, Notifications, Settings.
- Settings → Account tab shows:
  - Wallet card with copy/explorer buttons
  - Network: **Base Sepolia** (testnet)
  - USDC balance reflects the faucet claim
  - Email: your alice email
  - Username: `@alice`

Same checks for Bob.

✅ Both accounts ready. Now proceed to
[`TESTNET-RUNBOOK.md`](./TESTNET-RUNBOOK.md) Phase 3 onwards (skip
Phases 1 and 2 — you've already done them).

---

## Troubleshooting

### "Wallet not connected" in settings card

Click the wallet card or refresh. Privy embedded wallets sometimes need
a beat to expose themselves to wagmi.

### Wallet shows wrong network ("Ethereum Mainnet")

Privy occasionally defaults to mainnet for OAuth logins. Click the
chain badge → switch to Base Sepolia. Or in the embedded-wallet UI:
network dropdown → **Base Sepolia**.

### Faucet says "address already claimed"

Use the other faucet (Alchemy, QuickNode), or wait the cooldown
period (~24 hours per faucet).

### Gas estimation fails when funding escrow

Means Alice's wallet has 0 Sepolia ETH. Re-do Step 3.

### "I want to use MetaMask instead of Privy embedded wallet"

Sign in with **Connect Wallet** → MetaMask. Privy will still create a
session, just routes to MetaMask for signing instead of the embedded
wallet. The `users.walletAddress` recorded server-side is the MetaMask
address. Everything else works the same.

> **Caveat**: in this case you'd need TWO MetaMask installations or
> two MetaMask accounts (in the same install) and **switch between
> them every time you swap browser profiles**. The Privy embedded
> wallet path avoids that headache.
