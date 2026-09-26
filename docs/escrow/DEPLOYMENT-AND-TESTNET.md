# ForjEscrowV3: deployment and testnet testing

## Keys

- **Deployment key**: `DEPLOYER_PRIVATE_KEY` in `packages/contracts/.env.deploy` (gitignored).
  Hardhat still falls back to the root `.env` and prints a warning. Move it: the root `.env` is loaded
  by `next dev`, and the web app never needs this key.
- **Application runtime**: holds **no private key**. The server only reads chain state; users sign
  with their own wallets (Privy smart wallets or external wallets).
- **Admin / arbiter / guardian**: contract roles, set at deployment and changeable by the owner.
  On testnet today all three are the deployer EOA `0xA3B1…1052`. See `docs/security/ADMIN-KEYS-AND-INCIDENTS.md`.

## Pipeline (Base Sepolia only)

```bash
# 1. compile, test (unit + matrix + invariants), regenerate the ABI the app uses
pnpm --filter @forj/contracts check:v3

# 2. static analysis (Slither 0.11.x, run from a Python venv)
cd packages/contracts && slither . --hardhat-ignore-compile --filter-paths "node_modules|mocks"

# 3. deploy + read-back checks + Basescan verification + deployment record
pnpm --filter @forj/contracts deploy:v3:sepolia
#   optional: V3_OWNER, V3_ARBITER, V3_GUARDIAN, V3_FEE_RECIPIENT (default: deployer / PLATFORM_FEE_RECIPIENT)

# 4. record the address
#    packages/contracts/src/addresses.ts → escrowV3 + escrowV3DeployBlock
pnpm --filter @forj/contracts build

# 5. Pimlico: add the V3 address to the sponsorship policy (smart-wallet users revert without it)

# 6. database migration (see docs/DATABASE-MIGRATIONS.md), then deploy the app

# 7. end-to-end on Base Sepolia against a local Postgres
E2E_DATABASE_URL=postgres://…@127.0.0.1:…/forj_e2e E2E_FUNDER_KEY=0x… pnpm --filter @forj/api test:e2e
```

The deploy script refuses any network except `baseSepolia` and `base`, and refuses `base` unless
`ALLOW_MAINNET_DEPLOY=true` **and** `FORJ_V3_AUDIT_REPORT` are set. On mainnet it also refuses a
deployer-owned owner or arbiter. The legacy v1 script refuses mainnet outright.

## Current deployment

| | |
|---|---|
| Contract | ForjEscrowV3 |
| Network | Base Sepolia (84532) |
| Address | `0x9813A755Cd6dAA83a9B32dd7222594208365C43b` |
| Deploy block / tx | 47249309 / `0xc69893de…1d753` |
| Verified | Yes (Basescan) |
| Owner / arbiter / guardian | deployer EOA (testnet only) |
| Fee recipient | Safe `0x2332…d5e6` |
| Record | `packages/contracts/deployments/baseSepolia-ForjEscrowV3.json` |

## Testnet E2E: what is automated

`packages/api/e2e/escrow-v3.sepolia.e2e.ts` runs against the deployed contract with real test USDC,
separate throwaway client and freelancer keys, the real tRPC procedures, the indexer and the
reconciler, on a migrated local Postgres:

| Scenario | Checks |
|---|---|
| Normal | server-prepared terms → approve + fund → recorded and confirmed; duplicate hash idempotent; unrelated successful tx rejected; submit (note copied on confirmation) → release; 980,000 / 70,000 base units on-chain and in the DB; earnings +0.98 |
| Revision | request (reason) → resubmit → release; revision count mirrored |
| Dispute | client dispute → arbiter 60% via the admin router with audit reason → 588,000 / 420,000 / 42,000 |
| Failures | wrong chain, stranger, wrong role; reverted tx → failed, nothing changed, metadata not applied; safe retry; unmined hash stays pending, blocks a second pending tx, and is marked dropped after 30 min; insufficient balance stopped by pre-flight simulation |
| Reconciliation | funding never reported → recovered from `escrowIdByRef`; submission never reported → recovered from logs; forged "completed" status flagged in `sync_issue`, not trusted |
| Indexer | full replay from the deploy block, twice → no new events, no status or earnings change, nothing left pending |

## Testnet E2E: what still needs a human (NOT automated)

- Privy login, embedded wallet and smart-wallet (sponsored UserOp) signing in a browser.
- Pimlico sponsorship for the V3 address.
- Two-browser walkthrough of the contract page (docs/TESTER-WALLETS.md), including the pending,
  failed and drift banners, and mobile layouts of the authenticated pages.
- Expired deadlines on a real chain (the contract suite covers them with time travel; testnet
  windows are ≥ 1 day).
- Duplicate Privy webhooks (signature verification is unit-level; replay is idempotent by design).
