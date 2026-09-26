# Environment variables

Classes: **PUBLIC** (bundled into the browser, `NEXT_PUBLIC_*`), **SERVER** (server runtime only),
**SECRET** (server-only and sensitive), **DEPLOY** (scripts only; never on Vercel).

Missing critical configuration fails closed:
- no `NEXT_PUBLIC_CHAIN_ID` → production build throws; server escrow verification refuses;
- no `PRIVY_WEBHOOK_SECRET` → webhook returns 503;
- V3 not in `addresses.ts` for the chain → V3 procedures refuse.

There is no fallback between networks and no fake-payment mode.

| Variable | Class | Local | Base Sepolia (Preview / testnet prod) | Mainnet prod | Notes |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | PUBLIC | `84532` (dev default if unset) | `84532` **required** | `8453` **required** | single source for client + server chain |
| `NEXT_PUBLIC_APP_NAME` | PUBLIC | `Forj` | `Forj` | `Forj` | Local `.env` fixed; Vercel **NOT VERIFIED** |
| `NEXT_PUBLIC_APP_URL` | PUBLIC | `http://localhost:3000` | deployment URL | canonical domain | trailing slash tolerated |
| `NEXT_PUBLIC_PRIVY_APP_ID` | PUBLIC | set | set | separate prod app | |
| `NEXT_PUBLIC_USE_SMART_WALLETS` | PUBLIC | `true` | `true` | `true` | requires Pimlico policy incl. V3 address |
| `NEXT_PUBLIC_BASE_RPC_URL` / `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | PUBLIC | optional | optional | recommended | browser reads; a keyed URL here is public |
| `NEXT_PUBLIC_MULTISIG_ADDRESS` | PUBLIC | Safe | Safe | Safe | informational |
| `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`, `NEXT_PUBLIC_USDC_ADDRESS` | PUBLIC | – | – | – | **unused**: addresses come from `packages/contracts/src/addresses.ts` |
| `DATABASE_URL` | SECRET | Neon or local Postgres | Neon branch | Neon main | |
| `DATABASE_URL_UNPOOLED` | SECRET | optional | set | set | migrations |
| `DATABASE_DRIVER` | SERVER | `pg` for Docker (auto for localhost) | unset | unset | |
| `PRIVY_APP_SECRET` | SECRET | set | set | set | |
| `PRIVY_WEBHOOK_SECRET` | SECRET | optional | **required if webhook enabled** | **required** | fails closed |
| `BASE_SEPOLIA_RPC_URL` / `BASE_RPC_URL` | SECRET (keyed) | optional | **recommended** | **required** | server receipt checks + indexer; public RPC lags |
| `ESCROW_CONFIRMATIONS` | SERVER | 3 | 3 | ≥ 5 | indexer reorg margin |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | SECRET | optional | **required** | **required** | without them rate limiting is off (`ratelimit.disabled` logged) |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | SECRET | unset (`INNGEST_DEV=1`) | **required** | **required** | runs the escrow sync cron |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | SECRET / SERVER | optional | set | set | sender must be a verified domain |
| `UPLOADTHING_TOKEN` | SECRET | set | set | set | |
| `ADMIN_USER_IDS` | SERVER | your id | admin ids | admin ids | app admin (not contract roles) |
| `ADMIN_HOSTNAME` | SERVER | unset | unset | admin subdomain | |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | – | – | – | – | Sentry is **not installed** (see monitoring notes) |
| `DEPLOYER_PRIVATE_KEY` | DEPLOY | `packages/contracts/.env.deploy` | **never on Vercel** | **never on Vercel** | still in root `.env` locally: move it |
| `PLATFORM_FEE_RECIPIENT`, `BASESCAN_API_KEY` | DEPLOY | scripts | – | – | |
| `V3_OWNER`, `V3_ARBITER`, `V3_GUARDIAN`, `V3_FEE_RECIPIENT` | DEPLOY | – | deploy time | deploy time (Safe / timelock) | |
| `ALLOW_MAINNET_DEPLOY`, `FORJ_V3_AUDIT_REPORT` | DEPLOY | **never set** | – | only for the audited mainnet deploy | double mainnet guard |
| `ALLOW_DESTRUCTIVE_MIGRATION` | DEPLOY | – | per migration | per migration | exact tag |
| `E2E_DATABASE_URL`, `E2E_FUNDER_KEY` | DEPLOY (test) | local only | – | – | E2E suite |
| `SKIP_ENV_VALIDATION` | – | dev only | unset | unset | |

What was verified from this repository: no secret is referenced from client code or exposed under
`NEXT_PUBLIC_`; the app runtime holds no private key; secrets are redacted from structured logs.
Vercel's actual variable values: **NOT VERIFIED** (no access).
