# Forj

> **Work, forged in trust.**
> A freelance marketplace built on Base. Smart-contract escrow,
> on-chain reputation, frictionless payouts — without the Web3 jargon.

[![Network: Base Sepolia](https://img.shields.io/badge/network-Base%20Sepolia-blue)](https://sepolia.basescan.org/)
[![Settlement: USDC](https://img.shields.io/badge/settlement-USDC-2775ca)](https://www.circle.com/usdc)
[![Status: Testnet](https://img.shields.io/badge/status-testnet-f2c14e)](#)

---

## What problem does Forj solve?

Traditional freelance marketplaces hold your money, charge 20%+ in fees,
and own your reputation. If they decide your account is suspicious, you're
locked out of both your earnings and your portfolio.

Forj puts the contract on-chain:

- **Escrow is a smart contract**, not a marketplace ledger. Forj can't
  freeze your funds — only the parties or the on-chain arbiter can move them.
- **Reputation is yours**, attached to a wallet that follows you anywhere.
  Every contract, every review, every payout is verifiable on Basescan.
- **Non-crypto-friendly UX**. Sign in with email. We provision a smart
  wallet behind the scenes and sponsor your gas. The Web3 plumbing is
  invisible — you just get a receipt that can't be forged later.

Combined platform fee: **5% client + 2% freelancer = 7%**. Below market,
sustainable economics. See [`docs/business/pricing-and-revenue.md`](docs/business/pricing-and-revenue.md).

---

## Repository layout (Turborepo monorepo, pnpm workspaces)

```
forj/
├─ apps/
│  └─ web/                       Next.js 15 App Router frontend
├─ packages/
│  ├─ api/                       tRPC v11 routers + business logic
│  ├─ db/                        Drizzle ORM schema + Neon client
│  ├─ contracts/                 Solidity escrow + ABI + deploy scripts
│  ├─ email/                     React Email templates + Resend dispatch
│  └─ config/
│     ├─ eslint/                 Shared ESLint config
│     ├─ tailwind/               Shared Tailwind v4 theme (Bauhaus palette)
│     └─ typescript/             Base tsconfig presets
├─ docs/
│  ├─ ARCHITECTURE.md            System overview, data flow, scaling notes
│  ├─ TESTING.md                 Full test plan + manual checklists
│  ├─ CONTRIBUTING.md            Dev environment + conventions
│  ├─ SETUP.md                   First-time setup runbook
│  ├─ PIMLICO-SETUP.md           Smart-wallet + paymaster config
│  ├─ TESTNET-RUNBOOK.md         End-to-end walkthrough
│  ├─ business/                  Pricing model, revenue plan
│  ├─ design/                    Feature design notes
│  └─ security/                  Audit notes for the escrow contract
└─ .env.example                  Copy → .env, fill in credentials
```

Workspace package names are all `@forj/*`. They depend on each other via
`workspace:*` ranges so changes are picked up live during `pnpm dev`.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15.5 (App Router + Turbopack), React 19, Tailwind v4 |
| Auth | Privy (email / Google / wallet) with embedded wallet + smart wallet |
| Smart wallet | Privy + Pimlico (ERC-4337 / Kernel) — sponsored gas |
| API | tRPC v11 over Next.js route handlers, superjson |
| Database | Neon serverless Postgres + Drizzle ORM |
| Blockchain | Base Sepolia (testnet), Solidity 0.8.24, Hardhat |
| Settlement | USDC (6 decimals, native on Base) |
| Files | UploadThing |
| Email | Resend + React Email |
| Misc | Sonner toasts, Framer Motion, Radix UI |

---

## Quick start

```bash
# 1. Clone + install
git clone <repo-url> forj
cd forj
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET, etc.
# See docs/SETUP.md for the full env walkthrough.

# 3. Push DB schema
pnpm --filter @forj/db push

# 4. Compile + build the contracts package
pnpm --filter @forj/contracts compile
pnpm --filter @forj/contracts build

# 5. Run dev
pnpm --filter @forj/web dev
# → http://localhost:3000
```

Full walkthrough including external service signup, Pimlico configuration,
and the first end-to-end testnet test: [`docs/SETUP.md`](docs/SETUP.md).

---

## On-chain artifacts

| Network | Contract | Address |
|---|---|---|
| Base Sepolia | **ForjEscrowV3** (explicit on-chain lifecycle; new escrows) | [`0x9813A755Cd6dAA83a9B32dd7222594208365C43b`](https://sepolia.basescan.org/address/0x9813A755Cd6dAA83a9B32dd7222594208365C43b#code) |
| Base Sepolia | ForjEscrow (v2, legacy: existing escrows only) | [`0x09fb654f30637258d30e3f03b06f5370a0cf8954`](https://sepolia.basescan.org/address/0x09fb654f30637258d30e3f03b06f5370a0cf8954#code) |
| Base Sepolia | WorkChainEscrow (v1 legacy, frozen) | `0x079fe8805faac09fead18eb56a37967311e4cf8b` |
| Base Sepolia | USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base mainnet | ForjEscrowV3 | _not deployed: blocked, see [`docs/MAINNET-READINESS.md`](docs/MAINNET-READINESS.md)_ |

New contracts fund ForjEscrowV3. Older escrows stay on the contract they were funded
under. Escrow docs: [`docs/escrow/ESCROW-V3.md`](docs/escrow/ESCROW-V3.md) (rules and permissions),
[`docs/escrow/SYNC-AND-RECONCILIATION.md`](docs/escrow/SYNC-AND-RECONCILIATION.md) (what is authoritative),
[`docs/escrow/DEPLOYMENT-AND-TESTNET.md`](docs/escrow/DEPLOYMENT-AND-TESTNET.md),
[`docs/DATABASE-MIGRATIONS.md`](docs/DATABASE-MIGRATIONS.md), [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md),
[`docs/security/ADMIN-KEYS-AND-INCIDENTS.md`](docs/security/ADMIN-KEYS-AND-INCIDENTS.md).

---

## Status

**Testnet only.** Mainnet rollout depends on:

- [ ] Legal entity registered (PT / Pte Ltd) for off-ramp partner KYB
- [ ] Multisig (Safe) deployed and ownership transferred from EOA
- [ ] Smart contract audit (community review + at minimum one paid audit)
- [ ] Production Pimlico paymaster funded (~$20 ETH for ~6000 ops)
- [ ] Transak / MoonPay integration completed (fiat off-ramp)
- [ ] Mobile responsive audit pass
- [ ] i18n Indonesian translations
- [ ] CI/CD pipeline (Vercel + GitHub Actions)

Tracked in [`docs/TESTING.md`](docs/TESTING.md) + roadmap.

---

## Where to go next

- **Building a new feature?** Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.
- **Reporting a bug?** Run through [`docs/TESTING.md`](docs/TESTING.md) — chances are there's a repro recipe.
- **Setting up locally?** [`docs/SETUP.md`](docs/SETUP.md) and then [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).
- **Pricing / business questions?** [`docs/business/pricing-and-revenue.md`](docs/business/pricing-and-revenue.md).
- **Smart wallet wiring?** [`docs/PIMLICO-SETUP.md`](docs/PIMLICO-SETUP.md).

---

## License

Private — pre-launch. License will be assigned once the legal entity is in place.
