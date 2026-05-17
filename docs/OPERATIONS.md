# Forj — Operations Runbook

> Live-fire recovery procedures. Read this when something on-chain
> doesn't match the off-chain state. Every recipe in here is idempotent
> — running it twice is safe.

---

## 1. Orphan escrow (on-chain funded, DB not linked)

### Symptom

User clicked "Fund USDC escrow" successfully, USDC moved on Basescan, but
the contract row in Forj still shows "Awaiting funding". May also show
the toast: *"Funds locked on-chain, but the record could not be linked."*

This used to happen when the backend verifier had the strict
`receipt.to === escrow` check and a sponsored UserOp's `receipt.to` was
actually the EntryPoint contract. Fixed in v2 — but historical orphans
from the bug period need manual reconciliation.

### What's stuck

The smart wallet's USDC sits inside `ForjEscrow` at some `escrowId`. The
contract has `status: Funded` on-chain. Off-chain, the DB never recorded
the txHash → release/refund through the app UI is impossible because the
app can't find the escrowId.

### Recovery option A — refund directly via Basescan (client's choice)

If the freelancer hasn't submitted work on this escrowId, the client can
call `refund(escrowId)` and get **the full `amount + clientFee` back**.

1. Find the orphan escrowId. On Basescan → ForjEscrow contract → Read
   Contract → call `nextEscrowId()` (returns the next-to-be-used id, so
   `nextEscrowId - 1` is the latest). Or scan your smart wallet's
   recent `Handle Ops` → `EscrowFunded` events.
2. https://sepolia.basescan.org/address/0x09fb654f30637258d30e3f03b06f5370a0cf8954#writeContract
3. Connect Web3 (MetaMask) signed as the **client** wallet (must match
   the `client` slot of the orphan escrow). With smart wallets, you'd
   need to sign via the smart wallet — easier to do option B.
4. Call `refund(escrowId)`. USDC returns to the calling wallet.

### Recovery option B — auto-release after timeout (freelancer's choice)

If the freelancer marks work submitted on the orphan escrowId (via
direct contract call to `submitWork(escrowId)`), the 7-day auto-release
timer starts. After 7 days, anyone (including the freelancer) can call
`claimAfterTimeout(escrowId)` and the funds flow to the freelancer
minus the freelancer fee.

This is the path of least resistance for "money sitting there, not in
dispute, just orphaned" — but takes a week.

### Recovery option C — admin resolve (preferred for active testing)

The contract `owner` (currently the deployer wallet
`0xa3b1d4ad2e756571530c9e54d4a5c52eb9e71052`) can call
`resolveDispute(escrowId, toFreelancer, toClient, toFee)` ONLY after
either party calls `raiseDispute(escrowId)` to flip the escrow into
the `Disputed` state.

So:
1. Either client or freelancer calls `raiseDispute(escrowId)` from
   Basescan.
2. Admin (deployer wallet) calls `resolveDispute(escrowId, …)` with
   amounts that sum to `e.amount + e.clientFee`. To return everything to
   the client: `resolveDispute(escrowId, 0, e.amount + e.clientFee, 0)`.

---

## 2. Failed pre-flight, on-chain succeeded

Same root cause class as section 1 — the on-chain tx landed but the
post-tx mutation (e.g. `contract.approveWork`) failed for some reason
(rate limit, RPC blip, server restart between hot reloads in dev).

### Symptom

Release flow says "Approve & release funds", Privy popup confirms, but
the contract row still shows "Awaiting review". On-chain the funds
already moved to the freelancer.

### Recovery

Run the relevant verify mutation manually with the txHash. Easiest from
the Network tab of DevTools — the failing request is right there. Or
use the Forj support endpoint (planned, not yet built):

```
POST /api/admin/reconcile
{ "txHash": "0x…", "contractId": "<uuid>", "action": "release" }
```

For now, the dev-mode workaround:
1. Open Drizzle Studio: `pnpm --filter @forj/db studio`
2. Find the row in `contracts` by id.
3. Manually flip:
   - `status` → `completed`
   - `releaseTxHash` → the on-chain txHash
   - `completedAt` → now()

---

## 3. Smart wallet has different address than expected

### Symptom

User says "I topped up USDC but the balance card still shows 0."

### Cause

Privy provisions a smart wallet per-Privy-user. If MetaMask is connected
in the same browser, `useAccount()` from wagmi may return the MetaMask
EOA, not the smart wallet. The user copies the (wrong) EOA address and
sends USDC there — but Forj's smart wallet is a different address.

### Fix

Already mitigated in code by `useCanonicalWallet()` hook (returns the
smart wallet when SW mode is on). If a user still sees this:

1. Have them open Settings → Wallet card. The address shown there is
   the canonical address — copy it.
2. Verify against `useSmartWallets().client.account.address` in
   DevTools console:
   ```js
   document.querySelector('code')?.textContent
   ```
3. If addresses differ: the dev `dist/` of `@forj/contracts` might be
   stale. Run `pnpm --filter @forj/contracts build` and restart dev.

---

## 4. ForjEscrow redeploy (mainnet or new testnet)

### When

- Changing the constructor parameters (default fee bps, auto-release window)
- Patching a contract bug
- Deploying to a new chain

### Steps

```bash
# 1. Compile
pnpm --filter @forj/contracts compile

# 2. Deploy
pnpm --filter @forj/contracts hardhat run scripts/deploy-forj.ts --network <name>

# 3. Update packages/contracts/src/addresses.ts with the printed address
# 4. Update .env: NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=<new>
# 5. Add the new address to your Pimlico sponsorship policy whitelist
#    (Pimlico dashboard → Sponsorship Policies → your policy → Allowed Contracts)
# 6. Verify source on Basescan:
pnpm --filter @forj/contracts hardhat verify --network <name> <addr> <ctor args>
```

The legacy v1 address stays reachable in `addresses.ts` as a comment
for historical contracts. New `fund()` calls always route to the
current `escrow` field.

---

## 5. Pimlico paymaster funding

### When mainnet paymaster runs low

Pimlico sends `policy_spending_threshold` webhook (when configured). If
not, manually check:

1. Pimlico dashboard → your project → **Balance**.
2. If under $5: top up via the dashboard with ETH (Pimlico converts
   to credits automatically).

Per-user spend caps are enforced separately — even with a fully-funded
paymaster, a single user can't exceed their daily/monthly cap unless
you raise it in the sponsorship policy.

---

## 6. User can't sign in

### Common causes

| Symptom | Cause | Fix |
|---|---|---|
| Privy modal doesn't open | `NEXT_PUBLIC_PRIVY_APP_ID` missing or wrong | Check `.env` + restart dev |
| Modal opens, email code never arrives | Resend free tier limit hit | Check Resend dashboard, upgrade plan or use a different email |
| Email code arrives, login fails | Soft-deleted account (`users.deletedAt`) | Use a different email; the tombstone blocks re-login by design |
| Login succeeds but immediately redirected to `/login` | Cookie blocked / SameSite issue | Check browser console for cookie errors; on iOS Safari, ITP can drop third-party cookies during OAuth |

---

## 7. Database emergencies

### Schema drift (DB has columns the schema file doesn't, or vice versa)

```bash
pnpm --filter @forj/db push
```

Interactive prompt — answer "Yes" to apply pending changes.

For non-interactive contexts (CI, scripts), bypass the prompt:
- Write a one-off TS script that connects via `@neondatabase/serverless`
- Execute the ALTER TABLE SQL directly
- Delete the script after running once

### Accidental data corruption / wrong update

Neon keeps **branch snapshots** of the database. On the Neon dashboard:
1. Click your project → **Branches**
2. Find the snapshot taken before the bad write
3. Create a new branch from it
4. Swap `DATABASE_URL` in `.env` to point at the new branch
5. Verify, then promote the branch to main

This buys you ~7 days of point-in-time recovery on the free tier.

---

## 8. Emergency account recovery

> Read the design doc first: `docs/design/emergency-recovery.md`.
> That covers the full threat model + the three layered paths. This
> section is the hands-on runbook for the manual admin re-link path
> when automatic recovery has already failed.

### When to use this

The user contacts support claiming they've lost access to their Forj
account AND they can't recover via:

- Privy's standard login (email magic-link, OAuth, etc.) — covered
  by Privy itself, no Forj action needed.
- A previously-linked wallet — `getUserFromToken`'s wallet-match
  re-link will fire automatically on next login if they still have a
  wallet whose address matches `users.walletAddress`.

If both of those failed, this runbook applies.

### Proof-of-identity bar (REVIEW BEFORE RUNNING)

The single highest-risk operation on the platform. Tier-1 support
does NOT have a button for this — an admin (someone in
`ADMIN_USER_IDS`) reviews, decides, and runs it.

Accept proof if at LEAST ONE of:

1. **On-chain proof** — they signed a fresh message from any wallet
   address that previously appeared in `users.walletAddress` for the
   target account or in any contract row they're a party to. Verify
   the signature off-chain (any wallet UI does this).
2. **Email proof** — they forward an old Forj transactional email
   (proposal received, contract funded, payment released) sent to the
   email on file. Cross-check against Resend dashboard. They must
   also pass an additional check from this list — email alone is too
   spoofable.
3. **KYC-equivalent** — government ID + selfie matching profile
   photo, when (1) and (2) are impossible. Highest-friction path,
   reserved for cases where on-chain history is meaningful (active
   contracts, escrow balance).

Reject if:

- Only "I'm definitely the owner, trust me" — unsupported. No action.
- Match on email alone — accept only as a second factor (see above).
- Match on display name / bio / wallet substring — never sufficient.

### Procedure

```
PRECONDITION
  - You have target user's row UUID.            (from /admin/users or DB)
  - User has logged in fresh via Privy, creating
    a "ghost" row + new privyId.                (ask them to sign up)
  - You have the new privyId from Privy
    dashboard or the ghost row.

STEP 1 — verify proof
  See "Proof-of-identity bar" above. Write down which evidence
  satisfied which bullet point. This goes in the audit log `reason`.

STEP 2 — relink
  Call admin.relinkUser via Drizzle Studio, tRPC playground, or a
  one-shot script:

    await api.admin.relinkUser.mutate({
      targetUserId: "<old-uuid>",
      newPrivyId:   "<new privy userId>",
      reason:       "On-chain signature from 0xabc...123 matching
                     contract 0xdef. Verified at https://etherscan.io/...
                     Support ticket #1234.",
    });

  The procedure:
    - refuses self-relink (admin === target)
    - refuses if target is soft-deleted (use admin.restoreUser
      instead — see "Restoring a soft-deleted account" below)
    - refuses if newPrivyId is already bound elsewhere
    - writes admin_audit_log row BEFORE mutating users.privyId

STEP 3 — clean up the ghost row
  The fresh signup created an extra row with the same privyId as
  newPrivyId. After STEP 2 that privyId is bound to the OLD row,
  so the ghost row is now orphaned (no longer accessible via Privy
  auth). Hard-delete it via Drizzle Studio:

    DELETE FROM users WHERE id = '<ghost-uuid>';

  Future: a proper `admin.deleteUser` procedure should land so this
  step also writes an audit log entry. For now, capture the ghost
  UUID in the relink reason field.

STEP 4 — user verification
  Tell the user to log out + log back in via the same Privy flow
  they used to create the ghost. They land on their recovered row
  with full reputation + history intact.

POSTCONDITION
  - users row count is unchanged (target updated, ghost deleted).
  - admin_audit_log has a relink_user row with details.before /
    details.after capturing the old + new privyId.
  - User confirms they see their old contracts / reviews / etc.
```

### Restoring a soft-deleted account

Mirror of relinkUser, but for users who deleted their account and
want it back. Same proof bar (the user explicitly chose to leave —
reversing that needs as much identity verification as the original
delete).

```
PRECONDITION
  - Target row's `deletedAt` is set (was soft-deleted).
  - User can prove identity (same bar as relink — see above).

STEP 1 — verify proof
  Capture the proof source in writing for the audit log.

STEP 2 — restore
  await api.admin.restoreUser.mutate({
    targetUserId: "<uuid>",
    reason:       "Email proof + signed message from wallet
                   0xabc...123. Ticket #5678.",
    // newPrivyId is optional — the procedure parses it out of the
    // tombstone format `deleted:<orig>:<timestamp>`. Pass only if
    // parsing fails (legacy soft-delete without the prefix) OR if
    // the user has a fresh Privy session you want to bind instead.
  });

STEP 3 — user re-enters PII
  Email, displayName, bio, avatar, skills were zeroed at delete time.
  Tell the user they'll need to fill those in again on next login.
  History (contracts, reviews, on-chain reputation) is intact.

POSTCONDITION
  - users.deletedAt is null.
  - users.privyId is restored to the parsed-or-supplied value.
  - admin_audit_log has a restore_user row with before/after snapshot.
  - User confirms they can sign in + see their old work history.
```

### Reading the audit log

```sql
SELECT
  l.created_at,
  admin.username  AS admin,
  target.username AS target,
  l.action,
  l.reason,
  l.details
FROM admin_audit_log l
LEFT JOIN users admin  ON admin.id  = l.admin_user_id
LEFT JOIN users target ON target.id = l.target_user_id
ORDER BY l.created_at DESC
LIMIT 50;
```

Surface in-app via `api.admin.listAuditLog` — only callable by users
in `ADMIN_USER_IDS`.

---

## 9. Things to never do

- **Never** force-push to `main`.
- **Never** commit `.env` (it's in `.gitignore`; verify with `git status -- .env`).
- **Never** transfer `feeRecipient` to an address you don't control.
- **Never** call `setDefaultFees` with values > 1000 bps (contract caps at 10% per side; values that violate this revert with `FeeTooHigh`).
- **Never** mutate `contracts.status` directly in Drizzle Studio for a contract that has an active on-chain escrow. Always reconcile via the chain first.
