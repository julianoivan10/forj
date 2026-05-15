# Forj — Setup & Deploy Runbook

This is the **single source of truth** for getting Forj running locally,
deploying the smart contract to Base Sepolia, and ramping up the testnet
end-to-end demo.

Read it in order. Each section ends with a ✅ checkpoint you can run before
moving on.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [External services to sign up for](#2-external-services-to-sign-up-for)
3. [Local environment variables](#3-local-environment-variables)
4. [Database (Neon Postgres)](#4-database-neon-postgres)
5. [First-time install + dev server](#5-first-time-install--dev-server)
6. [Smart contract deploy → Base Sepolia](#6-smart-contract-deploy--base-sepolia)
7. [Wire deployed address into the app](#7-wire-deployed-address-into-the-app)
8. [Set the platform admin (arbiter)](#8-set-the-platform-admin-arbiter)
9. [End-to-end testnet smoke test](#9-end-to-end-testnet-smoke-test)
10. [Production checklist (before mainnet)](#10-production-checklist-before-mainnet)

---

## 1. Prerequisites

| Tool       | Version    | Notes                                         |
|------------|------------|-----------------------------------------------|
| Node.js    | ≥ 20.10    | `node -v`                                     |
| pnpm       | ≥ 9.0      | `pnpm -v`. Install: `npm i -g pnpm`           |
| Git        | any recent | for cloning + commits                         |
| MetaMask   | latest     | Or any EIP-1193 wallet for testnet flows      |

> **Windows users**: Hardhat compile uses `solc` which downloads on first run.
> First `pnpm --filter @forj/contracts compile` will take ~30s.

---

## 2. External services to sign up for

You need accounts on these services. Free tiers are sufficient for testnet.

### Required for the platform to run

| Service       | What for                              | Sign up                                          |
|---------------|---------------------------------------|--------------------------------------------------|
| **Neon**      | Postgres DB (serverless)              | https://console.neon.tech                        |
| **Privy**     | Auth + embedded wallets               | https://dashboard.privy.io                       |
| **Alchemy**   | Base + Base Sepolia RPC               | https://dashboard.alchemy.com (or QuickNode/Infura) |

### Required to deploy the smart contract

| Service       | What for                              | Sign up                                          |
|---------------|---------------------------------------|--------------------------------------------------|
| **Basescan**  | Verify deployed contract source       | https://basescan.org/myapikey                    |
| **MetaMask**  | Hold a deployer key with testnet ETH  | Browser extension                                |

### Optional (graceful-degradation if absent)

| Service       | What for                              | Sign up                                          |
|---------------|---------------------------------------|--------------------------------------------------|
| **Resend**    | Transactional email                   | https://resend.com                               |
| **UploadThing** | Avatar uploads                      | https://uploadthing.com/dashboard                |
| **Upstash Redis** | Rate limiting (procs work without, just no rate limit) | https://console.upstash.com |
| **Sentry**    | Error tracking in prod                | https://sentry.io                                |

> **Without optional services**: the app still runs. Avatar upload shows
> "image upload is not configured", emails skip, rate limiting is a no-op.

---

## 3. Local environment variables

Create `.env` at the **repo root** (NOT inside `apps/web`). Drizzle, Hardhat,
and Next.js all read from this single file via `dotenv-cli`.

Copy the template below, fill in the values from §2 services, save as `.env`.

```bash
# ────────────────────────────────────────────────────────────────────
# Core
# ────────────────────────────────────────────────────────────────────
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Forj

# ────────────────────────────────────────────────────────────────────
# Database (Neon)
# ────────────────────────────────────────────────────────────────────
# Neon dashboard → your project → "Connection string" → "Pooled connection"
DATABASE_URL=postgres://neondb_owner:...@ep-...-pooler.region.aws.neon.tech/neondb?sslmode=require

# Neon "Direct connection" — used by drizzle-kit migrate (cannot use the
# pooler, it doesn't support advisory locks). Same DB, different host.
DATABASE_URL_UNPOOLED=postgres://neondb_owner:...@ep-...region.aws.neon.tech/neondb?sslmode=require

# ────────────────────────────────────────────────────────────────────
# Auth (Privy)
# ────────────────────────────────────────────────────────────────────
# Privy dashboard → Apps → your app → "App ID" + "App Secret"
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxxxxxxxxxx
PRIVY_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ────────────────────────────────────────────────────────────────────
# Chain — Base Sepolia for testnet, Base mainnet for prod
# ────────────────────────────────────────────────────────────────────
# 8453   = Base mainnet
# 84532  = Base Sepolia (testnet) ← set this for testnet flows
NEXT_PUBLIC_CHAIN_ID=84532

# Alchemy: dashboard → "Apps" → create one for Base mainnet + one for Sepolia
NEXT_PUBLIC_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Native USDC contract — pre-filled, do NOT change
# Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Filled in AFTER §6 (deploy step)
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=

# ────────────────────────────────────────────────────────────────────
# Smart contract deploy — only needed for §6
# ────────────────────────────────────────────────────────────────────
# A funded EOA's private key (the wallet that pays gas to deploy).
# **Use a dedicated burner key, NEVER your main wallet.**
DEPLOYER_PRIVATE_KEY=0x...

# Wallet address that receives platform fees on every release.
# For testnet, use the same address as your deployer or a fresh wallet.
# For prod, use a multisig (Safe) address.
PLATFORM_FEE_RECIPIENT=0x...

# Basescan API key (one key works for mainnet + sepolia)
BASESCAN_API_KEY=YOUR_BASESCAN_KEY

# ────────────────────────────────────────────────────────────────────
# Admin — comma-separated DB user IDs allowed to access /admin/disputes
# ────────────────────────────────────────────────────────────────────
# Get this AFTER signing up on the running app: open dashboard → settings →
# DB user ID is in the URL of /u/<username> after onboarding (or query the
# DB directly: select id from users where email = 'you@x.com').
ADMIN_USER_IDS=

# ────────────────────────────────────────────────────────────────────
# Optional services — leave blank to disable
# ────────────────────────────────────────────────────────────────────
RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@workchain.example

UPLOADTHING_TOKEN=
# (legacy v6 fallback, ignore if v7 token above is set)
UPLOADTHING_SECRET=
UPLOADTHING_APP_ID=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### Where each value comes from — quick lookup

| Variable | Source |
|---|---|
| `DATABASE_URL` | Neon dashboard → project → **Connection string** (pooled) |
| `DATABASE_URL_UNPOOLED` | Neon dashboard → same place, toggle "Direct connection" |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy dashboard → Apps → your app → **App ID** |
| `PRIVY_APP_SECRET` | Privy dashboard → same → **App Secret** (reveal once) |
| `NEXT_PUBLIC_BASE_RPC_URL` | Alchemy → Apps → Base mainnet app → **API key URL** |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | Same, Base Sepolia app |
| `DEPLOYER_PRIVATE_KEY` | MetaMask → "Show private key" on a burner account funded with Sepolia ETH |
| `PLATFORM_FEE_RECIPIENT` | Any wallet address you control (or a Safe multisig for prod) |
| `BASESCAN_API_KEY` | Basescan → your account → API Keys → **Add** |
| `RESEND_API_KEY` | Resend dashboard → API Keys → **Create** |
| `UPLOADTHING_TOKEN` | UploadThing dashboard → your app → **API Keys** → "v7 token" |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash Redis console → DB → **REST API** tab |

✅ **Checkpoint**: `cat .env | grep -c "^[A-Z]"` → should print at least 12 (number of mandatory vars filled).

---

## 4. Database (Neon Postgres)

### 4.1 Create the database

1. Sign in to Neon → **Create project**.
2. Name it `workchain-dev`. Region close to you.
3. Postgres version 16+. Default branch `main`.
4. Copy the two connection strings (pooled + direct) into `.env` as
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

### 4.2 Push the schema

```bash
pnpm install   # if not already
pnpm --filter @forj/db push
```

You'll be asked to confirm a few enum + table creations. Type `y` and Enter.

If you see `ERR_PNPM_NO_SCRIPT`, run instead:

```bash
pnpm --filter @forj/db exec drizzle-kit push --force
```

✅ **Checkpoint**: open Neon dashboard → SQL Editor → `select count(*) from users;`
should return `0` rows (no error = schema is in place).

---

## 5. First-time install + dev server

```bash
# Install everything, including the @forj/contracts build
pnpm install

# Build the contracts package (compiles src/ to dist/ for runtime)
pnpm --filter @forj/contracts build

# Compile the Solidity (downloads solc on first run)
pnpm --filter @forj/contracts compile

# Run the contract test suite — should print "31 passing"
pnpm --filter @forj/contracts test

# Typecheck everything
pnpm -r typecheck

# Start the web dev server (Next.js Turbopack)
pnpm --filter web dev
```

Open http://localhost:3000.

✅ **Checkpoint**: landing page loads, "Sign in" works (Privy modal opens),
no red errors in browser console.

> **MetaMask "failed to connect"** — fixed in `apps/web/lib/wagmi/config.ts`
> by switching to `@privy-io/wagmi`'s `createConfig`. If it reappears,
> verify the import line reads `from '@privy-io/wagmi'`, not `from 'wagmi'`.

---

## 6. Smart contract deploy → Base Sepolia

### 6.1 Get testnet ETH

The deployer wallet needs ~0.05 Sepolia ETH for gas.

| Faucet | URL |
|---|---|
| Coinbase | https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet |
| Alchemy | https://www.alchemy.com/faucets/base-sepolia |
| QuickNode | https://faucet.quicknode.com/base/sepolia |

Paste your `DEPLOYER_PRIVATE_KEY`'s public address, claim. Wait ~30s.

### 6.2 Deploy

```bash
pnpm --filter @forj/contracts deploy:sepolia
```

The script prints something like:

```
Deploying WorkChainEscrow on baseSepolia
  deployer:      0xAbC1...
  USDC:          0x036CbD53842c5426634e7929541eC2318f3dCF7e
  feeRecipient:  0x...
  defaultFeeBps: 500 (5%)
  autoRelease:   604800s (7 days)

✔ Deployed at 0xDEPLOYED_ADDRESS_HERE
```

**Copy the deployed address.** You'll paste it twice in §7.

### 6.3 Verify on Basescan

```bash
pnpm --filter @forj/contracts verify:sepolia 0xDEPLOYED_ADDRESS_HERE \
  0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  $PLATFORM_FEE_RECIPIENT \
  500 \
  604800 \
  $DEPLOYER_PUBLIC_ADDRESS
```

Replace `$PLATFORM_FEE_RECIPIENT` and `$DEPLOYER_PUBLIC_ADDRESS` with the
actual addresses (no `$` literal — those are placeholders).

After ~20s, Basescan will confirm: **"Successfully verified contract
WorkChainEscrow on Etherscan"**.

✅ **Checkpoint**: open `https://sepolia.basescan.org/address/0xDEPLOYED_ADDRESS_HERE`.
Tab "Contract" should show source code with the green checkmark.

---

## 7. Wire deployed address into the app

Two places need the deployed address:

### 7.1 Frontend env

Edit `.env` at repo root:

```bash
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0xDEPLOYED_ADDRESS_HERE
```

### 7.2 Contracts package addresses module

Edit `packages/contracts/src/addresses.ts`:

```ts
export const BASE_SEPOLIA = {
  chainId: 84532,
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
  escrow: '0xDEPLOYED_ADDRESS_HERE' as const,  // ← paste here
} as const;
```

Then rebuild the package so the consuming code picks up the new value:

```bash
pnpm --filter @forj/contracts build
```

**Restart the dev server** so Next.js picks up the new env:

```bash
# Ctrl+C the running dev process, then:
pnpm --filter web dev
```

✅ **Checkpoint**: open dashboard → settings → Account tab. The wallet card
should show your wallet address + USDC balance. Network badge says
"Base Sepolia". No "wrong network" warning.

---

## 8. Set the platform admin (arbiter)

After you sign up on the running app:

1. Sign in → complete onboarding (create username).
2. Open Neon SQL Editor:

```sql
select id, username, email from users where username = 'your-username';
```

3. Copy the `id` (a UUID like `0e1c…f73a`).
4. Edit `.env`:

```bash
ADMIN_USER_IDS=0e1c34ad-…-f73a
```

For multiple admins: `ADMIN_USER_IDS=uuid1,uuid2,uuid3`

5. Restart the dev server.

✅ **Checkpoint**: visit `/admin/disputes` while signed in. The page should
load (empty list initially). Sign out → page redirects you to login. Sign
in as a non-admin → page returns FORBIDDEN.

---

## 9. End-to-end testnet smoke test

See [`TESTNET-RUNBOOK.md`](./TESTNET-RUNBOOK.md) for the full flow. Quick
summary:

1. Two browser profiles (or two browsers) — one client, one freelancer
2. Each gets ~10 USDC from a Sepolia faucet (link in runbook)
3. Client posts a job → freelancer applies → client accepts
4. Client funds escrow on-chain → MetaMask asks to approve USDC + fund
5. Freelancer submits work → client approves → release tx fires
6. Both leave reviews → public proof URL works

If every step works, you're testnet-ready.

---

## 10. Production checklist (before mainnet)

DO NOT deploy to Base mainnet until **every** item below is checked:

- [ ] **Smart contract audit** — third-party review of `WorkChainEscrow.sol`
      (Cantina, Sherlock, OpenZeppelin Defender, etc).
- [ ] **Bug bounty** posted on Immunefi or similar before public launch.
- [ ] `PLATFORM_FEE_RECIPIENT` is a multisig (Safe), NOT an EOA.
- [ ] `DEPLOYER_PRIVATE_KEY` deployer wallet is rotated post-deploy
      (`Ownable2Step.transferOwnership` → multisig → `acceptOwnership`).
- [ ] Privy production app + production-mode App Secret (separate from dev).
- [ ] Neon production project with read replicas + branch backups enabled.
- [ ] Resend domain verified + DKIM/SPF records (no `@example.com` from-email).
- [ ] Sentry DSN set + source maps uploaded so prod stack traces are useful.
- [ ] Rate limit Redis is in production tier (free tier evicts under load).
- [ ] CORS / CSP headers reviewed (`apps/web/next.config.ts`).
- [ ] Terms of Service + Privacy Policy pages reviewed by counsel.
- [ ] Fee structure communicated clearly (the on-chain fee is immutable
      until the owner calls `setDefaultFeeBps`).
- [ ] Disaster-recovery plan: ownership transfer documented, escrow pause
      switch documented, dispute resolver fallback documented.

---

## Troubleshooting

### "Module not found: @forj/contracts"

```bash
pnpm --filter @forj/contracts build
```

The consuming packages read from `dist/`. If you skip the build step, the
`.js` files don't exist.

### "Specified module format (CommonJS) is not matching the source code"

You hit the same wall we hit. Make sure `packages/contracts/dist/` exists and
its files are CJS (look for `exports.X = ...` at the top of any `.js`). If
they're ESM (`export const`), re-build — the `tsconfig.build.json` should
emit CJS.

### Privy modal opens but "Failed to connect MetaMask"

`apps/web/lib/wagmi/config.ts` MUST import `createConfig` from
`@privy-io/wagmi`, not from raw `wagmi`. Without that, Privy's wallet
connector chain isn't installed.

### `drizzle-kit push` "advisory lock" error

You're using the pooled connection string. Set `DATABASE_URL_UNPOOLED` to
the direct (non-pooler) connection in your Neon dashboard.

### "ADMIN_USER_IDS empty" → can't access /admin/disputes

That env var is comma-separated DB user UUIDs. Check the value matches the
`id` field in the `users` table (NOT the username, NOT the privyId, NOT the
wallet address — the **DB primary key UUID**).

---

## Appendix: env var inventory

Total: **20+ env vars** (12 mandatory, rest optional).

```
Mandatory:
  NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_APP_NAME
  DATABASE_URL
  DATABASE_URL_UNPOOLED
  NEXT_PUBLIC_PRIVY_APP_ID
  PRIVY_APP_SECRET
  NEXT_PUBLIC_CHAIN_ID
  NEXT_PUBLIC_BASE_RPC_URL
  NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
  NEXT_PUBLIC_USDC_ADDRESS
  DEPLOYER_PRIVATE_KEY            (deploy time only)
  PLATFORM_FEE_RECIPIENT          (deploy time only)
  BASESCAN_API_KEY                (verify only)

Set after deploy:
  NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
  ADMIN_USER_IDS

Optional / graceful-degrade:
  RESEND_API_KEY
  RESEND_FROM_EMAIL
  UPLOADTHING_TOKEN
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  NEXT_PUBLIC_SENTRY_DSN
  SENTRY_AUTH_TOKEN
```
