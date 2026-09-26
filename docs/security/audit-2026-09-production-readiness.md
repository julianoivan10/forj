# Forj production-readiness audit — 2026-09-24

Scope: the whole monorepo at `9662235` plus uncommitted fixes from this audit, the live deployment at
<https://forj-pi.vercel.app>, and the deployed Base Sepolia contracts.

Every statement is tagged with how it is known:

- **[verified]**: observed directly (code read, command output, live HTTP request, on-chain read).
- **[tested]**: covered by an automated test that now runs in the repo.
- **[inferred]**: reasoned from code; not exercised end to end.
- **[recommendation]**: proposed, not implemented.

Passing tests are **not** security assurance. The contract suite includes tests labelled
`KNOWN RISK` that pass *because* the unsafe behaviour exists.

---

## 1. Current architecture

```
Browser (Next.js 15 App Router, React 19, Tailwind v4)
  │  Privy (email / Google / X / wallet login) → embedded EOA + ERC-4337 smart wallet (Pimlico paymaster)
  │  wagmi/viem → Base / Base Sepolia RPC
  │
  ├── tRPC  /api/trpc  (Bearer Privy access token → verifyAuthToken → users row, JIT provisioned)
  │     └── @forj/api routers ── Drizzle ORM ── Neon Postgres (neon-serverless Pool)
  │            ├── services/escrow.ts  → reads tx receipts from Base RPC to verify fund/release/resolve
  │            ├── services/notifications.ts → notifications table + email (Resend) via Inngest or inline
  │            └── middleware/rate-limit.ts → Upstash Redis (fails open when unset)
  ├── /api/uploadthing   (UploadThing v7, public file URLs)
  ├── /api/inngest       (email retry queue)
  └── /api/webhooks/privy (user sync)

Base Sepolia
  ForjEscrow v2   0x09fb654f30637258d30e3f03b06f5370a0cf8954  owner = Safe 0x2332…d5e6 (also feeRecipient)
  WorkChainEscrow v1 (legacy) 0x079fe8805faac09fead18eb56a37967311e4cf8b  owner = EOA 0xA3B1…1052
  USDC (Circle)   0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

| Area | Implementation |
|---|---|
| Framework | Next.js 15.5 / React 19, Turborepo + pnpm workspaces |
| API | tRPC v11 (`packages/api`), superjson |
| DB / ORM | Neon Postgres, Drizzle 0.38. **No committed migrations** (`packages/db/drizzle/` is gitignored; schema changes go through `db:push`) |
| Auth | Privy access token (JWT, ES256) verified server-side; user row keyed by `privyId` |
| Wallet | Privy embedded wallet + smart wallet; external wallets (MetaMask, Coinbase, WalletConnect) via Privy |
| Chain config | `packages/contracts/src/addresses.ts` (source of truth), `NEXT_PUBLIC_CHAIN_ID` (84532 locally) |
| Contracts | `ForjEscrow` (v2, live), `ForjEscrowV3` (milestone partial release, **not deployed**), `WorkChainEscrow` (v1 legacy) |
| ABI | Hand-maintained `forj-escrow-abi.ts` / `abi.ts` |
| Event indexing | **None.** DB is updated only when the client posts a tx hash for verification |
| Files | UploadThing public URLs (`*.ufs.sh`), Pinata allowed but unconfigured |
| Email | Resend + React Email, optional Inngest retry |
| Admin | `ADMIN_USER_IDS` env allowlist, optional `ADMIN_HOSTNAME` host gate |
| Monitoring | **None** (Sentry DSN empty, SDK not installed; server errors are only logged in development) |
| Tests | Hardhat contract tests; (new) Vitest API security tests. No E2E, no frontend tests |

### On-chain vs off-chain

| Feature | Where | Notes |
|---|---|---|
| Escrow deposit, release, refund, dispute payout | ON-CHAIN | ForjEscrow |
| Submit work, request revision, raise dispute | **OFF-CHAIN only** (see C-1) | contract has the functions; the app never calls them |
| Milestones | OFF-CHAIN | JSONB on `contracts`; one escrow, single release |
| Jobs, proposals, services, messages, files, reviews | OFF-CHAIN | Postgres / UploadThing |
| WorkScore, badges, totals | OFF-CHAIN | DB columns; proof page links to the on-chain release tx (HYBRID) |
| Identity | OFF-CHAIN (Privy) | wallet address synced from Privy |

Trust boundaries: browser ↔ API (everything client-sent is untrusted), API ↔ chain (receipts
verified), API ↔ Privy (tokens verified; webhooks now signed), admin ↔ API (env allowlist, single
factor), Safe owners ↔ escrow (all fund-moving admin power). Single points of failure: Neon, Privy,
Vercel, one RPC endpoint per chain, Pimlico paymaster for smart-wallet users. **The product is not
decentralised**: the Forj backend decides what users see, and the contract owner arbitrates disputes.

---

## 2. Production status (live checks, 2026-09-24) [verified]

- All public pages return 200; no console errors or failed API calls during a headless crawl of 11 routes.
- Security headers present: HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy. **No CSP.**
- `/api/inngest` → 401 unsigned (good). `/admin` → 200 on the public host (`ADMIN_HOSTNAME` unset).
- SEO bugs (fixed locally): doubled title `Forj — … | Forj`; sitemap and robots URLs contain `//`
  (trailing slash in `NEXT_PUBLIC_APP_URL`); no OG/Twitter image; `/jobs` had the homepage title.
- Soft 404s: `/u/<unknown>` and `/proof/<unknown uuid>` return 200.
- Old brand visible in production: Terms page names the contract `WorkChainEscrow`; all transactional
  emails say "WorkChain".
- Responsive bugs: `/jobs` overflows horizontally by 85–195 px at 320–430 px; navbar overflows by
  70 px at 768 px; `/login` and `/dashboard` (signed-out) overflow by up to 240 px on mobile.
- Local environment: `node_modules` symlinks still pointed at the pre-rename `C:\Personal Project\workchain`
  directory, so every tool (Hardhat, tsc, turbo) was broken until a clean reinstall.

## 3. Testnet status [verified on-chain]

- ForjEscrow v2: owner and feeRecipient are the Safe `0x2332…d5e6` (ownership handoff completed). Fees 5% / 2%, 7-day window, not paused.
  `nextEscrowId = 3`: escrow #1 released, #2 still Funded (holds 5.25 USDC).
- Legacy v1: owner is still an EOA, holds 0 USDC, not paused.
- `addresses.ts` comment still lists the old EOA as `initialOwner`; the live owner is the Safe.

---

## 4. Environment audit

Values were never printed. "Local" = presence in the root `.env`. Preview and Production state could
not be read without Vercel access and is marked `?`.

| Variable | Required | Local | Preview | Prod | Public? | Sensitive | Used by |
|---|---|---|---|---|---|---|---|
| NEXT_PUBLIC_APP_URL | yes | set (localhost) | ? | set (has trailing `/`) | yes | no | metadata, sitemap, emails |
| NEXT_PUBLIC_APP_NAME | no | set (**"WorkChain"**) | ? | ? | yes | no | env schema only |
| NEXT_PUBLIC_CHAIN_ID | **yes** | 84532 | ? | ? | yes | no | Privy default chain, **server chain pin (new)** |
| NEXT_PUBLIC_BASE(_SEPOLIA)_RPC_URL | recommended | set | ? | ? | yes (keyed RPC URLs leak the key) | low | wagmi, Hardhat |
| BASE_RPC_URL / BASE_SEPOLIA_RPC_URL | recommended | unset | ? | ? | no | medium | server receipt verification (falls back to public RPC) |
| NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS | no | set | ? | ? | yes | no | **validated but unused**. `addresses.ts` is the real source |
| NEXT_PUBLIC_USDC_ADDRESS | no | set | ? | ? | yes | no | **validated but unused** |
| NEXT_PUBLIC_MULTISIG_ADDRESS | no | set | ? | ? | yes | no | scripts, landing spec sheet |
| NEXT_PUBLIC_USE_SMART_WALLETS | no | true | ? | ? | yes | no | fund/release routing |
| NEXT_PUBLIC_PRIVY_APP_ID | yes | set | ? | set | yes | no | client + server |
| PRIVY_APP_SECRET | yes | set | ? | ? | no | **high** | server only (`server-only` guarded) |
| PRIVY_WEBHOOK_SECRET | **new** | unset | — | — | no | high | webhook signature; route fails closed without it |
| DATABASE_URL / _UNPOOLED | yes | set | ? | set | no | **high** | db client, migrations |
| RESEND_API_KEY / RESEND_FROM_EMAIL | for email | set | ? | ? | no / no | high / no | email |
| UPLOADTHING_TOKEN | for uploads | set | ? | ? | no | high | uploads |
| UPSTASH_REDIS_REST_URL / TOKEN | **yes for prod** | set | ? | ? | no | high | rate limits (fail **open** if unset) |
| INNGEST_EVENT_KEY / SIGNING_KEY | optional | unset | ? | set (401 seen) | no | high | email queue |
| NEXT_PUBLIC_SENTRY_DSN / SENTRY_AUTH_TOKEN | should be | unset | ? | ? | DSN yes | token high | **nothing wired** |
| ADMIN_USER_IDS | for admin | set | ? | ? | no | medium | adminProcedure |
| ADMIN_HOSTNAME | prod recommended | unset | unset | **unset** | no | low | middleware |
| DEPLOYER_PRIVATE_KEY | scripts only | **set in the shared root `.env`** | must be unset | must be unset | no | **critical** | Hardhat |
| PLATFORM_FEE_RECIPIENT, BASESCAN_API_KEY | scripts | set | — | — | no | low / medium | deploy/verify |
| NEXT_PUBLIC_MOONPAY_API_KEY / ENV | optional | set | ? | ? | yes (publishable) | low | on-ramp; **not in `.env.example`** (lists Transak instead) |
| SKIP_ENV_VALIDATION | dev only | set | must be unset | must be unset | no | — | env schema |

Findings:
- [verified] No secret is referenced from a client component or exposed through a `NEXT_PUBLIC_` name. `lib/privy/server.ts` is `server-only`. `.env` has never been committed (git history scan).
- [verified] `DEPLOYER_PRIVATE_KEY` sits in the same root `.env` that `next dev` loads. It is not exposed to the client, but any server-side dependency can read it in dev. [recommendation] Move deployer keys to a separate `packages/contracts/.env.deploy` (gitignored) or a hardware wallet / Safe-proposed deploy.
- [verified] Server auth errors and tRPC errors are only logged when `NODE_ENV=development`. Production failures are invisible.

---

## 5–10. Security findings

Severity: **Critical** (funds/identity at risk or core trust claim false), **High**, **Medium**, **Low**.
Status: **FIXED** (in this working tree, uncommitted), **OPEN**.

### Critical

**C-1 The app never drives the on-chain state machine. OPEN [verified]**
`submitWork`, `requestRevision` and `raiseDispute` only update Postgres. The frontend only ever sends
`fund`, `release`, `claimAfterTimeout` and `resolveDispute` (`apps/web/hooks/use-escrow.ts`). The
on-chain escrow therefore stays `Funded` for the whole job:
- `claimAfterTimeout` requires `Submitted`, so **auto-release can never succeed**. The "7-day
  auto-release" promise doesn't hold.
- The client can call `refund()` directly (their wallet or Basescan) **at any time**, even after
  delivery or while the DB says "disputed". The DB never learns about it (no indexer).
- `resolveDispute` requires on-chain `Disputed`, so **every admin dispute resolution reverts**.
  The dispute feature is non-functional for funds.

**C-2 ForjEscrow v2 design lets the client always claw back. OPEN [tested: `KNOWN RISK` tests]**
- `refund()` is callable unilaterally by the client while `Funded` (the doc comment says "mutual").
- `requestRevision()` moves `Submitted → Funded`, so a client can accept delivery, request a revision and refund 100% in consecutive calls (atomically with a smart-wallet batch).
- Revisions are unlimited, so the auto-release clock can be reset forever.
- `deliveryDeadline` is stored but never enforced (no client remedy for non-delivery beyond the unilateral refund).
- A dispute has no timeout; funds are frozen until the owner acts.
- The owner may resolve a dispute by sending 100% to `feeRecipient` (which is the owner Safe itself).
- `fund()` has no max-fee parameter; a fee increase between approval and funding is charged to any client with a larger allowance.

**C-3 Unverified "fiat" payment path. FIXED [tested]**
`fundEscrow` and `approveWork` accepted `paymentMethod: 'fiat'` from the client with no payment and
no check against the stored contract. A client could mark a contract funded (freelancer told "escrow
funded, start working") and later completed, which incremented `totalEarned` / `totalJobsCompleted`
and produced a public "proof" page. Two accounts were enough to forge reputation.
Fix: both procedures reject anything but verified on-chain crypto, and require the stored
`paymentMethod` to be `crypto`.

**C-4 Unsigned Privy webhook. FIXED [verified code; route requires secret]**
`/api/webhooks/privy` accepted any POST and wrote `walletAddress`/`email` for the given `privyId`,
or inserted arbitrary users. With a leaked privyId (C-5) an attacker could redirect a user's emails,
squat wallet addresses, and flip a freelancer's payout wallet to the raw EOA.
Fix: Svix signature verification with `PRIVY_WEBHOOK_SECRET`, failing closed (503 without the secret,
401 on a bad signature). The webhook no longer writes wallet addresses; the canonical wallet is synced
only from a verified session.
**Action:** set `PRIVY_WEBHOOK_SECRET` in Vercel if the webhook is enabled in Privy.

**C-5 Anonymous PII leak on public job endpoints. FIXED [tested]**
`job.getBySlug` / `job.getById` (public) returned the poster's full `users` row: email, privyId,
wallet, notification preferences, `deletedAt`. Private service-order jobs (with buyer notes) were
readable by anyone with the slug.
Fix: projected public columns; private jobs return NOT_FOUND to everyone except the client and the
freelancer on the order. **Assume every job poster's email and privyId are already exposed.**

### High

| ID | Finding | Status |
|---|---|---|
| H-1 | Server accepted any supported `chainId` from the client. A mainnet deploy would accept Base Sepolia test-USDC funding as real. | FIXED: verifiers pin to `NEXT_PUBLIC_CHAIN_ID`, fail closed [tested] |
| H-2 | One funding tx could be linked to several contract rows (same parties and amount). | FIXED at app layer [tested]. [recommendation] add unique index on `(escrow_contract_address, on_chain_contract_id)` and on `escrow_tx_hash` via a migration |
| H-3 | Non-atomic `fund` / `approve` / `claim` transitions: concurrent calls could double-count `totalEarned`. | FIXED: conditional `UPDATE … WHERE status = …` [tested]. Counter bump is still a separate statement (not in one transaction) |
| H-4 | `contract.getById` and `proposal.getById` returned the counterparty's full row (email, privyId). | FIXED [tested] |
| H-5 | `pnpm deploy:base` deployed the **legacy v1** contract. | FIXED: scripts point at `deploy-forj.ts`; mainnet requires `ALLOW_MAINNET_DEPLOY=true`; v1 script refuses mainnet |
| H-6 | Stored `platformFee` / `freelancerAmount` used the legacy single 5% fee with float math; the chain charges 5% client + 2% freelancer. Payout figures, `totalEarned` and proof pages were wrong, and the site advertised "5% platform fee". | FIXED for new contracts (integer base-unit math, `lib/fees.ts`); landing/jobs copy corrected. Existing rows are unchanged |
| H-7 | Single admin can `relinkUser` any account to any Privy ID; the next login re-syncs the wallet, which redirects future payouts. | OPEN. Audited, but single-factor. [recommendation] two-person approval + delay |
| H-8 | No monitoring or alerting. | OPEN |

### Medium

| ID | Finding | Status |
|---|---|---|
| M-1 | Submission attachments accepted any URL (phishing links shown as "Attachment"). | FIXED: host allowlist [tested] |
| M-2 | Upload allowlist only accepted `utfs.io`, but UploadThing v7 returns `*.ufs.sh`, so job covers/attachments and next/image avatars were likely rejected. | FIXED [tested allowlist; production effect inferred] |
| M-3 | Deliverables are public UploadThing URLs with no auth or expiry. | OPEN. [recommendation] private ACL + signed URLs issued by an authorised tRPC call |
| M-4 | Milestone notifications reused `contract_funded` / `contract_submitted`, emailing a false "Escrow funded" on every milestone approval. | FIXED (in-app `system` type) |
| M-5 | Rate limiting fails open without Upstash; production config unverified. | OPEN |
| M-6 | No CSP. | OPEN |
| M-7 | Admin UI served on the public host. | OPEN: set `ADMIN_HOSTNAME` |
| M-8 | No committed DB migrations (`db:push`). | OPEN |
| M-9 | Service purchase creates job, proposal and contract in three non-transactional inserts. | OPEN |
| M-10 | Marketing claims not backed by the product: "milestones that enforce themselves", "auto-release if client goes silent", "0 middlemen", "dispute resolution with on-chain evidence", "pay by card". | FIXED on new landing / jobs header. `/how-it-works` and `/about` not yet reviewed |
| M-11 | `approveMilestoneOffchain` allowed on cancelled/completed contracts. | FIXED |

### Low

- Global unlayered `:root *` transition overrode every Tailwind `transition-*` utility and animated colours on every element. FIXED (only during theme switch).
- No `prefers-reduced-motion` support anywhere. FIXED (CSS + `MotionConfig reducedMotion="user"`).
- Legacy v1 escrow still owned by an EOA and unpaused. [recommendation] pause it.
- `ForjEscrowV3.partialRelease` slices the client fee as `milestone * clientFee / amount` after `clientFee` has already been reduced, so later slices are under-charged and the remainder shifts to the last release or refund. Fix before any V3 deploy.
- Contract test TypeScript is never type-checked (hardhat-viem typings not included; 440 errors across both test files). `@forj/api` and `@forj/db` `lint` scripts fail (`eslint` not installed).
- Four font families + a render-blocking Fontshare stylesheet.
- Soft 404s on unknown profiles/proofs.

### Wallet (Phase 4) [verified code]
- The wallet address is never taken from the client. The server uses the Privy-verified user's canonical wallet (smart wallet → embedded → external), and funding verification compares event parties against DB wallets. Users cannot substitute another user's address.
- Authentication is Privy JWT verification (no SIWE nonce of our own; replay protection is Privy's token expiry).
- Wrong network: the frontend reads the escrow address for `useChainId()`; the server now rejects non-configured chains.
- [inferred] Account switching in an external wallet does not change the DB wallet. Actions sign from the connected account, and verification fails if it differs from the DB wallet (safe failure, poor UX).

### API matrix (Phase 8) [verified code, key paths tested]
Every mutation is `protectedProcedure` with an ownership check against `ctx.user.id`. Messages check
conversation membership; notifications scope by `userId`; reviews require a completed contract and
party membership; admin routes use the env allowlist. Remaining gaps: C-1/C-2, M-3, M-5, M-9, and
`job.incrementView` is an unauthenticated, unthrottled write.

### Database (Phase 9)
Postgres is reached only through the server (no Supabase, so no RLS surface). FKs use `restrict`;
unique constraints on `privyId`, `walletAddress`, `username`, slugs, `(jobId, freelancerId)`
proposals, `(contractId, reviewerId)` reviews. Missing: uniqueness for escrow linkage (H-2), and
DB-level CHECK constraints on status transitions and amounts.

### Admin / keys (Phase 11)
| Power | Who | Mechanism |
|---|---|---|
| Resolve disputes, pause, fees, fee recipient, window, rescue non-USDC | ForjEscrow owner (Safe) | on-chain `onlyOwner` |
| List disputes, record resolutions, relink / restore users, articles | `ADMIN_USER_IDS` | env allowlist + Privy session |
| Deploy | `DEPLOYER_PRIVATE_KEY` | local `.env` |

[recommendation] Keep the Safe as owner with ≥2-of-3 signers on separate devices. Split roles in the
next contract: an **arbiter** (dispute only, bounded split with no 100%-to-fee), a **pauser**
(fast, low power) and an **admin** behind a 48-hour timelock (fees, recipient, window). No
upgradeability needed; redeploy and migrate instead.

---

## 6. Escrow state machine

On-chain (ForjEscrow v2), verified by the 48-case transition matrix in `test/ForjEscrow.test.ts`:

| From \ action | submitWork (F) | requestRevision (C) | release (C) | claimAfterTimeout (any, after window) | refund (C or F) | raiseDispute (C or F) | resolveDispute (owner) |
|---|---|---|---|---|---|---|---|
| Funded | → Submitted | ✗ | → Released 💸 | ✗ | → Refunded 💸 | → Disputed | ✗ |
| Submitted | ✗ | → Funded | → Released 💸 | → Released 💸 | ✗ | → Disputed | ✗ |
| Disputed | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | → Resolved 💸 |
| Released / Refunded / Resolved | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

No transition can happen twice; terminal states zero the escrow's balance (solvency invariant
tested over a 120-step random walk). The unsafe edges are `Funded → Refunded` by the client alone
and `Submitted → Funded → Refunded` (C-2).

Off-chain (`contracts.status`): `created → in_progress → submitted ⇄ revision_requested → completed`,
plus `created → cancelled` and `in_progress|submitted|revision_requested → disputed`. Only
`in_progress` and `completed` are backed by verified chain events; the rest are DB-only (C-1).
`EXPIRED` does not exist in either machine.

## 7. Payment / USDC
[verified] Canonical Circle USDC per network, hard-coded 6 decimals server-side, `parseUnits` for
all conversions, exact-amount approvals on the EOA path (smart-wallet path batches approve + fund).
Fee math on-chain rounds down in the freelancer's favour; dust amounts pay no fee. Fixed: float fee
math off-chain (H-6). Fee-on-transfer tokens would break solvency (tested), which is why the USDC
pin must stay. A USDC-blocklisted freelancer blocks `release`; recovery is dispute → owner split
(tested).

---

## 11. WorkChain → Forj migration

| Location | Status |
|---|---|
| Emails (sender name, welcome, footer, dispute copy, generic sender) | FIXED |
| Email fallback URLs `workchain.io` (a domain Forj may not control) | FIXED: fall back to the Forj deployment |
| Terms page `WorkChainEscrow` (also factually wrong) | FIXED → `ForjEscrow` |
| Error strings (`getAddresses`, escrow service) | FIXED |
| `.env.example` app name, from-address, filter names | FIXED |
| Rate-limit Redis prefix | FIXED (`forj:`; resets counters once) |
| Tailwind token type names | FIXED |
| localStorage `workchain:theme`, `workchain:profile-nudge-dismissed` | Kept as **legacy read fallbacks** (new keys are `forj:`) |
| Local `.env` `NEXT_PUBLIC_APP_NAME=WorkChain` | OPEN: edit your local and Vercel values |
| `WorkChainEscrow.sol`, `workChainEscrowAbi`, `WorkChainEscrow.test.ts`, `deploy.ts` | **Kept deliberately**: immutable deployed v1 contract (0x079f…4cf8b); renaming would break artifact/verification linkage |
| Code comments and docs (`docs/design/*`, `SETUP.md`, `PIMLICO-SETUP.md`, `escrow-audit.md`) | OPEN: historical, not user-facing |

No user-facing surface in production should show "WorkChain" once this tree is deployed. The
remaining hits are comments, historical docs and the legacy contract.

## 12–13. UX / design and responsive

Problems observed: a generic "Web3 dark" hero (purple→blue gradient headline, glow blobs, card
grids), sections hidden until scrolled into view (`whileInView` from opacity 0), marketing claims
the product doesn't back, the fee shown as 5%, and the responsive bugs listed in §2.

Implemented: a new landing page (hero with an animated escrow **ledger** showing a real 1,000 USDC
contract computed from the live fee constants, then numbered editorial sections for the trust gap,
the client and freelancer workflows, a "what's on-chain and what isn't" spec sheet linked to the real
contract addresses, a reputation/proof record, and a final CTA with a testnet disclosure). No
gradients, no glow, rules instead of cards, a mono technical-label layer, and CSS-only motion that
respects reduced motion. The navbar now collapses below `lg`, and the jobs filter collapses behind a
toggle on mobile.

Not yet done (Phase 16): the dashboard, contract detail, proposals, profile and settings still use
the old card-everything style. The contract detail page (1,400 lines) should become a split layout:
a sticky action/escrow panel plus a vertical timeline that matches the landing ledger.

## 14. Performance
- [verified] No 3D libraries. framer-motion ships on the marketing pages. The new landing sections are server components with zero client JS of their own.
- [verified] The always-on global transition rule was removed.
- [recommendation] Drop Geist + Geist Mono (they only serve as fallbacks), self-host General Sans instead of the render-blocking Fontshare CSS.
- [verified] Home page JS (uncompressed, all scripts incl. deferred Privy): 4.34 MB in production → 2.40 MB in the local build. `/login`, `/dashboard/*`, `/jobs` still load ~0.94–1.05 MB of first-load JS (Privy + wagmi). [recommendation] Load wallet providers only on routes that need them.
- [inferred] Every server escrow verification creates a new viem client with a fallback public RPC. Set `BASE_*_RPC_URL` to a keyed provider for reliability.

---

## 15. Mainnet blockers

1. C-2: a new escrow version (see §16) plus an external audit.
2. C-1: the app must drive `submitWork` / `requestRevision` / `raiseDispute` on-chain, **and** an event indexer/reconciler must sync chain → DB.
3. H-7 / admin architecture: role split + timelock; the arbiter cannot pay the fee recipient 100%.
4. H-8 monitoring, M-5 rate limits confirmed, M-6 CSP, M-8 migrations.
5. Legal: terms that match the real dispute process, risk disclosure, security contact.

## 16. Recommended fixes (ordered)

1. **Deploy this tree to Preview**, set `PRIVY_WEBHOOK_SECRET`, run the manual smoke test (fund → release on Sepolia, file upload, job post with cover).
2. Escrow v3/v4 design: refund only by freelancer consent, or by the client after `deliveryDeadline` with no submission; `requestRevision` capped (e.g. 2) and keeps the escrow non-refundable; dispute timeout that defaults to a documented split; arbiter split bounded to client/freelancer with the fee capped at the agreed fee; `fund(maxClientFeeBps)`; emit an off-chain reference (`bytes32 contractRef`) in `EscrowFunded` so each escrow maps to exactly one DB row; fix the V3 fee-slice drift.
3. Wire the lifecycle calls into the frontend (smart-wallet sponsored) and add a reconciler cron (Inngest) that reads `getEscrow` for open contracts.
4. Migration adding unique indexes (H-2) and CHECK constraints.
5. Private file storage with signed URLs.
6. Sentry (server + client), structured production logging, alerting on verification failures.
7. CSP (report-only first), `ADMIN_HOSTNAME`, Upstash confirmed in prod, rate-limit `incrementView`.
8. Finish the Phase 16 product UI pass and review `/how-it-works` and `/about` copy.

## 17. Changes implemented in this audit (uncommitted)

API: chain pinning, fiat path removal, replay guard, atomic transitions, PII projections
(contract/proposal/job), private-job visibility, attachment allowlist, `*.ufs.sh` hosts, milestone
notification types, milestone state check, exact fee split, rate-limit prefix, deduped allowlist.
Web: signed Privy webhook, landing redesign, navbar breakpoint and links, jobs mobile filters and
title, auth-layout overflow, SEO (`SITE_URL`, title, canonical, sitemap `/jobs` + `/services`, robots
host, OG/Twitter image), reduced motion, theme transition scoping, brand strings, image hosts.
Contracts: `deploy:*` scripts → ForjEscrow with a mainnet guard; the legacy deploy refuses mainnet;
hostile token mocks; `ForjEscrow.test.ts`. Tooling: Vitest + `security.test.ts` in `@forj/api`.

## 18. Tests before / after

| Check | Before | After |
|---|---|---|
| Contract tests | 31 passing (legacy v1 only; **0 tests for the deployed ForjEscrow**) | 109 passing (78 ForjEscrow: lifecycle, 48-case transition matrix, access control, re-entrancy, blocklist, fee-on-transfer, solvency random walk, 8 `KNOWN RISK`) |
| API tests | none | 20 passing; 11 of them fail against the pre-audit code (mutation-checked) |
| Slither 0.11.6 | not run | 9 findings, all low `timestamp`; no medium/high |
| Typecheck (5 packages) | pass | pass |
| Lint (web) | warnings only | warnings only; `@forj/api` and `@forj/db` lint scripts broken (no eslint) |
| Production build (`next build` with env) | not run | passes: 42 routes. Without env vars, page-data collection fails on `DATABASE_URL` (expected; Vercel injects it) |
| E2E / wallet flows | none | none. Wallet flows were **not** exercised (no funded browser wallet in this environment) |
| Responsive crawl (9 widths × 11 routes, headless Chromium) | 4 routes overflow horizontally (`/`, `/jobs`, `/login`, `/dashboard`) | 0 overflow on all routes and widths; 0 console errors. Small (<32 px) touch targets remain (5–22 per page, mostly footer/nav links) |

## 19. Remaining risks
Everything marked OPEN above, plus: DB ↔ chain drift with no reconciler; dependence on Privy for
identity and on one Safe for all fund-moving admin power; public deliverable URLs; PII already
exposed by C-5 before the fix; unreviewed pages (`/how-it-works`, `/about`, dashboard).

## 20. Classification

| Stage | Verdict |
|---|---|
| Continue closed testnet testing (test USDC) | **Yes**, after deploying this tree |
| Public testnet | **Needs fixes first**: C-1 must be fixed or disclosed prominently, and `PRIVY_WEBHOOK_SECRET`, Upstash and monitoring must be configured |
| Mainnet | **Blocked**: new escrow version, lifecycle wiring + indexer, admin role split, and a professional audit are required |

### Mainnet readiness checklist

| Category | Item | Status |
|---|---|---|
| Contract | External audit | BLOCKER |
| Contract | Escrow design (C-2) | BLOCKER |
| Contract | App drives on-chain lifecycle (C-1) | BLOCKER |
| Contract | Deployment script + mainnet guard | PASS |
| Contract | Source verification on Basescan | NEEDS WORK (script exists, mainnet untested) |
| Contract | Owner = multisig | PASS (Sepolia Safe) |
| Contract | Timelock / role separation | BLOCKER |
| Contract | Pause (funding only) | PASS |
| Contract | Upgradeability | N/A (immutable; migrate by redeploy) |
| Contract | Token addresses / chain IDs | PASS (canonical USDC; server now pinned) |
| Application | Auth (Privy JWT) | PASS |
| Application | Authorization / IDOR | PASS for tested paths; NEEDS WORK for coverage |
| Application | Webhook authenticity | PASS once the secret is set |
| Application | Rate limiting | NEEDS WORK (fail-open, prod unverified) |
| Application | File security | NEEDS WORK (public deliverables) |
| Application | CSP | NEEDS WORK |
| Application | Monitoring | BLOCKER |
| Infra | Vercel config | PASS |
| Infra | DB migrations / backups | NEEDS WORK (no migration history; Neon PITR unverified) |
| Infra | Dedicated RPC | NEEDS WORK |
| Infra | Error monitoring / alerts | BLOCKER |
| Product | Tx pending / failed / rejected states | PASS (toasts, humanised wallet errors) |
| Product | Wrong network | NEEDS WORK (server rejects; UI prompt minimal) |
| Product | Insufficient balance | PASS (pre-flight simulation) |
| Product | Stuck tx / on-chain-but-not-linked | NEEDS WORK (manual support path only) |
| Product | Dispute | BLOCKER (non-functional on-chain) |
| Product | Timeout / auto-release | BLOCKER (unreachable) |
| Legal | Terms / privacy | NEEDS WORK (terms describe mechanisms that don't work yet) |
| Legal | Risk disclosure | NEEDS WORK (testnet notice added on landing only) |
| Legal | Security contact / responsible disclosure | BLOCKER (none; add `/.well-known/security.txt`) |
| Legal | Support | NEEDS WORK (contact page only) |
