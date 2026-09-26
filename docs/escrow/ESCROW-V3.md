# ForjEscrowV3: architecture, state machine and rules

Source: `packages/contracts/contracts/ForjEscrowV3.sol`
Tests: `packages/contracts/test/ForjEscrowV3.test.ts`
Base Sepolia: `0x9813A755Cd6dAA83a9B32dd7222594208365C43b` (block 47249309, verified on Basescan)
Base mainnet: **not deployed. Blocked** (see `docs/MAINNET-READINESS.md`).

V3 replaces ForjEscrow v2 (`0x09fb…8954`), which stays deployed and immutable. v2 let the client
refund unilaterally at any time, had unlimited revisions, disputes with no deadline, and an owner
who could send 100% of a disputed escrow to the fee address. V3 is a new deployment, not an upgrade.
There is no proxy and no upgradeability: fixing a bug means deploying a new contract and moving new
escrows to it.

## Why these rules

| Problem in v2 | V3 rule |
|---|---|
| Client could refund at any time, even after delivery | Client refunds only when the work deadline passes with no (re)submission |
| `requestRevision` reset to "Funded", re-enabling the refund | `RevisionRequested` is its own state; the client's only refund path needs a missed deadline |
| Unlimited revisions blocked auto-release forever | Revisions capped per escrow (default 2, max 5), snapshotted at funding |
| Disputes froze funds forever | Arbiter must decide before `disputeDeadline`; after it, anyone applies a 50/50 no-fee split |
| Owner could route 100% of a dispute to the fee address | Arbiter picks only the freelancer's share; fees apply only to that share; the arbiter can't be the owner by default, and can't be a party |
| `deliveryDeadline` stored but unused | `workDeadline` gates submission and the client's refund |
| Fee change could be front-run into a client's funding | `fund()` takes `maxClientFeeBps` / `maxFreelancerFeeBps` |
| No link between an escrow and a Forj contract | `contractRef` (bytes32), unique per funding client, emitted in `EscrowFunded` |
| Fee-on-transfer tokens would break accounting | Balance-delta check on funding (`UnsupportedToken`) |

## State machine

```
            fund() by client
                  │
                  ▼
   ┌────────► FUNDED ─────────────────────────────┐
   │              │ submitWork (freelancer, ≤ workDeadline)
   │              ▼                                │
   │          SUBMITTED ──release (client)──────────┼──► RELEASED
   │           │  │  └─releaseAfterReview (anyone, > reviewDeadline)──► RELEASED
   │           │  │                                 │
   │           │  └─raiseDispute (client, ≤ reviewDeadline)──► DISPUTED
   │           │ requestRevision (client, ≤ reviewDeadline, count < max)
   │           ▼                                    │
   └─submitWork─ REVISION_REQUESTED ──raiseDispute (freelancer, ≤ workDeadline)──► DISPUTED
                                                    │
   FUNDED / SUBMITTED / REVISION_REQUESTED ──cancelByFreelancer──► REFUNDED
   FUNDED / REVISION_REQUESTED ──refundAfterDeadline (client, > workDeadline)──► REFUNDED
   FUNDED / REVISION_REQUESTED ──release (client, early)──► RELEASED

   DISPUTED ──resolveDispute(shareBps) (arbiter, ≤ disputeDeadline)──► RESOLVED
   DISPUTED ──resolveExpiredDispute() (anyone, > disputeDeadline)────► RESOLVED (50/50, no fee)
```

`RELEASED`, `REFUNDED` and `RESOLVED` are terminal: every function reverts on them, and the escrow's
`amount` and `clientFee` are zeroed at settlement. "CREATED" exists only in the application
(a contract row before funding); on-chain creation and funding are one transaction.

## Permission matrix

| Function | Caller | Required state | Deadline | Result | Funds move | Event | Irreversible |
|---|---|---|---|---|---|---|---|
| `fund` | client (msg.sender) | new `(client, contractRef)` | `now < workDeadline ≤ now + 365d` | Funded | client → escrow: amount + clientFee | `EscrowFunded` | – |
| `submitWork` | freelancer | Funded, RevisionRequested | `now ≤ workDeadline` | Submitted | no | `WorkSubmitted` | no |
| `requestRevision` | client | Submitted | `now ≤ reviewDeadline`, count < max | RevisionRequested | no | `RevisionRequested` | no |
| `release` | client | Funded, Submitted, RevisionRequested | – | Released | escrow → freelancer (amount − fFee), fee recipient (cFee + fFee) | `Released` | **yes** |
| `releaseAfterReview` | anyone | Submitted | `now > reviewDeadline` | Released | as `release` | `Released(byTimeout)` | **yes** |
| `cancelByFreelancer` | freelancer | Funded, Submitted, RevisionRequested | – | Refunded | escrow → client: full deposit | `Refunded(FreelancerCancelled)` | **yes** |
| `refundAfterDeadline` | client | Funded, RevisionRequested | `now > workDeadline` | Refunded | escrow → client: full deposit | `Refunded(DeadlineMissed)` | **yes** |
| `raiseDispute` | client | Submitted | `now ≤ reviewDeadline` | Disputed | no | `DisputeRaised` | no |
| `raiseDispute` | freelancer | RevisionRequested | `now ≤ workDeadline` | Disputed | no | `DisputeRaised` | no |
| `resolveDispute(shareBps)` | arbiter (not a party) | Disputed | `now ≤ disputeDeadline` | Resolved | split per the rule below | `DisputeResolved` | **yes** |
| `resolveExpiredDispute` | anyone | Disputed | `now > disputeDeadline` | Resolved | 50/50 of amount, clientFee back to client, no fee | `DisputeResolved(byTimeout)` | **yes** |
| `pause` | guardian or owner | – | – | new funding blocked | no | `Paused` | no |
| `unpause` | owner | – | – | – | no | `Unpaused` | no |
| `setArbiter` / `setGuardian` / `setFeeRecipient` | owner | – | – | future settlements | no | `*Updated` | no |
| `setDefaultFees` (≤ 10% each) / `setWindows` / `setMaxRevisions` (≤ 5) | owner | – | – | **escrows funded afterwards only** | no | `*Updated` | no |
| `rescueToken` (never USDC) | owner | – | – | – | stray tokens only | `TokenRescued` | yes |
| `renounceOwnership` | – | – | – | always reverts | – | – | – |

By role:

| Role | Can | Cannot |
|---|---|---|
| Client | fund; approve/release; request revisions (capped); dispute during review; refund after a missed deadline | refund after delivery or during a dispute; touch other escrows |
| Freelancer | submit before the deadline; cancel and refund the client; dispute an outstanding revision; claim after the review window (as "anyone") | release to themselves early; refund before the client's deadline logic allows |
| Arbiter | choose the freelancer's share of a disputed escrow before its deadline | resolve after the deadline; resolve an escrow they're a party to; send funds anywhere but client, freelancer and (capped) fee |
| Guardian | pause new funding | unpause; move funds; change config |
| Owner (admin) | config for future escrows, role changes, unpause, rescue non-USDC | move escrowed USDC; resolve disputes (unless also set as arbiter); change terms of funded escrows |

## Fees

Snapshotted at funding (`clientFee` absolute, `freelancerFeeBps`). Default 500 bps client + 200 bps
freelancer; each capped at 1,000 bps. Integer maths, rounding down in favour of the parties.

- Release: freelancer gets `amount − amount·fBps/10000`; fee recipient gets `clientFee + amount·fBps/10000`.
- Refund: client gets `amount + clientFee`; fee recipient gets nothing.
- Dispute split with share `s` (bps): freelancer gross `g = amount·s/10000`; freelancer fee `g·fBps/10000`;
  client fee kept `clientFee·s/10000`; client gets `(amount − g) + (clientFee − clientFeeKept)`.
  So `s = 10000` equals a release, `s = 0` equals a refund, and the fee never exceeds the agreed fee.
- Expired dispute: `s = 5000`, no fees at all.

## Deadlines

| Deadline | Set when | Default | Bounds |
|---|---|---|---|
| `workDeadline` | at funding (client's delivery date); reset to `now + revisionWindow` on each revision | per contract | ≤ 365 days at funding |
| `reviewDeadline` | on each submission: `now + reviewWindow` | 7 days | 1–30 days |
| `disputeDeadline` | on dispute: `now + disputeWindow` | 14 days | 3–60 days |

Windows are snapshotted per escrow. Comparisons are inclusive at the deadline second
(`≤ deadline` allowed, `> deadline` passed); the boundaries are tested to the second.

## Known limitations (by design, documented)

- A client may fund an escrow whose freelancer never submits; funds stay locked until `workDeadline` (≤ 365 days) unless the freelancer cancels.
- The arbiter is trusted to choose a fair share within the bounds. The contract can't judge work quality.
- If Circle blocklists a party, payouts to that party revert; the dispute split can route funds to the other party.
- `block.timestamp` is set by the Base sequencer; drift of seconds is irrelevant at day-scale windows.
- The contract assumes a standard 6-decimal USDC (enforced by pinning the token at deployment; `MIN_AMOUNT = 1 USDC`).

## What the tests establish (and don't)

`ForjEscrowV3.test.ts` checks, on a local chain, that the implementation matches this document:
the full state × action matrix with deadlines open and expired (140 cases), every access-control
rule, fee maths and bounds, deadline boundaries, re-entrancy through a hostile token, blocklist
recovery, fee-on-transfer rejection, reference squatting, uint128 limits, and three seeded 150-step
random walks asserting solvency, bounded fees, terminal finality and exactly one settlement per escrow.

They do **not** establish the absence of unknown vulnerabilities or the economic soundness of the
rules. An external audit is required before mainnet.
