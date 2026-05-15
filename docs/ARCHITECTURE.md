# Forj — Architecture

> System overview, data flow, scaling notes. Read this before building
> a feature so your code lands in the right layer.

---

## 1. Layers, top-down

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js client)                      │
│  • React 19 + Turbopack                                              │
│  • Privy SDK (auth + embedded wallet + smart wallet)                 │
│  • Wagmi (chain reads/writes via Privy connector)                    │
│  • tRPC client (typed API calls, react-query cache)                  │
│  • UploadThing client (eager file uploads)                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  HTTPS / WebSocket (Privy)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                Next.js server (route handlers + RSC)                 │
│  • /api/trpc/[trpc]    — tRPC route handler                          │
│  • /api/uploadthing    — UploadThing webhooks + auth callbacks       │
│  • /api/webhooks/privy — Privy user lifecycle hooks                  │
│  • RSC pages           — server-rendered marketing + dashboard shell │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   Neon Postgres     │  │  Base Sepolia    │  │  Third-party services│
│   (Drizzle ORM)     │  │  (Viem +         │  │   • Pimlico (bundler │
│                     │  │   ForjEscrow)    │  │     + paymaster)     │
│   users / jobs /    │  │                  │  │   • UploadThing      │
│   proposals /       │  │   USDC + escrow  │  │   • Resend           │
│   contracts / ...   │  │   logic on-chain │  │   • Privy            │
└─────────────────────┘  └──────────────────┘  └──────────────────────┘
```

**Source of truth split**:
- **Postgres** owns identity, content (job/proposal/contract metadata,
  messages, reviews, notifications), and indices for fast queries.
- **Base** owns money. Every escrow row in DB has a corresponding
  `escrows[escrowId]` entry on-chain, and the DB row is reconciled to
  the chain on every state-changing tRPC call.

Treat the chain as the source of truth for money, and the DB as a
denormalised cache that can always be re-derived.

---

## 2. Monorepo packages

Each package has a focused responsibility and exposes a stable barrel.

### `apps/web` — Next.js frontend
The only consumer of every other package. Everything UI lives here.

### `packages/api` — tRPC v11 routers
Pure business logic. Reads/writes Postgres via Drizzle, calls chain via
the escrow service, dispatches emails via the email package. No knowledge
of HTTP transport — that's wired in `apps/web/app/api/trpc/[trpc]/route.ts`.

Mounted routers (see `packages/api/src/root.ts`):

| Router | Surface |
|---|---|
| `user` | Profile CRUD, onboarding, `me` query |
| `job` | Job CRUD, search, list |
| `proposal` | Proposal create + accept (creates contract) |
| `contract` | Fund / submit / approve / dispute / release / milestones |
| `message` | Threaded messages between client + freelancer |
| `review` | Two-sided review on completed contracts |
| `notification` | In-app notification inbox + unread count |
| `service` | Productised gig CRUD + buy-now flow |
| `savedJob` | Bookmark toggle, list, count |
| `search` | Global cross-entity search (cmd-k palette) |
| `admin` | Arbiter dispute resolution (gated on `ADMIN_USER_IDS`) |

### `packages/db` — Drizzle schema + client
Schema files in `src/schema/*` are the **single source of truth** for the
database shape. Run `pnpm --filter @forj/db push` to apply to Neon.

### `packages/contracts` — Solidity
`ForjEscrow.sol` (v2 — current) + `WorkChainEscrow.sol` (v1 — frozen
legacy). The ABI is hand-curated in `src/forj-escrow-abi.ts` and exported
from the barrel — the frontend never imports Hardhat artifacts.

### `packages/email` — React Email
Template components rendered to HTML at dispatch time. The API package
imports a dispatch helper (`sendNotification`) — never imports React.

### `packages/config/{eslint,tailwind,typescript}` — shared configs
Tailwind config contains the Bauhaus token CSS (`theme.css`). Tsconfig
exports three presets (`base.json`, `nextjs.json`, `library.json`).

---

## 3. Auth + identity

```
Sign in (email/google/wallet) → Privy issues session
                                ↓
                         Cookie: privy-token
                                ↓
       tRPC server: getUserFromToken() reads cookie + verifies
                                ↓
        Resolves to Postgres `users` row (auto-provisions if missing)
                                ↓
            ctx.user is the Forj DB row for downstream procedures
```

`getUserFromToken` (`apps/web/lib/privy/server.ts`) is the auth boundary.
Three responsibilities:

1. **Verify** the Privy token cryptographically.
2. **Resolve** the canonical wallet — prefers smart wallet over embedded
   EOA over linked external wallet (see `pickCanonicalWallet`).
3. **Auto-heal** any drift between Privy and our DB — e.g. if a user
   signed up before smart wallets were enabled, we migrate their
   `users.walletAddress` to the smart wallet on next login.

Soft-deleted users (tombstoned `deletedAt`) get bounced even with a
valid token. Their DB row sticks around for FK integrity.

---

## 4. Smart wallet flow (sponsored gas)

The "no MetaMask, no gas" experience needs three pieces to be set up:

1. **Privy dashboard** has smart wallets enabled and Pimlico's bundler +
   paymaster URLs registered (see `docs/PIMLICO-SETUP.md`).
2. **Pimlico sponsorship policy** has the escrow + USDC contracts on the
   allowed-contracts whitelist.
3. **`.env`** has `NEXT_PUBLIC_USE_SMART_WALLETS=true` — the app reads
   this flag to pick between `useFundEscrow` (EOA) and
   `useFundEscrowSmart` (sponsored UserOperation).

At runtime, `useFundEscrowSmart`:

```
parseUnits(amountUsd) + clientFee
       ↓
client.sendTransaction({
  calls: [
    approve(USDC, escrow, totalDeposit),
    fund(freelancer, amount, deadline)
  ]
})
       ↓
Privy → Pimlico bundler → EntryPoint → ForjEscrow on-chain
       ↓
EscrowFunded event decoded → tRPC contract.fund mutation
       ↓
DB row flipped to status='funded', stores txHash + onChainContractId
```

The batched call means the user sees **one** Privy confirm popup. The
paymaster covers all gas.

---

## 5. Escrow lifecycle

```
                     ┌──────────────┐
                     │   Created    │ ← off-chain only (proposal accepted)
                     └──────┬───────┘
                            │ client.fund()
                            ▼
                     ┌──────────────┐
                     │    Funded    │ ← on-chain. USDC locked.
                     └──────┬───────┘
                            │ freelancer.submitWork()
                            ▼
                     ┌──────────────┐
       ┌─────────────│   Submitted  │
       │             └──────┬───────┘
       │                    │
       │ client.requestRevision           client.release()    7d auto-release
       │ → back to Funded                      or                      ▼
       │                                  anyone.claimAfterTimeout()
       │                                         ↓
       │                              ┌──────────────────┐
       │                              │     Released     │  terminal
       │                              └──────────────────┘
       │
       │ either.raiseDispute()
       ▼
┌──────────────┐
│   Disputed   │ ─→ owner.resolveDispute(toFreelancer, toClient, toFee)
└──────────────┘                          ↓
                                   ┌──────────────┐
                                   │   Resolved   │ terminal
                                   └──────────────┘
```

Plus `refund()` from Funded → Refunded (mutual cancel before submission).

Each transition has an off-chain mutation that:
1. Validates the transition is allowed
2. Calls the chain (for state-moving ops)
3. Verifies the receipt + event payload
4. Updates the DB row only after the chain confirms

The escrow service (`packages/api/src/services/escrow.ts`) is the only
place that talks to the chain. tRPC procedures call it; no business
logic in there.

---

## 6. Milestones (Phase 7A — off-chain)

Each contract can have N milestones (`contracts.milestones` JSONB).
Per-milestone status flips (`pending` → `in_progress` → `submitted` →
`approved`) are **off-chain only**. The on-chain escrow still holds and
releases the full amount in one shot.

Why off-chain first: keeps the gas surface flat (1 fund, 1 release per
contract regardless of milestone count) and lets us iterate the UX
without redeploying.

Phase 7B (future) will add per-milestone on-chain release — same UI,
swap the mutation target.

---

## 7. Reputation

`users.workScore` is a denormalised aggregate kept in sync via the
`updateWorkScore` helper invoked after each contract release / review.
Formula lives in `packages/api/src/services/reputation.ts`.

The actual on-chain reputation contract (`NEXT_PUBLIC_REPUTATION_CONTRACT_ADDRESS`)
is reserved for a Phase 8 launch where reputation events become
permissionless SBT-style attestations. Currently unwired.

---

## 8. Data flow examples

### Posting a job

```
1. Client opens /jobs/post (or /dashboard/jobs/new)
2. Optional: uploads cover image → UploadThing → URL returned
3. Submits form → tRPC `job.create` mutation
4. Server validates input (Zod), inserts row, returns id
5. Client redirected to /dashboard/jobs/[id] (proposal manager view)
```

### Submitting a proposal with milestones

```
1. Freelancer opens /jobs/[slug], clicks Apply
2. Modal: bid amount, cover letter, optional milestone breakdown
3. tRPC `proposal.create` validates milestone sum equals bid, persists JSONB
4. Notification fired to job's clientId
```

### Accepting a proposal → creating a contract

```
1. Client clicks Accept on a pending proposal
2. tRPC `proposal.accept`:
   a. CAS update on jobs.status (created → contracted)
   b. Insert contracts row (copies milestones, computes platformFee)
   c. Mark other proposals on this job as rejected
   d. Notify accepted freelancer + rejected ones
3. Client redirects to /dashboard/contracts/[id], primed to fund
```

### Funding an escrow (smart wallet path)

```
1. Client clicks "Fund USDC escrow"
2. useFundEscrowSmart:
   a. Compute clientFee, depositTotal
   b. Build batched UserOp [approve, fund]
   c. client.sendTransaction → Privy modal → Pimlico bundler
3. Wait for receipt, decode EscrowFunded → onChainContractId
4. tRPC `contract.fund({ txHash, onChainContractId, chainId })`:
   a. Verify on-chain (escrow service): same parties, same amount, same chain
   b. Flip DB status to 'funded', store txHash + onChainContractId + escrowContractAddress
5. UI refreshes contract row → status badge updates
```

---

## 9. State that lives where

| Concern | Source of truth | Cached / mirrored to |
|---|---|---|
| User identity | Privy | `users` table (auto-provisioned on first call) |
| Wallet address | Privy (canonical wallet pick) | `users.walletAddress` |
| Job posting | Postgres `jobs` | Search index (built on `jobs.title + description`) |
| Proposal | Postgres `proposals` | — |
| Contract state | Postgres `contracts.status` + Base `escrows[id].status` | Reconciled on each tRPC mutation |
| USDC balance | On-chain (ERC-20 `balanceOf`) | Wagmi react-query cache |
| Saved jobs | Postgres `saved_jobs` | — |
| Reputation score | Postgres `users.workScore` | Recomputed after each release/review |
| Reviews | Postgres `reviews` | Shown on profile + proof page |
| Files (avatars, covers, attachments) | UploadThing | URLs stored in DB columns |
| Notifications | Postgres `notifications` | Unread count polled every 30s |

---

## 10. Scaling notes (when these limits hit)

### Postgres (Neon)

- **Single-region** today. If users complain about latency, Neon supports
  read replicas — wire a separate `READ_DATABASE_URL` and route read
  queries via a separate Drizzle client.
- **Connection pool**: serverless connections through `@neondatabase/serverless`
  use HTTP, no PgBouncer needed. Don't migrate to long-lived TCP without
  considering Vercel's per-function connection limits.

### Search

- ILIKE-based search in `search.global` is fine to ~10k rows per table.
- Migration path: `pg_trgm` GIN indexes (`CREATE INDEX … USING gin (title gin_trgm_ops)`)
  buys another order of magnitude. Swap the predicate to
  `title % :q` (similarity operator) and ORDER BY `similarity(title, :q) DESC`.
- After that: dedicated search index (Typesense / Meilisearch).

### Smart contract

- ForjEscrow v2 is single-chain. To support multiple chains, deploy per chain
  and route via `getAddresses(chainId)`.
- Storage is unbounded — every funded escrow stays in `mapping(uint256 => Escrow)`.
  A future pruning step could move terminal-state escrows to events-only
  (deleting the storage slot for a gas refund).

### Sponsored gas (Pimlico)

- Per-user spend cap stops abuse but also caps legitimate power users.
  When this becomes a real complaint, add a paid tier where Pro members
  get a higher cap.
- Mainnet paymaster needs ~$20 ETH per ~6000 user-ops. Top-up alerts
  should trigger via Pimlico webhooks (`policy_spending_threshold`).

### Frontend

- Bundle size: marketing pages + dashboard share a single chunk.
  When the dashboard grows past ~500 KB, split by route via
  `next/dynamic` for heavy modals (e.g. proposal form, milestone tracker).
- Image hosting: UploadThing is fine to ~10 GB. Past that, migrate to
  Cloudflare R2 with signed URLs.

---

## 11. Security model

- **Smart contract**: `nonReentrant` on every state-mutating function;
  `Ownable2Step` for arbiter (two-step transfer prevents accidental
  misconfig); `Pausable` killswitch on `fund()` only (never blocks
  withdrawals); `SafeERC20` for token transfers.
- **tRPC**: every mutation is `protectedProcedure` (auth-gated) except
  the truly public `job.list` / `service.list` / `search.global`.
  Role-specific procedures (`clientProcedure`, `freelancerProcedure`)
  gate ownership checks.
- **On-chain verification**: server pulls the tx receipt itself for any
  user-supplied txHash — never trusts the client's claim about what
  happened on-chain.
- **Rate limiting**: Upstash Redis on auth-sensitive mutations
  (proposal create, job create) — see `packages/api/src/middleware/rate-limit.ts`.
- **Soft-delete**: tombstoned `users.deletedAt` keeps FK integrity while
  ensuring deleted accounts can't log back in.
- **Headers**: HSTS, X-Frame-Options, Permissions-Policy set in
  `apps/web/next.config.ts`. No CSP yet — Privy + WalletConnect inject
  inline scripts that a strict CSP would block.

Open issues + audit notes: `docs/security/escrow-audit.md`.
