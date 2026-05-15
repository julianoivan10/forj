# Milestone On-Chain Release — ForjEscrow v3 Design

> Phase 7B. Closes the gap between off-chain milestone tracking
> (v2 — UI shows progress, but funds only flow at full release)
> and the desired UX: **each approved milestone moves money for
> real, on-chain, in real time.**

---

## What changes vs v2

| Concern | v2 (current) | v3 (this design) |
|---|---|---|
| Fund | Single `fund()` per contract | Same — unchanged |
| Per-milestone status | Off-chain JSONB in `contracts.milestones` | Off-chain + a `released` counter on-chain |
| Per-milestone payout | None — money flows only at full release | **New** `partialRelease(escrowId, amount)` |
| Refund after partial | N/A (no partials) | Refunds the un-released remainder + leftover clientFee |
| Auto-release | Releases the FULL amount after 7d | Releases the REMAINDER after 7d |
| Dispute resolution | Splits `amount + clientFee` | Splits `(amount - released) + clientFee` |

The v3 contract is a clean redeploy — no proxy / no upgrade path. v2
escrows continue to operate at their existing address.

---

## Math

Let `A = e.amount`, `cf = e.clientFee` at fund time, `frBps = e.freelancerFeeBps`.
`R = e.released` (cumulative). All amounts in USDC base units (6 decimals).

### Fund (`fund(amount)`)
Deposited from client: `A + cf` where `cf = A * clientFeeBps / 10_000`.

### Partial release (`partialRelease(milestoneAmount = m)`)
```
freelancerCut  = m * frBps / 10_000
clientFeeSlice = m * cf / A                  // pro-rata of original fee
toFreelancer   = m - freelancerCut
totalFee       = freelancerCut + clientFeeSlice

storage.released   += m
storage.clientFee  -= clientFeeSlice
```
Status stays `Funded` / `Submitted` until `R == A`, then flips to `Released`.

### Full release (`release` or `claimAfterTimeout`)
Operates on the REMAINDER. Sweeps any leftover `clientFee` dust into
the final fee transfer so the contract balance for this escrow zeros
out cleanly.

```
remainingBase = A - R
freelancerCut = remainingBase * frBps / 10_000
toFreelancer  = remainingBase - freelancerCut
totalFee      = freelancerCut + e.clientFee  // remaining clientFee
```

### Refund
Only valid before `submitWork` (escrow in `Funded` state) and only if
neither party has objected yet. Refunds whatever hasn't been paid out:
```
refundAmt = (A - R) + cf
```
Note: prior partial releases stay with the freelancer. That's by
design — the client can't undo work already approved.

### Dispute resolution
Arbiter splits the REMAINING balance only:
```
totalHeld = (A - R) + cf
require toFreelancer + toClient + toFee == totalHeld
```

---

## Worked example

Contract: $100 amount, 5% client fee, 2% freelancer fee. Three milestones:
$30, $30, $40.

**At fund**: client deposits $105 (= $100 + $5).
- `A = 100`, `cf = 5`, `released = 0`

**Milestone 1 approved** (partialRelease(30)):
- freelancerCut = $0.60 (= 30 × 200 / 10000)
- clientFeeSlice = $1.50 (= 30 × 5 / 100)
- toFreelancer = $29.40
- totalFee = $2.10
- Storage after: `released = 30`, `clientFee = 3.50`

**Milestone 2 approved** (partialRelease(30)):
- freelancerCut = $0.60
- clientFeeSlice = $1.50 (= 30 × 5 / 100, NOT recomputed from current cf)
- toFreelancer = $29.40
- totalFee = $2.10
- Storage after: `released = 60`, `clientFee = 2.00`

**Milestone 3 approved** (partialRelease(40)):
- freelancerCut = $0.80
- clientFeeSlice = $2.00 (= 40 × 5 / 100)
- toFreelancer = $39.20
- BUT now `released == amount` → terminal → status = Released
- Sweep any dust: clientFee dust is 0 (clean rounding here)
- totalFee = $2.80
- Storage after: `released = 100`, `clientFee = 0`, `status = Released`

**Totals**:
- Freelancer received: $29.40 + $29.40 + $39.20 = **$98.00** ✓ (= $100 - 2%)
- Platform received: $2.10 + $2.10 + $2.80 = **$7.00** ✓ (= 5% client + 2% freelancer)
- Sum out: $98 + $7 = $105 ✓ (matches deposit)

---

## Edge cases handled

1. **Rounding dust on clientFee**: If 3 milestones don't perfectly
   partition `cf`, the last `partialRelease` (the one that triggers
   `Released`) sweeps any leftover `clientFee` into the final fee
   transfer. Contract balance always zeros out per escrow.
2. **Refund mid-milestones**: Allowed only from `Funded` state (before
   any submission). Client gets back `(A - R) + cf`. Prior payouts stay
   with the freelancer — that work was already approved.
3. **Dispute mid-milestones**: Arbiter splits the remaining balance.
   Past partials are immutable.
4. **Revision after partial**: Client can `requestRevision` from
   `Submitted` → returns to `Funded`. Past partials unaffected; future
   ones still possible.
5. **Auto-release after partial**: Freelancer submits, 7 days pass,
   anyone calls `claimAfterTimeout`. Releases the REMAINDER (not the
   full amount).
6. **Zero-amount milestone**: Reverts with `InvalidAmount`.
7. **Milestone > remaining**: Reverts with `AmountExceedsRemaining`.

---

## Frontend wiring needed

After v3 is deployed:

1. **`useReleaseEscrow` → branch on contract type**:
   - If milestone-based: call `partialRelease(escrowId, milestoneAmount)`
   - Otherwise: call `release(escrowId)` (existing behaviour)

2. **`MilestoneTracker` component**:
   - "Approve milestone" button now triggers an on-chain tx
   - After confirmation, mark milestone status `approved` in DB AND
     refresh on-chain `getEscrow(escrowId).released` for the bar

3. **Backend `contract.approveWork` → split into two procedures**:
   - `approveMilestonePartial({ contractId, milestoneIdx, txHash, chainId })`
     — verifies `MilestoneReleased` event, updates that milestone's
     status in JSONB, increments `currentMilestone` if next exists.
   - `approveWork` stays as the "approve everything left" path.

4. **`escrow.ts` verifier**: add `verifyEscrowPartialRelease` that
   decodes `MilestoneReleased` event (instead of `Released`).

5. **Mobile UX**: partial release button per milestone row. Same Privy
   single-confirm popup, same sponsored gas — just one tx per milestone.

---

## Trust model implications

The new `partialRelease` does NOT introduce any new platform privilege:
- Only `e.client` can call it
- No way for owner to skim
- Per-slice math is on-chain; can't be miscomputed off-chain to platform's advantage
- Sum of all releases + fees is bounded by `A + cf` (the original
  deposit) — contract can never overpay

`fee` flows directly to `feeRecipient` per call — no platform-held
intermediate balance, just like v2. Multisig migration matters here
even more because partial releases happen more frequently than full
releases.

---

## Deploy + migration plan

1. Audit V3 contract (internal + external if budget allows)
2. Compile: `pnpm --filter @forj/contracts compile`
3. Deploy:
   ```bash
   pnpm --filter @forj/contracts hardhat run \
     scripts/deploy-forj-v3.ts \
     --network baseSepolia
   ```
   (script to write — mirrors `deploy-forj.ts`)
4. Update `addresses.ts` with v3 address
5. Update Pimlico sponsorship policy with v3 address
6. Update `.env`: `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=<v3>`
7. Frontend wiring (4 items above)
8. Deploy frontend
9. Existing v2 escrows continue at their address; new fund() calls
   route to v3. No forced migration — clients settle existing
   escrows on v2 before the v2 contract is ever turned off.

### Optional: v2 sunset

After ~6 months / when all v2 escrows are terminal, owner can call
`pause()` on v2 to prevent new escrows being created there. Withdrawals
still work — we never pause withdrawals.

---

## Open questions for v3

1. **Should `partialRelease` accept multiple milestones at once?** A
   batched version that approves milestones 2-4 in a single tx would
   save gas. Current design: one milestone per call. Trade-off:
   simpler audit surface vs marginal UX win. Defer to post-launch.
2. **Per-escrow custom fees?** Currently fees are global defaults
   snapshotted at fund time. Premium freelancers might want a lower
   freelancer fee. Could add an optional `feelancerFeeBps` parameter
   to `fund()` (capped at the global default to prevent abuse). Defer.
3. **Programmatic milestone deadlines?** Right now each escrow has
   one `deliveryDeadline`. Could move to per-milestone deadlines so
   auto-release fires for one milestone but not the next. Significant
   complexity; defer.
