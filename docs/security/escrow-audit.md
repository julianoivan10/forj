# Escrow Security Audit Notes

> **Internal review** prepared by the system architect prior to mainnet
> deployment. NOT a substitute for a third-party security audit — a
> professional firm (Trail of Bits, OpenZeppelin, Spearbit) MUST review
> `WorkChainEscrow.sol` before any non-test deployment that holds real funds.

This document tracks every assumption, threat model assertion, and
defense-in-depth measure across the on-chain + off-chain escrow stack.

## Stack overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  ─────────                                                    │
│  • Privy auth (signs with embedded wallet)                    │
│  • wagmi + viem signs:                                        │
│      USDC.approve(escrow, amount)                             │
│      WorkChainEscrow.fund(freelancer, amount, deadline)       │
│      WorkChainEscrow.release(escrowId)                        │
│      WorkChainEscrow.claimAfterTimeout(escrowId)              │
│  Sends txHash + escrowId → backend                            │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ tRPC over HTTPS, Privy bearer token
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend (Next.js route handler)                              │
│  ─────────────────────────────                               │
│  • Verifies Privy token → DB user                             │
│  • Verifier service:                                          │
│      getTransactionReceipt(txHash) on RPC                     │
│      decodeEventLog(EscrowFunded / Released / ...)            │
│      Strict-compares: client, freelancer, amount, escrowId    │
│  • Updates DB (cache only — chain is source of truth)         │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ JSON-RPC
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Base (chain)                                                 │
│  ─────────                                                    │
│  WorkChainEscrow.sol:                                         │
│    • SafeERC20 (USDC)                                         │
│    • ReentrancyGuard on all state-mutating funcs              │
│    • Ownable2Step for arbiter / admin                         │
│    • Pausable killswitch on FUNDING ONLY                      │
│  USDC ERC-20 (Circle, canonical addresses)                    │
└──────────────────────────────────────────────────────────────┘
```

## Threat model

### Asset under protection

USDC funds locked in the registry between `fund()` and one of:
- `release()` (client approves)
- `refund()` (mutual cancel pre-submit)
- `claimAfterTimeout()` (auto-release)
- `resolveDispute()` (arbiter splits)

### Adversaries

| Actor | Capability | Mitigation |
|---|---|---|
| Random attacker | Send arbitrary txs to the registry | All write functions revert if caller isn't a party (`NotClient` / `NotFreelancer` / `NotParty`) |
| Compromised client wallet | Try to drain other contracts | Per-escrow `client` address stored at fund time. `release()` checks `msg.sender == e.client`. No cross-contract leakage. |
| Compromised freelancer wallet | Drain own funds early | They're only authorised actions are `submit()` (no fund movement) and `claimAfterTimeout()` (timeout-gated). Cannot release before client approves OR window expires. |
| Compromised arbiter wallet | Steal funds via `resolveDispute` | Owner can split between two parties; cannot direct funds to a third address. The recipients (client / freelancer / feeRecipient) are immutable per escrow. Worst case: 100% to client (or freelancer or fee), but never to attacker. |
| Backend RCE | Forge `fundEscrow` mutation | Backend never moves funds — it only reads chain state. Forged tRPC mutation can write garbage to DB but never produces money movement. |
| RPC node tampering | Lie about receipt status | We accept the first receipt our RPC returns. If RPC is malicious, attacker's tx looks "successful" in our DB even if reverted on-chain. **Mitigation**: use multiple RPCs (Alchemy + QuickNode + public) and require quorum for high-value events. **Status**: NOT YET IMPLEMENTED — single RPC currently. Rate as "medium" risk; mitigate before mainnet. |
| Frontend MITM | Inject wrong txHash | Backend verifier re-pulls receipt from chain, decodes event, strict-compares parties + amount + id. Frontend-supplied data is treated as a hint, never as truth. |

### Out of scope

- **USDC (Circle) compromise** — if Circle is compromised, we can't help. We
  pin to Circle's canonical addresses (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  on Base mainnet).
- **Base sequencer halt** — funds are recoverable via L1 escape hatch (Base's
  built-in mechanism). Outside our scope.
- **User loses private key** — Privy's recovery flows + embedded wallet
  social recovery handle this. Not a smart-contract concern.

## Defenses in depth

### 1. ReentrancyGuard on every state-mutating function

`fund`, `submit`, `release`, `claimAfterTimeout`, `refund`, `raiseDispute`,
`requestRevision`, `resolveDispute` all wear `nonReentrant`. SafeERC20
transfers happen AFTER state mutation (CEI pattern: Checks-Effects-Interactions).

### 2. Status state machine

Every transition is guarded by `InvalidStatus(expected, actual)` revert.
Impossible to (e.g.) `release()` a `Refunded` escrow even if signed by the
correct client — the storage row's `status` won't match.

### 3. Amount zero-out before transfer

```solidity
e.status = Status.Released;
e.amount = 0;                          // <-- belt and braces
if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
usdc.safeTransfer(e.freelancer, toFreelancer);
```

If a future refactor accidentally drops `nonReentrant`, the zero amount
prevents double-spend attempts: a re-entrant `release()` would revert at the
status check; a re-entrant `refund()` would transfer 0.

### 4. Two-step ownership (`Ownable2Step`)

Arbiter address change requires `transferOwnership()` THEN
`acceptOwnership()` from the new owner. Prevents fat-finger transfers to
addresses no one controls.

### 5. Pausable kill-switch — funding only

`whenNotPaused` is on `fund()` ONLY. Even when paused:
- Existing escrows can still be released (`release()`) — clients can pay out.
- Frees can be claimed (`claimAfterTimeout()`) — timeouts still work.
- Refunds work (`refund()`) — funds always recoverable.

Pause is for "stop accepting new business while we investigate", not
"freeze user funds". Critical distinction for trust.

### 6. Bounds on admin fields

```solidity
uint16 public constant MAX_FEE_BPS = 1_000;             // 10% hard cap
uint64 public constant MIN_AUTO_RELEASE_WINDOW = 1 days;
uint64 public constant MAX_AUTO_RELEASE_WINDOW = 30 days;
```

Even a malicious owner can't set the fee to 99% or the timeout to 100 years.
The constants compile in.

### 7. Split-mismatch invariant on dispute resolution

```solidity
uint256 sum = toFreelancer + toClient + toFee;
if (sum != e.amount) revert SplitMismatch(e.amount, sum);
```

Owner can't accidentally (or intentionally) "lose" funds during resolution.
The three out-amounts MUST sum to the locked total exactly.

### 8. Backend tx verification

Off-chain code never trusts the frontend:
- `verifyEscrowFunding()` pulls the receipt itself, decodes the
  `EscrowFunded` event, and bails on mismatched client / freelancer / amount.
- Same shape for `verifyEscrowRelease()`, `verifyEscrowRefund()`,
  `verifyEscrowResolution()`.

This means a malicious frontend cannot:
- Trick the backend into recording a contract as "funded" without a real
  on-chain transfer.
- Forge a release event for an escrow that wasn't actually paid out.
- Map their own escrowId to someone else's contract row.

### 9. Rate limiting

`fundEscrow`, `approveWork`, `claimRelease` go through `protectedProcedure`
+ existing rate limit middleware. Prevents bot-driven log-spam attacks
that would amplify an RPC outage into platform DoS.

## Known limitations / pre-mainnet TODOs

1. **Single RPC dependency** — currently we trust the first receipt our
   primary RPC returns. Pre-mainnet: implement quorum across 2 of 3 RPCs.
2. **No third-party audit** — `WorkChainEscrow.sol` has only the in-house
   31-test suite. MUST be audited by Trail of Bits / OpenZeppelin /
   Spearbit before holding real funds.
3. **No fuzzing campaign** — Foundry's `forge test --fuzz` would catch
   edge cases in the split arithmetic. Recommend before mainnet.
4. **Slither / Mythril static analysis** — not yet run. Easy to add to CI;
   should land alongside the audit.
5. **Bug bounty** — no public bounty exists. Recommend Immunefi listing
   matched to TVL (start at $50k, scale up).
6. **Fee recipient = single address** — currently `feeRecipient` is a
   single owner-controlled address. For decentralization, consider a
   multisig (Safe) from day one — same contract surface, different
   `setFeeRecipient()` argument.
7. **No upgrade path** — the contract is intentionally non-upgradable
   (no proxy). If a critical bug is found, we redeploy + migrate. This is
   the right trade for an MVP escrow but limits flexibility — document
   the migration playbook.

## Off-chain hardening

- **Admin allowlist**: `ADMIN_USER_IDS` env gate on `admin.*` procs (Phase 6).
- **Console leakage**: `next.config.ts` `compiler.removeConsole` strips
  third-party log noise from production bundles (Phase 6).
- **Rate limits**: per-proc Upstash sliding-window limiters cap abuse
  (Phase 2 + 6).
- **HSTS**: `Strict-Transport-Security` header in production (Phase 6).
- **Privy token validation**: server-side `verifyAuthToken()` for every
  authenticated proc (always). JIT user provisioning by wallet signature,
  NOT by email (would be account takeover).

## Disclosure / incident response

- **Public**: `security@workchain.io` (set up before mainnet).
- **Bounty**: Immunefi or Cantina once funds are live.
- **Killswitch**: pause sequence is `escrow.pause()` → existing flows still
  work, no new funding. Combined with platform-side feature flag to hide
  "Fund escrow" buttons in UI. Incident comms via Twitter + email blast to
  active contracts.

---

**Recommendation**: deploy to Base Sepolia + run for ≥30 days with platform-
seeded test contracts before mainnet. During that window: external audit,
fuzz campaign, multi-RPC integration, bug bounty soft launch.
