# Smart Wallet + Sponsored Gas — Pimlico × Privy Setup

> Apply this **after** the basic testnet flow (TESTNET-RUNBOOK.md) works
> end-to-end with EOAs. Skipping the EOA proof point makes it harder to
> debug if the sponsored path goes wrong.

This guide turns the platform from **"user pays gas, MetaMask popup"**
into **"$0 to user, single in-app confirmation"**. Same `WorkChainEscrow`
contract, same backend verifier — only the wallet provider changes.

## How the wiring works (important to understand first)

Privy SDK 2.x reads smart-wallet config from the **Privy dashboard**, not
from your `.env`. You give Privy the bundler + paymaster URL once in
the dashboard, and the SDK auto-injects them into every smart-wallet
session for every user.

So there is NO `NEXT_PUBLIC_PIMLICO_*` env var. The single env you flip
is `NEXT_PUBLIC_USE_SMART_WALLETS=true` — that tells our app code which
hook to call (sponsored vs EOA). The credentials live with Privy.

```
┌─────────────────┐        ┌──────────────────┐       ┌─────────┐
│  Privy dashboard │───────▶│   Privy SDK     │──────▶│ Pimlico │
│  (paymaster URL) │ config │ (in our app)    │ RPC   │         │
└─────────────────┘        └──────────────────┘       └─────────┘
                                    ▲
                                    │ NEXT_PUBLIC_USE_SMART_WALLETS=true
                                    │
                              ┌─────┴─────┐
                              │  Our app  │
                              └───────────┘
```

## Step 1 — Pimlico account + URL (you already have this)

You already have:
- API key: `pim_dBfT7vaVGMjb1ZSWuBenGy`
- Base Sepolia RPC: `https://api.pimlico.io/v2/84532/rpc?apikey=pim_dBfT7vaVGMjb1ZSWuBenGy`

Pimlico v2's URL multiplexes **both** the bundler RPC and the paymaster
RPC on the same endpoint. The dashboard probably gave you that single URL
because in v2 you don't need separate bundler/paymaster URLs.

For mainnet later (do NOT do now): same key, swap chainId in the path:
- `https://api.pimlico.io/v2/8453/rpc?apikey=pim_dBfT7vaVGMjb1ZSWuBenGy`

## Step 2 — Configure Privy dashboard (the actual gate)

This is where the magic happens. The Privy SDK reads smart-wallet config
from the dashboard at session-init, not from our code.

1. Go to https://dashboard.privy.io and pick your app
   (`cmobaae63003g0ci8u5ktlmap`).
2. Left sidebar → **"Smart wallets"** (sometimes labelled "Account
   abstraction" depending on dashboard version).
3. Toggle **"Enable smart wallets"** ON.
4. **Smart wallet implementation**: pick **Kernel** (most popular,
   ~50% lower deploy gas than Safe and broad ecosystem support). If
   Kernel isn't listed, pick **Safe** as a second-best.
5. **Per-chain configuration** — for each chain you want to support,
   add an entry. For now, just Base Sepolia:
   - **Chain**: `Base Sepolia` (84532)
   - **Bundler URL**: `https://api.pimlico.io/v2/84532/rpc?apikey=pim_dBfT7vaVGMjb1ZSWuBenGy`
   - **Paymaster URL**: same URL as above (Pimlico v2 multiplexes them)
6. Save.

When you're ready to ship mainnet:
   - **Chain**: `Base` (8453)
   - **Bundler URL**: `https://api.pimlico.io/v2/8453/rpc?apikey=pim_dBfT7vaVGMjb1ZSWuBenGy`
   - **Paymaster URL**: same URL

## Step 3 — Pimlico sponsorship policy (so abuse can't drain you)

Back in Pimlico dashboard → your project → **Sponsorship policy** (or
"Gas policy" depending on dashboard version):

```
Allowed contract addresses (whitelist):
  0x079fe8805faac09fead18eb56a37967311e4cf8b   ← WorkChainEscrow (Sepolia)
  0x036CbD53842c5426634e7929541eC2318f3dCF7e   ← USDC (Sepolia)

Max spend per sender per day:    $0.10
Max spend per sender per month:  $1.00
```

The contract whitelist is critical. Without it, anyone with a Privy
account on our app could route arbitrary transactions through the
paymaster (e.g. minting NFTs, swapping tokens) and drain the budget.
The whitelist limits sponsored gas to *only* our escrow + USDC contracts.

> **Pimlico free tier (Sepolia)**: testnet sponsorship is free up to a
> dashboard-set limit (usually thousands of transactions). You don't
> need to deposit anything for the testnet test. For mainnet later,
> you'll need to fund the paymaster with ~$20 of ETH on Base; that
> covers ~6,000 escrow transactions.

## Step 4 — Flip the feature flag in our app

Add this single env var to `.env`:

```bash
NEXT_PUBLIC_USE_SMART_WALLETS=true
```

That's it. The app code is already wired:

- `apps/web/app/web3-providers.tsx` → wraps children in
  `<SmartWalletsProvider>` (no-op if dashboard config is missing, so
  this is safe to ship even before step 2 is done).
- `apps/web/hooks/use-fund-escrow-smart.ts` → batched user-op, calls
  `client.sendTransaction({ calls: [approve, fund] })`.
- `apps/web/app/dashboard/contracts/[id]/page.tsx` → reads
  `SMART_WALLETS_ENABLED` and picks the right hook for `handleFund`.

Restart the dev server after flipping the flag (Next.js bakes
`NEXT_PUBLIC_*` env at startup):

```bash
pnpm --filter web dev
```

## Step 5 — Test the flow

> Use **fresh browser profiles** ("Charlie" + "Dana") with new emails.
> Existing Alice + Bob already have EOAs — they would need a separate
> migration step, which we'll wire later.

1. Charlie signs up via email → onboarding → **Settings → Account**.
   The wallet card should now show a **Smart Wallet** address (a
   different `0x...` from Charlie's underlying EOA).
2. Charlie has 0 ETH. **That's the point.** Don't fund it.
3. Get him 5 USDC from https://faucet.circle.com (claim to the smart
   wallet address shown on the settings page).
4. Charlie posts a job, accepts a proposal from Dana, clicks
   **Fund USDC escrow**.
5. Privy shows a single in-app confirm popup ("Forj wants to lock
   $5 USDC for Dana — confirm?"). Charlie confirms. **No MetaMask, no
   gas, ~3 second wait.**
6. Status flips to **Funded**. Dana sees the escrow on her side.

### Sanity check on Pimlico dashboard

After the test, Pimlico's dashboard → "User operations" tab should show
1 sponsored UserOp with:
- Sender: Charlie's smart wallet address
- Target: WorkChainEscrow (`0x079f…cf8b`)
- Calls: `approve` + `fund`
- Gas paid: ~$0.003 (or whatever Pimlico's testnet meter shows)

If you see this, the wiring works.

## What stays identical to the EOA path

- Same `WorkChainEscrow.sol` — no contract redeploy.
- Same `verifyEscrowFunding` backend code — same event decoding.
- Same `users.walletAddress` column — just stores the smart wallet
  address instead of an EOA.
- Same `/proof/<id>` URL — public receipt is identical.

## What's different to the user

| | EOA (today) | Smart wallet (after this) |
|---|---|---|
| Need ETH for gas | ✅ Yes | ❌ No |
| Need MetaMask | Optional but common | Never |
| Fund escrow popups | Approve + Fund (2 popups) | One in-app confirm |
| Time to first escrow | ~5 mins (faucet wait) | ~10 seconds |
| Cost to user | ~$0.005 in gas | $0 |
| Cost to platform | $0 | ~$0.003 sponsored |

## Failure modes + how to recognise them

| Symptom | Likely cause | Fix |
|---|---|---|
| `useSmartWallets()` returns `{ client: undefined }` | Privy dashboard step 2 not done OR Privy SDK didn't get a session yet | Verify dashboard config; check user is signed in; reload page |
| Funds escrow but tx never lands | Pimlico paymaster dry / not funded | Top up paymaster on Pimlico dashboard |
| `Funding failed: paymaster rejected user op` | Sponsorship policy doesn't allow this contract | Add escrow address to Pimlico whitelist |
| `Funding failed: contract not in chain config` | Privy dashboard chain config missing a chain | Add Base Sepolia entry per step 2 |
| Smart wallet address differs every reload | Smart wallet implementation mismatch (kernel vs safe) | Pick one in Privy dashboard, keep it consistent |

## Mainnet readiness check (do NOT migrate yet)

Before flipping `USE_SMART_WALLETS=true` on Base mainnet:

- [ ] Pimlico paymaster funded with at least $20 of ETH on Base
- [ ] Mainnet escrow contract deployed + verified on Basescan
- [ ] Pimlico whitelist updated to mainnet escrow address
- [ ] Privy dashboard has Base mainnet chain entry
- [ ] Spend caps tested by deliberately exceeding them on Sepolia first
- [ ] Migration plan for existing EOA users (banner prompt + one-time
      "move funds" tx)
- [ ] Cloudflare DNS pointed at production deploy (Vercel preview /
      production environment with prod env vars)

You said you want to handle mainnet after testnet is fully green. That's
the right call — every issue you find on Sepolia is one issue you don't
discover with real money on the line.
