# Escrow state: what is authoritative, and how the database follows the chain

Code: `packages/api/src/escrow-v3/` (config, processor, confirm, indexer, reconcile),
`packages/api/src/routers/escrow.ts`, `packages/api/src/inngest/functions/escrow-sync.ts`.

## Who owns which state

| State | Owner | Where | Consistency |
|---|---|---|---|
| Escrow money and lifecycle (funded, submitted, revision, dispute, settlement, amounts paid) | **Blockchain (authoritative)** | ForjEscrowV3 | final once confirmed |
| Mirror of the above: `contracts.on_chain_status`, deadlines, `settled_*`, `on_chain_contract_id` | Blockchain, copied by Forj | Postgres | **eventually consistent**; written only from decoded events or `getEscrow` reads |
| Application status `contracts.status`, job status, earnings counters | Forj, derived from confirmed events | Postgres | eventually consistent with the chain |
| Intent: "user sent tx X to do Y" | Forj | `escrow_transactions` (pending / confirmed / failed) | pending until the chain confirms |
| Off-chain metadata: submission note, files, revision reason, dispute reason | Forj (application-controlled) | `escrow_transactions.metadata` → copied to the contract on confirmation | – |
| Jobs, proposals, messages, milestones, reviews | Forj (application-controlled) | Postgres | – |

Rule: **nothing in Postgres says an on-chain step happened until the matching event was decoded
from a mined receipt or log.** A recorded transaction hash is only a claim to check.

## Flow of one action

```
User clicks → UI: "needs a wallet confirmation"
   │ wallet signs (Privy smart wallet: sponsored UserOp; external wallet: EOA tx)
   ▼
escrow.recordTransaction(contractId, action, txHash, chainId, metadata)
   │ checks: configured chain, party × action matrix, V3 contract, not settled,
   │ one pending tx per contract (DB unique index), idempotent on repeated hash
   ▼
escrow_transactions row: PENDING   ──UI shows "waiting for Base to confirm"
   │
   ├─ confirmEscrowTransaction (immediately, then polled every 4 s by the UI,
   │  and every 2 min by the Inngest cron)
   │     receipt missing   → still pending (after 30 min and no tx: FAILED "dropped")
   │     receipt reverted  → FAILED ("reverted, nothing changed")
   │     success but no matching event for this escrow → FAILED
   │     success + matching event → ingest receipt logs
   ▼
escrow_events (unique chainId+txHash+logIndex) ─► applyPendingEvents (block, logIndex order)
   │     per-event transaction: claim event → update contract row → mark tx CONFIRMED
   │     notifications / earnings run once, when the event is first applied
   ▼
UI refetches: status comes from the database mirror of the chain
```

## Idempotency and ordering

- Events are stored once (`escrow_events_log_unique`). Receipt path and indexer path can both see the
  same event; the second insert is a no-op.
- Each event is applied in its own DB transaction that first claims it (`applied_at IS NULL`), so
  concurrent runners can't double-apply.
- Contracts record `(last_event_block, last_event_log_index)`; an older event never overwrites newer state.
- Earnings are incremented only when a settlement event is first applied. The E2E suite replays
  every log twice and asserts earnings, statuses and event rows are unchanged.

## Matching an event to a contract

- `EscrowFunded` → by `contract_ref`, and only if the event's client wallet equals the contract's
  client. References are unique per client on-chain, so a third party funding with a copied
  reference is ignored (`escrow.foreign_funding_ignored`). If freelancer or amount don't match the
  stored terms, the row is **not** marked funded and `sync_issue` is set.
- Every other event → by `(escrow_contract_address, on_chain_contract_id)`.

## Indexer

`syncEscrowLogs` reads all ForjEscrowV3 logs from `indexer_cursors` (or the deploy block) up to
`head − ESCROW_CONFIRMATIONS` (default 3) in 5,000-block chunks. Staying behind head avoids ingesting
logs a shallow reorg could remove. A crash between ingest and cursor update just replays the same
range next run.

Reorgs deeper than the confirmation margin are not rolled back automatically. The reconciler will
detect the resulting drift (chain read disagrees with the mirror) and flag it in `sync_issue`.

## Reconciler

`reconcileEscrows` (cron every 2 minutes, or `admin.runEscrowSync`):

1. Re-checks pending transactions (confirm, fail or drop).
2. Finds contracts with a `contract_ref` still in `created` whose client has an escrow on-chain
   (`escrowIdByRef(client, ref)`), meaning the client funded but the app never reported it. It then
   ingests that escrow's logs.
3. For open or stale V3 escrows, reads `getEscrow`. On disagreement it re-ingests that escrow's logs
   (topic filter on `escrowId`), then writes whatever still disagrees to `sync_issue` and logs
   `escrow.reconcile_mismatch`.

It never writes a status the chain didn't emit an event for. "Fixing" drift means ingesting real
events; anything else is reported, not papered over.

## Monitoring hooks

Structured JSON log events (Vercel log drain): `escrow.tx_recorded`, `escrow.event_applied`,
`escrow.tx_failed`, `escrow.funding_mismatch`, `escrow.foreign_funding_ignored`,
`escrow.reconcile_mismatch`, `escrow.drift_detected`, `escrow.unlinked_funding_recovered`,
`escrow.indexer_run`, `escrow.rpc_error`, `escrow.admin_event` (config changes on the contract),
`admin.escrow_resolution_recorded`, `webhook.privy_*`, `auth.failure`, `trpc.internal_error`,
`ratelimit.disabled`. The admin router's `escrowSyncStatus` returns the indexer position, pending and
failed transactions, and contracts with drift.

Alert on: any `escrow.drift_detected`, `escrow.funding_mismatch`, `ratelimit.disabled`, pending
transactions older than 30 minutes, or the indexer cursor falling more than ~1,000 blocks behind.
