# Mainnet readiness gate

Mainnet stays **BLOCKED** until every BLOCKER below is PASS. Passing tests are necessary, not
sufficient. Last assessed: 2026-09-24.

| Area | Item | Status | Evidence / what's missing |
|---|---|---|---|
| Contract | Escrow V3 implemented | PASS | `ForjEscrowV3.sol`, `docs/escrow/ESCROW-V3.md` |
| Contract | Contract tests | PASS | 188 V3 tests: 140-case state matrix, access control, deadlines, fee bounds, adversarial tokens, 3 invariant walks |
| Contract | Static analysis | PASS (triaged) | Slither 0.11.6: 1 medium (intentional rounding), 2 low (guardian zero allowed), 8 timestamp |
| Contract | **External audit** | **BLOCKER** | not started; must cover the exact deployed source; findings resolved |
| Contract | Formal / long-run fuzzing | NEEDS WORK | seeded random walks only; recommend Foundry/Echidna invariants at scale |
| Contract | Testnet soak | NEEDS WORK | deployed 2026-09-24; needs weeks of real use incl. smart wallets |
| App ↔ chain | Lifecycle driven on-chain | PASS (API + E2E) | DB-only transitions refused for V3; state from confirmed events |
| App ↔ chain | Reconciliation / indexer | PASS (E2E) | idempotent replay, drift recovery, stale funding recovery verified on Base Sepolia |
| App ↔ chain | Browser wallet flow (Privy smart wallet) | **BLOCKER** | **NOT VERIFIED**: needs a manual two-browser run + Pimlico policy for V3 |
| Data | Versioned migrations | PASS | `packages/db/drizzle`, runner with guards |
| Data | Migrations applied to production DB | NEEDS WORK | baseline + 0001 pending (read-only status checked) |
| Keys | Deployer key out of shared `.env` | NEEDS WORK | Hardhat supports `.env.deploy`; key not yet moved |
| Keys | Owner = timelock + Safe, arbiter = Safe, guardian set | **BLOCKER** | testnet roles are the deployer EOA |
| Ops | Monitoring + alerting | **BLOCKER** | structured logs exist; no alert routing, Sentry not installed |
| Ops | Rate limiting confirmed in prod | NEEDS WORK | fails open without Upstash (now logged); prod **NOT VERIFIED** |
| Ops | Dedicated RPC for server | NEEDS WORK | public RPC lags (observed in E2E) |
| Ops | Inngest keys in prod (sync cron) | NEEDS WORK | **NOT VERIFIED** |
| Files | Private deliverables | NEEDS WORK | UploadThing URLs are public-by-link |
| Security | CSP | NEEDS WORK | none |
| Legal | Terms match contract rules | NEEDS WORK | updated to V3 rules; needs legal review; `/help/disputes-and-recovery` not reviewed |
| Legal | Security contact / disclosure policy | **BLOCKER** | none |
| Config | Mainnet addresses and chain | NEEDS WORK | `BASE.escrowV3` intentionally empty; USDC canonical |
| Deploy | Mainnet guard | PASS | `ALLOW_MAINNET_DEPLOY=true` + `FORJ_V3_AUDIT_REPORT` + non-deployer roles required |

## Stage verdicts

| Stage | Verdict | Why |
|---|---|---|
| A. Local development | **Ready** | typecheck, tests and build pass; Docker Postgres + migrations work |
| B. Private Base Sepolia testing | **Ready, with care** | V3 deployed and verified; API/indexer E2E passes on-chain. Browser wallet flow unverified; testnet roles on one EOA; production DB not migrated yet |
| C. Public Base Sepolia testnet | **Not yet** | first: apply migrations to the deployed DB, deploy the app, Pimlico policy for V3, a manual smart-wallet walkthrough, roles moved to Safes, Upstash + Inngest + RPC confirmed, alerting on drift |
| D. Mainnet | **BLOCKED** | external audit, key architecture (timelock + Safes), monitoring/alerting, security contact, testnet soak, verified wallet UX |
