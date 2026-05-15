# Forj — Testnet End-to-End Runbook

A step-by-step recipe for proving the platform works on Base Sepolia
before any mainnet deploy. Anyone reading this should be able to follow it
top-to-bottom and end up with a fully verified contract, settled USDC
payment, and a public proof URL.

> **Prerequisite**: complete [`SETUP.md`](./SETUP.md) up to and including
> §8 (admin set). The smart contract must already be deployed and verified
> on Sepolia, and `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` must be in `.env`.

---

## What you'll need

| Thing                       | Why                                     |
|-----------------------------|-----------------------------------------|
| 2 separate browser profiles | One for the **client**, one for the **freelancer**. Cannot use the same wallet for both — they'd be self-hiring. |
| 2 fresh MetaMask wallets    | (Or any 2 wallets that have separate seed phrases. Privy embedded wallets work too — sign up with 2 different emails.) |
| ~0.05 Sepolia ETH per wallet | For gas. ~6 transactions per side. |
| ~10 Sepolia USDC for the client | The amount they'll fund into escrow. |
| ~30 minutes                 | Elapsed time, including faucet waits.   |

### Faucets

**Sepolia ETH** (for gas — both wallets need it):
- https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- https://www.alchemy.com/faucets/base-sepolia

**Sepolia USDC** (only the client needs this):
- Circle faucet: https://faucet.circle.com → pick "Base Sepolia" → paste address → claim
- Mints 10 USDC per claim, can claim multiple times

---

## Cast: Alice & Bob

Throughout this runbook:

- **Alice** = the client (hires Bob, pays the escrow)
- **Bob** = the freelancer (does the work, gets paid)

Pick wallet addresses for each before you start. Note them down:

```
Alice (client):     0x________________________________________
Bob (freelancer):   0x________________________________________
```

---

## Phase 1 — Sign up both accounts

### 1.1 Alice (client)

1. Open browser profile A. Go to http://localhost:3000.
2. Click **Sign In** → **Continue with Email** → use `alice@example.com`
   (or your own throwaway).
3. Privy magic link → click → you're in.
4. Onboarding:
   - **Step 1**: pick **"I want to hire"** (client role)
   - **Step 2**: username `alice`, display name `Alice`
   - **Step 3**: skipped (clients don't fill skills)
5. Land on `/dashboard`. Profile completeness banner shows ~50%.
6. Settings → Account tab → confirm wallet address shows. Copy it.

### 1.2 Bob (freelancer)

1. Open browser profile B (different profile, separate session).
2. Sign in with email `bob@example.com`.
3. Onboarding:
   - **Step 1**: pick **"I want to work"** (freelancer role)
   - **Step 2**: username `bob`, display name `Bob`
   - **Step 3**: skills `react`, `typescript`, `solidity`. Hourly rate `50`.
4. Settings → Account → copy Bob's wallet address.

✅ **Checkpoint**: visit `/u/alice` and `/u/bob` from any browser. Both
profiles render with their respective info.

---

## Phase 2 — Get USDC into Alice's wallet

1. Go to https://faucet.circle.com.
2. Connect Alice's wallet (or just paste the address — no connect needed).
3. Pick **Base Sepolia**.
4. Claim 10 USDC. Wait for confirmation (~10s).
5. In Forj: **Settings → Account → Wallet** card. The USDC balance
   should refresh to **10.00 USDC** within ~30s.

✅ **Checkpoint**: Alice's wallet shows ≥ 10 USDC on Base Sepolia.

---

## Phase 3 — Alice posts a job, Bob applies

### 3.1 Post the job (Alice)

1. Top nav → **Hire on-chain**.
2. Fill the form:
   - Title: `Test gig — landing page tweaks`
   - Description: `End-to-end testnet test. Pay 5 USDC.`
   - Category: `development`
   - Budget type: `fixed`
   - Budget min/max: `5` / `5`
   - Duration: `less than a week`
   - Experience level: `intermediate`
3. Submit.

✅ Job appears at `/jobs` (public listing) within a second.

### 3.2 Apply (Bob)

1. Bob → `/jobs` → finds Alice's gig → clicks it.
2. **Submit a proposal**:
   - Cover letter: `I can do this in an hour, here's my plan…`
   - Bid: `5` USDC, `fixed`
   - Estimated duration: `less than a week`
3. Submit.

✅ Alice gets an in-app notification: "New proposal received".

### 3.3 Accept (Alice)

1. Dashboard → **My Jobs** → Alice's gig → **Manage proposals**.
2. Bob's proposal card → **Accept**.
3. Confirmation modal → confirm.

✅ Alice + Bob both see a new contract at `/dashboard/contracts/<id>`.
Status: **"Awaiting funding"** (`status='created'`).

---

## Phase 4 — Alice funds the escrow on-chain

1. Alice opens the contract detail page.
2. Click **Fund USDC escrow** button.
3. **Two MetaMask popups** in sequence:
   - First: **Approve USDC** — Alice authorises the registry to spend 5 USDC.
     Confirm. Wait ~10s.
   - Second: **fund(...)** — actually transfers the USDC into escrow.
     Confirm. Wait ~10s.
4. Toast: "Escrow funded — work can begin".
5. Status flips to **"Funded"** (`status='in_progress'`).
6. Sidebar shows escrow tx hash linking to Basescan.

✅ **Checkpoint**: open the tx on Basescan. The "Logs" tab shows an
`EscrowFunded` event. Open the contract on Basescan → "Read" tab → call
`escrows(1)` → returns Alice's address, Bob's address, amount 5000000
(5 USDC × 10^6), status `1` (Funded).

> **What if the wallet flow fails halfway?**
> If approve succeeded but fund didn't, just click **Fund USDC escrow**
> again — the hook detects existing allowance and skips approve.

---

## Phase 5 — Bob submits work

1. Bob opens the contract detail page.
2. Click **Submit work**.
3. Modal:
   - Message: `Done. Deployed to staging.example.com. Code in PR #42.`
4. Submit.

✅ Alice gets a notification: "Work submitted for review". Status flips
to **"Awaiting review"** (`status='submitted'`). Sidebar shows
**"Auto-release on YYYY-MM-DD"** (7 days from now).

---

## Phase 6 — Alice approves & releases

1. Alice opens the contract detail page.
2. Click **Approve & release funds**.
3. **One MetaMask popup**: `release(escrowId)`. Confirm. Wait ~10s.
4. Toast: "Work approved — funds released".
5. Status flips to **"Completed"**.

✅ **Checkpoint**:
- Alice's USDC went down by 5.
- Bob's USDC went up by 4.75 (95% after 5% platform fee).
- The fee recipient address went up by 0.25.
- Open the release tx on Basescan → `Released` event with the right amounts.

---

## Phase 7 — Reviews

1. Alice → contract detail → "Leave a review" → 5 stars,
   comment "Great work, would hire again".
2. Bob → same → "Leave a review" → 5 stars, "Smooth client, paid promptly".

✅ Each profile (`/u/alice`, `/u/bob`) now shows the new review at the
bottom. WorkScore updates: Bob from 0 → 100, Alice from 0 → 100.

---

## Phase 8 — Public proof URL

1. From the completed contract page, click **Share proof** button at top.
2. New tab opens at `/proof/<contractId>`.
3. The page shows:
   - "Verified on Forj" badge
   - Alice + Bob avatars
   - Settlement breakdown: total $5, paid $4.75, fee $0.25
   - On-chain timeline with both Basescan tx links
   - Both reviews
   - "See profile" CTA pointing to Bob

4. **Open this URL in an incognito window**. It should still load —
   it's a public route.

✅ Sign out, paste the URL, page works without auth. **This is the
shareable proof receipt.** Send to friends to validate.

---

## Phase 9 — Direct service-buy flow

1. Bob: Dashboard → My Services → New service.
2. Fill: title, description, 3 tiers, category. Save.
3. Service published at `/services/<slug>`.

4. Alice (in browser A): browse to `/services` → finds Bob's service.
5. Pick a tier → **Order now · $X**.
6. Backend creates a job + proposal + contract atomically. Alice redirected
   to `/dashboard/contracts/<newId>` with status `created`.
7. Same fund flow as Phase 4 — approve + fund.
8. Subsequent phases (submit, release, review) identical.

✅ Service marketplace flow complete in ~3 clicks for the buyer.

---

## Phase 10 — Disputed contract (optional advanced flow)

If you want to test arbitration:

1. Alice funds another contract, Bob submits.
2. **Don't approve.** Either party clicks **Raise dispute** → modal →
   reason → submit.
3. Status flips to **"Disputed"**. Funds remain locked on-chain.
4. Sign in as the **admin** (the wallet in `ADMIN_USER_IDS`).
5. Visit `/admin/disputes` → see the open dispute → click **Resolve**.
6. Enter split:
   - 60% to freelancer, 30% to client refund, 10% to fee
7. Submit → MetaMask asks to sign `resolveDispute(...)`. Confirm.
8. Status flips to **"Completed"**. USDC distributed per the split.

> The arbiter wallet must be the **registry owner** (the EOA that
> deployed the contract, until you `Ownable2Step.transferOwnership` it).
> Otherwise the on-chain tx reverts.

✅ Open the resolve tx on Basescan → `DisputeResolved` event with the
exact split.

---

## Phase 11 — Auto-release timeout (optional)

Tests that funds aren't trapped if the client goes silent.

1. Bob submits work → status `submitted`, autoReleaseAt = now + 7d.
2. **Wait 7 days.** (Or for testing: temporarily change
   `MIN_AUTO_RELEASE_WINDOW` in `WorkChainEscrow.sol` to `60` seconds, redeploy.)
3. Bob: contract detail → **Claim funds (auto-release)** button appears.
4. Click → MetaMask asks to sign `claimAfterTimeout(...)` → confirm.
5. Status flips to **"Completed"**. Bob received his payout without
   Alice ever clicking approve.

✅ The chain itself enforces the timeout via the `TooEarly` revert.
Try the claim before the deadline → MetaMask shows the revert reason.

---

## Final acceptance checklist

If every box ticks, the testnet flow is solid:

- [ ] Sign up + onboarding works for both Alice & Bob
- [ ] Job listing shows on public `/jobs`
- [ ] Proposal accept creates a contract row
- [ ] Fund escrow: 2-step wallet flow (approve + fund) succeeds
- [ ] Backend correctly verifies the on-chain `EscrowFunded` event
- [ ] Submission notification reaches Alice in-app + email (if Resend wired)
- [ ] Approve & release: 1-step wallet flow + correct fee split
- [ ] Both reviews persist; WorkScore updates
- [ ] `/proof/<id>` renders publicly with on-chain links
- [ ] Service order flow works end-to-end
- [ ] Dispute → admin resolve → on-chain split executes correctly
- [ ] Auto-release claim works after timeout

If any box fails, see [`SETUP.md` → Troubleshooting](./SETUP.md#troubleshooting)
or check the dev server logs (the `[tRPC]` line will show what request errored).

---

## What to do if something is wrong

1. **DB out of sync** with the schema? `pnpm --filter @forj/db push`.
2. **Stale dist/** for `@forj/contracts`? `pnpm --filter @forj/contracts build`.
3. **Frontend cache**? Hard refresh (Ctrl+Shift+R / Cmd+Shift+R).
4. **MetaMask transaction stuck pending**? Settings → Advanced → Reset
   account (clears nonce; keeps wallet/tokens). Then retry.
5. **Backend "tx not found"**? Wait 10s and click again. Sepolia RPCs
   sometimes lag.

If you get stuck for more than 15 minutes on a step, drop the dev server
log + browser console errors into a fresh chat and we'll triage.
