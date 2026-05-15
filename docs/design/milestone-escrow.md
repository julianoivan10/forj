# Milestone-based Escrow — Design

> **Status**:
> - **Phase 7A — off-chain tracking**: ✅ shipped. `contracts.milestones` JSONB
>   is populated at proposal-accept time; the `<MilestoneTracker />`
>   component on `/dashboard/contracts/[id]` lets the freelancer mark each
>   milestone submitted and the client approve it off-chain. Money still
>   moves once at `approveWork`. See `apps/web/components/contracts/
>   milestone-tracker.tsx` and the `markMilestoneSubmitted` /
>   `approveMilestoneOffchain` procs in `packages/api/src/routers/contract.ts`.
> - **Phase 7B — per-milestone on-chain funding**: design below, NOT YET
>   IMPLEMENTED. The chain currently funds the contract total in one shot.
> - **Phase 7C — milestone-native contract** (`WorkChainEscrowMilestones.sol`):
>   speculative, ship only if gas pressure justifies the redeploy.

## Why

Single-shot escrow works for productised gigs and small jobs (<$1k typical).
Larger projects ($5k+, multi-week scope) hit two problems with the current model:

1. **Client cash-flow risk.** Locking $20k for 8 weeks in escrow is a tough sell
   even with on-chain custody. A client wants to fund Phase 1 ($5k) only, then
   commit Phase 2 once Phase 1 lands.
2. **Freelancer payout cadence.** Freelancers don't want to wait until week 8
   to get paid for week 1's work. Big-ticket projects need partial releases
   throughout.

Milestones solve both: each milestone is its own sub-escrow with its own
`fund → submit → release` lifecycle, all under the umbrella of one parent
contract.

## Mental model

A milestone-enabled contract looks like:

```
Contract #42
├─ Milestone 1 — "Discovery + wireframes"    $2,000  → Funded → Submitted → Released
├─ Milestone 2 — "High-fidelity designs"     $3,500  → Funded → Submitted → ...
├─ Milestone 3 — "Dev handoff"               $1,500  → Pending (not yet funded)
└─ Milestone 4 — "Iteration + polish"        $1,000  → Pending
```

- Each milestone is **independently funded**, **independently submitted**,
  **independently released**. They share the contract's parties and dispute
  arbiter, but money moves per-milestone.
- Total contract amount = sum of milestones. No partial-fund-of-a-milestone.
- Auto-release timeout applies **per milestone**.
- Client can cancel un-funded future milestones at any time (no refund flow
  needed since funds never moved). Funded-but-pending milestones follow normal
  refund/dispute rules.
- Reviews are **at the contract level**, not per milestone. The reputation
  system already handles this; one review per (contractId, reviewerId).

## Off-chain schema

The existing `contracts.milestones` JSONB is already shape-correct:

```ts
export type ContractMilestone = {
  title: string;
  amount: number;         // USDC
  duration: string;       // human-readable "1 week" etc
  description: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved';
};
```

We extend with on-chain bookkeeping:

```ts
export type ContractMilestone = {
  title: string;
  amount: number;
  duration: string;
  description: string;
  status: 'pending' | 'funded' | 'submitted' | 'released' | 'disputed';
  fundedAt?: string;          // ISO
  submittedAt?: string;
  submissionMessage?: string;
  releasedAt?: string;
  // On-chain — set once the milestone is funded.
  onChainMilestoneId?: number;
  fundTxHash?: string;
  releaseTxHash?: string;
};
```

`contracts.currentMilestone: integer` (already in schema) tracks the
in-progress index for quick lookup.

## On-chain shape (the hard part)

Two implementation paths:

### Option A — One Escrow per milestone (recommended)

Reuse `WorkChainEscrow.fund()` once per milestone. Each milestone gets its own
`escrowId`. The contract row stores `milestones[i].onChainMilestoneId`.

**Pros**:
- Zero changes to the deployed `WorkChainEscrow.sol`. Ship-able today.
- Each milestone is its own atomic unit on-chain — disputes / claims /
  refunds work without code change.
- Simpler audit trail: one event per milestone action.

**Cons**:
- More gas — each milestone funding is a separate `transferFrom` (≈70k gas).
  At today's Base gas (~$0.005/tx), a 4-milestone project costs $0.02 extra
  vs single-shot. Acceptable.
- Slightly more orchestration off-chain (the API tracks N escrowIds per
  contract instead of 1).

### Option B — New milestone-aware contract

`WorkChainEscrowMilestones.sol` with native multi-stage support:

```solidity
struct Milestone { uint128 amount; uint64 fundedAt; uint64 submittedAt; Status status; }
struct MultiEscrow {
  address client;
  address freelancer;
  Milestone[] milestones;
  uint256 totalFunded;
  uint16 currentIdx;
}
```

**Pros**:
- ~30% less gas for batch operations
- Single `escrowId` per contract (cleaner mental model)

**Cons**:
- New contract = new audit, new deploy, new addresses module
- Not implementable without the registry redeploy

**Verdict**: ship Option A first. Reconsider Option B if gas becomes a real
complaint at volume.

## API surface

New procs on `contract` router:

```ts
contract.fundMilestone({ contractId, milestoneIndex, txHash, onChainContractId, chainId })
contract.submitMilestone({ contractId, milestoneIndex, message, files? })
contract.approveMilestone({ contractId, milestoneIndex, txHash, chainId })
contract.disputeMilestone({ contractId, milestoneIndex, reason })
contract.cancelRemainingMilestones({ contractId })
```

`fundEscrow` / `approveWork` etc. become aliases for `fundMilestone(0)` /
`approveMilestone(0)` when contract has exactly one milestone (single-shot
flow stays intact).

## UX flow

Client side:
1. When proposal is accepted, the proposal's `milestones` field (already in
   schema!) seeds the contract's milestones array.
2. Client lands on contract detail. Sees a "Milestone 1" panel highlighted
   with "Fund $X" CTA. Future milestones shown greyed out.
3. After Milestone 1 released, "Milestone 2" panel un-greys with its own
   Fund CTA.

Freelancer side:
- Sees the same milestone strip but with their submit-side actions.
- Cumulative payout shown ("$5,500 of $8,000 released").

## Phasing

- **Phase 7A** ✅ (shipped): off-chain milestone tracking only — UI to
  define milestones at proposal time, milestone-by-milestone status display.
  Funding stays single-shot; we just pace `currentMilestone` and emit
  in-app events.
- **Phase 7B**: per-milestone on-chain funding via Option A. Each milestone
  gets its own `WorkChainEscrow.fund()` call.
- **Phase 7C** (optional): `WorkChainEscrowMilestones.sol` if gas savings
  justify the redeploy.

## Phase 7B — concrete implementation plan

Building on Option A (one `escrowId` per milestone). No `WorkChainEscrow.sol`
changes required.

### Schema changes

Extend `ContractMilestone` (already in `packages/db/src/schema/contracts.ts`):

```ts
export type ContractMilestone = {
  title: string;
  amount: number;
  duration: string;
  description: string;
  status:
    | 'pending'      // not funded yet
    | 'funded'       // on-chain escrow active
    | 'submitted'    // freelancer submitted, awaiting client approval
    | 'released'     // client approved, USDC paid out
    | 'refunded'     // mutual cancel pre-submit
    | 'disputed';    // arbiter pending
  // On-chain bookkeeping (set when status moves to 'funded')
  onChainEscrowId?: number;
  fundTxHash?: string;
  releaseTxHash?: string;
  fundedAt?: string;
  submittedAt?: string;
  submissionMessage?: string;
  releasedAt?: string;
};
```

`contracts.status` now reflects the *aggregate*:
- `created` — no milestones funded yet
- `in_progress` — at least one milestone funded, not all released
- `completed` — every milestone released
- `disputed` — at least one milestone in dispute (single-active limit
  keeps the dispute UI simple)

### API changes

Replace single-shot procs with milestone-scoped ones:

```ts
// New, per-milestone:
contract.fundMilestone({ contractId, milestoneIndex, txHash, onChainEscrowId, chainId })
contract.submitMilestone({ contractId, milestoneIndex, message, files? })
contract.approveMilestone({ contractId, milestoneIndex, txHash, chainId })
contract.disputeMilestone({ contractId, milestoneIndex, reason })
contract.cancelRemainingMilestones({ contractId })

// Backward-compat alias: collapses to milestoneIndex=0 when there's
// exactly one milestone. Existing single-shot UI keeps working.
contract.fundEscrow → fundMilestone(0)
contract.submitWork → submitMilestone(0)
contract.approveWork → approveMilestone(0)
```

Each new proc reuses the existing `verifyEscrowFunding` /
`verifyEscrowRelease` helpers. Only difference: target the milestone's
`onChainEscrowId` instead of contract's.

### Frontend changes

`<MilestoneTracker />` already renders the strip. Phase 7B replaces:

```diff
- approveMut: api.contract.approveMilestoneOffchain.useMutation
+ const releaseEscrow = useReleaseEscrow();
+ const onChainEscrowId = milestone.onChainEscrowId;
+ // Sign release on-chain → post txHash to backend
```

The fund flow is identical to current `useFundEscrow`, called per milestone
when the client clicks "Fund this milestone".

### Migration

Existing contracts with `paymentMethod='crypto'` and `onChainContractId`:
- These were funded as single-shot. Their `milestones` array (if any) is
  display-only metadata.
- We mark all such contracts with a flag `isLegacySingleShot=true` so the
  UI knows not to expose per-milestone fund buttons. New contracts default
  to milestone-aware mode if `milestones.length > 1`.

### Effort

- Schema migration: 1 file (`drizzle generate` + `db push`)
- API: ~300 LoC across 5 new procs
- Frontend: minor (`<MilestoneTracker />` already split per row, just swap
  approve/submit handlers and add per-row Fund CTA)
- Tests: per-milestone unit tests in `WorkChainEscrow.test.ts` already
  cover the chain side; only the API integration tests need writing
- **No smart contract redeploy required**.

Ship target: 1 working session.

---

# Decentralized Dispute Resolution — Design

> **Status**: design only. Current model: single arbiter (registry owner).

## The problem with single arbiter

Centralised arbitration scales badly for three reasons:

1. **Bandwidth**: one arbiter can't keep up with platform growth.
2. **Trust**: a community-driven platform needs community-driven justice.
   Single owner ≈ "Forj HQ decides" — same trust model as Upwork.
3. **Single point of failure / collusion**: an arbiter can be bribed,
   coerced, or simply have bad days.

## Target model: stake-weighted juror panel

Inspired by Kleros + Aragon Court. Trade-off chosen: pragmatic, not maximally
decentralized.

### Components

#### 1. Juror pool

- Open enrollment: any user can stake X USDC into the `JurorPool` contract
  to be eligible. Default proposal: stake 100 USDC, lock for 30 days minimum.
- Reputation gate: jurors must have `WorkScore >= 80` AND
  `totalJobsCompleted >= 5` AND `isVerified == true`. Filters out drive-by
  actors.
- Jurors can stake more for higher selection weight (capped to prevent
  whales dominating).

#### 2. Juror selection

When `raiseDispute()` fires:
- Smart contract requests randomness via Chainlink VRF (or commit-reveal as a
  cheap alternative for MVP).
- Picks 5 jurors weighted by stake. No double-booking — same juror can't
  serve multiple active disputes simultaneously.
- Selected jurors are notified (in-app + email) with a 72h vote window.

#### 3. Voting

- Each juror reviews the dispute (parties' arguments, attached evidence,
  contract history) and votes:
  - `RULE_CLIENT` (return to client)
  - `RULE_FREELANCER` (release to freelancer)
  - `RULE_SPLIT(toClient, toFreelancer, toFee)` (specific split)
- Votes are commit-reveal to prevent followers / coercion.
- Majority rule: if 3+ jurors agree on the same outcome, it executes.
- On split votes: weighted average across jurors voting "split", median
  for binary.

#### 4. Incentives

- **Honest majority gets paid**: jurors voting with the majority earn a
  fee bounty (paid from `dispute_fee` deducted from contested amount). Default:
  2% of disputed amount, split equally among majority jurors.
- **Minority gets slashed**: jurors voting against majority lose 5% of
  their stake. Discourages random voting.
- **Tie / no-vote**: stake locked an additional 7 days; case escalates to
  the registry owner as fallback (preserves "always resolves" guarantee).

### Smart contract surface

```solidity
contract JurorPool {
  function stake(uint256 amount) external;
  function unstake(uint256 amount) external; // 30d cooldown
  function vote(uint256 disputeId, bytes32 commit) external;
  function reveal(uint256 disputeId, Outcome outcome, uint256 toFreelancer, uint256 toClient, uint256 nonce) external;
  function executeOutcome(uint256 disputeId) external;
}
```

Hooks into `WorkChainEscrow`: instead of `onlyOwner` calling `resolveDispute()`,
the JurorPool's `executeOutcome()` becomes the authorised caller. The escrow
contract gets a single config pointer `disputeResolver` that can be either
the owner (legacy mode) or a JurorPool contract (decentralized mode). Migration
is a single owner tx: `escrow.setDisputeResolver(jurorPool)`.

### Phasing

- **Phase 8A**: deploy + audit `JurorPool` on Base Sepolia. Allow the platform
  multisig to seed initial jurors with platform-staked USDC. Run shadow mode —
  jurors review real disputes, but the multisig still rules. Verify their
  judgment lines up. ~3 months of ground-truth data.
- **Phase 8B**: switch `escrow.disputeResolver` from owner → JurorPool. Owner
  retains `forceResolve()` emergency hatch for the first 6 months.
- **Phase 8C**: drop the emergency hatch once juror pool proves stable.

### What we don't do

- **No native governance token**. The platform's incentive alignment comes
  from staked USDC (real money) not a token. Avoids securities-classification
  exposure and meme-coin governance failure modes.
- **No appeals court**. Adds complexity, not clearly worth it at MVP scale.
  Revisit when single-tier disputes outpace what jurors can resolve fairly.

---

# Summary

Both features fit the existing architecture cleanly:

| Feature | Schema work | Contract work | UI work | Audit work |
|---|---|---|---|---|
| Milestones (Option A) | Extend JSONB type | None | Per-milestone strip | None |
| Decentralized dispute | New `juror_pool` table | New `JurorPool.sol` | Juror dashboard, vote UI | Audit JurorPool, redeploy escrow with new resolver |

Recommended order:
1. Ship Phase 7A (off-chain milestones) → immediate UX win for big projects.
2. Phase 7B (on-chain milestones) → completes the value prop.
3. Phase 8A (juror pool shadow mode) → builds the data set for governance.
4. Phase 8B/C → flips the switch once data justifies it.
