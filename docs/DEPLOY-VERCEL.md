# Deploy to Vercel (demo / preview)

End-to-end recipe for getting Forj running on Vercel as a demo.
Production deploy targets a self-hosted VPS + self-hosted Postgres
later — covered in a separate guide. This one is the fast path:
push to GitHub, click around in Vercel dashboard, paste env vars,
done.

Estimated time: **15-25 minutes** if the third-party accounts
(Privy, Neon, Resend, UploadThing, Upstash, Inngest) are already set
up. Add ~30 minutes if you're creating them fresh.

---

## 0 · Prerequisites

Already done if you've been following the repo:

- [x] Code pushed to GitHub (push to `main`).
- [x] **Neon Postgres** with the schema migrated. Connection strings
  (pooled + unpooled) handy.
- [x] **Privy app** with `app_id` + `app_secret`.
- [x] Base Sepolia escrow contracts deployed + multisig handoff
  done. Contract addresses in `packages/contracts/src/addresses.ts`.
- [x] **Upstash Redis** (for rate limiting). Free tier is fine.
- [x] **Resend** account + a verified domain or use the sandbox
  `noreply@resend.dev` sender for demo.
- [x] **UploadThing** v7 app + token.
- [x] **Inngest** cloud app (production event + signing keys). Local
  dev uses `INNGEST_DEV=1` without an account, but Vercel won't.

---

## 1 · Vercel project setup

1. Go to <https://vercel.com/new> and "Import Git Repository".
2. Pick the GitHub repo for Forj.
3. **Root Directory** — change to `apps/web`. Click "Edit" next to
   the project name when prompted; Vercel detects the Next.js app
   one level deeper than the repo root.
4. Framework Preset → **Next.js** (auto-detected once Root Directory
   is set).
5. Build settings — leave as auto. `apps/web/vercel.json` overrides
   the build/install commands to use Turborepo from the workspace
   root:
   - Build: `cd ../.. && pnpm turbo run build --filter=@forj/web`
   - Install: `cd ../.. && pnpm install --frozen-lockfile`
   - Ignore: `cd ../.. && npx turbo-ignore @forj/web` (skips deploys
     when only unrelated packages changed)
6. **Don't deploy yet** — first paste env vars (next section).

---

## 2 · Environment variables

In the Vercel project settings → **Environment Variables**.

Mark each var as available in: **Production**, **Preview**,
**Development** (all three). Vercel mirrors the value to every
deploy unless you explicitly scope it.

Most variables come from the `.env` file you've been using locally.
A few have to change for production — flagged with **⚠️ change** below.

### Required (deploy will 500 without these)

| Var | Where it comes from | Notes |
|---|---|---|
| `DATABASE_URL` | Neon dashboard → Connection string → **Pooled** | Long form with `-pooler` suffix. |
| `DATABASE_URL_UNPOOLED` | Neon dashboard → Connection string → **Direct** | Used only for `db migrate` if run from CI. |
| `PRIVY_APP_SECRET` | Privy dashboard → Settings | Secret, never leak. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy dashboard | Public, exposed in bundle. |
| `NEXT_PUBLIC_APP_URL` | **⚠️ change** to `https://<your-project>.vercel.app` (or custom domain) | Used for canonical URLs + email links. Update after first deploy when you know the URL. |
| `NEXT_PUBLIC_APP_NAME` | `Forj` (or rebrand pending) | Display name in the chrome. |
| `NEXT_PUBLIC_BASE_RPC_URL` | `https://mainnet.base.org` or your Alchemy / QuickNode URL | Public RPC works for demo; switch to a paid provider if you hit rate limits. |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` or paid equivalent | Same as above. |
| `NEXT_PUBLIC_CHAIN_ID` | `84532` (Base Sepolia for demo) or `8453` (mainnet) | Make sure it matches whichever escrow address you set below. |
| `NEXT_PUBLIC_USDC_ADDRESS` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Sepolia) or `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (mainnet) | Canonical Circle addresses per chain. |
| `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` | From `packages/contracts/src/addresses.ts` | Currently `0x09fb654f30637258d30e3f03b06f5370a0cf8954` on Sepolia. |
| `NEXT_PUBLIC_MULTISIG_ADDRESS` | The Safe you deployed | `0x2332373BEB6A13A61bf45881808327406DD9D5e6` on Sepolia. |

### Required for full functionality (but app won't crash without them)

| Var | Source | What breaks if missing |
|---|---|---|
| `UPLOADTHING_TOKEN` | UploadThing dashboard → API Keys → v7 token | File / image uploads silently fail. Avatar, job cover, message attachments. |
| `RESEND_API_KEY` | Resend → API Keys | No transactional emails sent. In-app notifications still work. |
| `RESEND_FROM_EMAIL` | A verified-domain address. For demo: `Forj <noreply@yourdomain.com>` or use `onboarding@resend.dev` for the Resend sandbox sender (limited to your account email). | Emails fail with "domain not verified". |
| `UPSTASH_REDIS_REST_URL` | Upstash console → DB → REST | Rate limits silently disabled (mutations spam-able). |
| `UPSTASH_REDIS_REST_TOKEN` | Same place | Same as above. |
| `INNGEST_EVENT_KEY` | Inngest dashboard → Manage → Event keys | Email dispatch queue won't accept events; falls back to inline send (slower, no retry). |
| `INNGEST_SIGNING_KEY` | Inngest dashboard → Manage → Signing keys | `/api/inngest` rejects incoming function invocations (auth). |
| `ADMIN_USER_IDS` | DB query: `SELECT id FROM users WHERE username = 'your-admin-handle'` | `/admin/*` returns 401 for every request. Set this after your admin user signs up. |

### Optional / advanced

| Var | Purpose |
|---|---|
| `ADMIN_HOSTNAME` | Hostname for the admin surface (e.g. `admin.forj.app`). When set, `/admin/*` only resolves on this host; the public host returns 404 for those paths. **See "Admin on a subdomain" section below for full setup.** Skip for demo on `.vercel.app` (no admin subdomain available there). |
| `PINATA_API_KEY`, `PINATA_SECRET_KEY`, `NEXT_PUBLIC_PINATA_GATEWAY` | IPFS pinning (portfolio archives, on-chain reputation snapshots). Skip for demo. |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Error tracking. Skip for demo. |
| `PLATFORM_FEE_RECIPIENT` | Used by deploy scripts only, NOT by the running web app. Skip on Vercel. |
| `DEPLOYER_PRIVATE_KEY` | Same — script-only. **Never set this on Vercel.** |
| `BASESCAN_API_KEY` | Script-only (hardhat verify). Skip on Vercel. |
| `NEXT_PUBLIC_TRANSAK_API_KEY`, `NEXT_PUBLIC_TRANSAK_ENV` | Not wired up in the UI yet. Skip. |

### Tip: paste in bulk

Vercel has a "**Paste env**" button next to the env var table. Paste
your `.env` file content directly (the parser handles `KEY=value`
lines + `#` comments). Then **delete** these before saving:
- `DEPLOYER_PRIVATE_KEY` (script-only, never on Vercel)
- `INNGEST_DEV` (local-dev flag; on Vercel set real `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` instead)
- `SKIP_ENV_VALIDATION` (force the env schema check on production)

---

## 3 · Deploy

1. Click **Deploy**. First build takes 3-5 minutes (cold cache).
2. Vercel shows the build log in real time. The build runs:
   - `pnpm install --frozen-lockfile` from repo root
   - `pnpm turbo run build --filter=@forj/web` — Turborepo builds
     `@forj/api`, `@forj/db`, `@forj/email`, `@forj/contracts`,
     `@forj/web` in dependency order
   - Next.js `next build` generates 44 routes (37 static, 7 dynamic).
3. After the build, deploy assigns a `<random>-<your-name>.vercel.app`
   URL. Open it.

---

## 4 · Post-deploy checklist

After the first successful deploy, verify these in order:

```
[ ] / loads the marketing page
[ ] /signup completes Privy auth, lands on /onboarding
[ ] /onboarding submit succeeds + DB user row created
[ ] /dashboard renders with empty states (no crash)
[ ] /jobs lists open jobs (empty list OK)
[ ] /api/inngest GET returns 200 (Inngest discovery)
[ ] /robots.txt has `/admin/` disallow
[ ] /admin returns 200 but queries are empty (you're not in
    ADMIN_USER_IDS yet)
```

Then back-fill admin access:

1. Note your DB user UUID from Drizzle Studio or
   `SELECT id FROM users WHERE username = '<your-handle>'`.
2. Add it to Vercel env: `ADMIN_USER_IDS=<your-uuid>`.
3. Redeploy (Settings → Deployments → ⋯ → Redeploy). Env-only
   changes don't trigger auto-redeploy.
4. Hit `/admin` again — queue counts appear.

---

## 5 · Webhooks + external callbacks

Two services call Forj back at fixed URLs. Configure them in their
dashboards using your new Vercel URL:

### Inngest

Inngest cloud pings `/api/inngest` for function discovery + every
event invocation. In the Inngest dashboard:

1. Apps → Forj → **Edit endpoint**.
2. Endpoint URL: `https://<your-vercel-url>/api/inngest`.
3. Sync. Inngest reads the function manifest from there.

### Privy webhooks (optional but recommended)

Privy can push user lifecycle events (signup, wallet provisioned, MFA
enabled) to `/api/webhooks/privy`. The current code processes them
opportunistically — the app works without webhooks too. To enable:

1. Privy dashboard → Webhooks → Add endpoint.
2. URL: `https://<your-vercel-url>/api/webhooks/privy`.
3. Events: `user.created`, `user.linked_account` (cover the JIT
   provisioning race).

### UploadThing

UploadThing uses CORS, not webhooks. As long as
`NEXT_PUBLIC_APP_URL` matches the deployed URL, uploads work.

---

## 6 · Custom domain (optional, demo-level)

1. Vercel project → Settings → Domains → Add.
2. Add `<your-domain>.com`. Vercel walks you through DNS records.
3. After DNS propagation, update `NEXT_PUBLIC_APP_URL` to the
   new domain. Redeploy.

Skip this for a pure demo — the `.vercel.app` subdomain is fine.

---

## 6b · Admin on a subdomain (recommended once you have a custom domain)

Once `forj.app` (or whatever) points at your Vercel project, the
recommended setup is to put the admin surface on `admin.forj.app`.
The web app's `middleware.ts` already supports this — you just flip
it on via env var.

### Why subdomain (vs `/admin/*` on the main domain)

- Removes the admin chrome from the public-domain bundle pipeline.
  A drive-by scanner hitting `forj.app/admin` gets a clean 404
  instead of a "this exists but you can't see it" 401.
- Lets you add a separate auth layer in front of the subdomain
  (Cloudflare Access, Vercel password protection) without affecting
  user-facing traffic.
- Visually + operationally clearer for the team — context-switching
  between "I'm logged into the user dashboard" and "I'm logged into
  admin" is unambiguous when the URL itself differs.

The `/admin/*` path stays in the codebase — middleware just gates
WHICH HOST can serve those paths.

### Setup steps

1. **Add the subdomain in Vercel.** Project → Settings → Domains →
   Add `admin.forj.app`. Vercel walks you through the DNS record
   (CNAME pointing at `cname.vercel-dns.com`). Once DNS propagates,
   the subdomain is bound to the same project as `forj.app`.

2. **Set `ADMIN_HOSTNAME` env var to that subdomain.** Important:
   set it ONLY for the Production environment, not Preview. (Preview
   deploys get unique-per-branch hostnames; if you set ADMIN_HOSTNAME
   on Preview, /admin would 404 on every preview URL.)
   ```
   ADMIN_HOSTNAME=admin.forj.app    # Production only
   ```
   Vercel env var UI: when adding a var, untick Preview + Development
   and only tick Production.

3. **Redeploy** (env-only changes don't auto-trigger). Project →
   Deployments → ⋯ → Redeploy.

4. **Test**:
   - `https://admin.forj.app/` → redirects to admin hub.
   - `https://admin.forj.app/users` → admin recovery page.
   - `https://forj.app/admin` → Next.js not-found page (NOT a
     redirect — that would leak the subdomain to scanners).

5. **(Optional but recommended) Add an extra auth layer.** Cloudflare
   Access lets you require Google SSO + Workspace membership before
   any request even hits Vercel. Setup: Cloudflare zone → Access →
   Applications → Add → Self-hosted → hostname `admin.forj.app` →
   pick your identity provider. The `ADMIN_USER_IDS` server-side
   gate is then your second factor.

### What about Vercel Preview deploys?

Preview deployments get unique URLs per commit (e.g.
`forj-abc123.vercel.app`). They don't have an admin subdomain.
With `ADMIN_HOSTNAME` unset for Preview, the middleware falls back
to path mode automatically — `forj-abc123.vercel.app/admin` works
for testing.

This is the right default. Don't try to make admin subdomain work
for previews; the friction isn't worth it.

---

## 7 · Production hardening (when ready to go live)

These don't apply to the demo Vercel deploy, but worth knowing:

- **CSP headers** — `next.config.ts` currently has the basic security
  headers (HSTS, X-Frame-Options, etc.) but no Content-Security-
  Policy. Privy + WalletConnect inject inline scripts that a strict
  CSP would block. Plan a hardening pass before public launch.
- **Admin URL behind Cloudflare Access** — already documented in
  `docs/OPERATIONS.md` §8. For demo, the `noindex` meta + `ADMIN_USER_IDS`
  server-side gate is sufficient.
- **Rate limit fallback** — `packages/api/src/middleware/rate-limit.ts`
  silently disables limits if Upstash is unreachable. For production
  consider making it fail-closed instead.
- **Sentry** — wire up `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN`
  before launch so you see errors as they happen.

---

## 8 · Troubleshooting

### Build fails with "Cannot find module '@forj/api'"

Vercel didn't run `pnpm install` from the workspace root. Verify:
- Root Directory is `apps/web` in Vercel project settings.
- `apps/web/vercel.json` has `installCommand: cd ../.. && pnpm install --frozen-lockfile`.

### Build fails with "Environment variable not found"

`@t3-oss/env-nextjs` validates at build time. Set
`SKIP_ENV_VALIDATION=true` if you need to deploy with incomplete
env (NOT recommended). Better: add the missing var.

### Runtime 500s, no obvious error in logs

Likely a missing env var that's optional at build time but
required at runtime. Open the function logs in Vercel dashboard
→ Functions → /api/trpc/[trpc] → recent invocations.

### `/api/inngest` 401 in production

`INNGEST_SIGNING_KEY` mismatch. Verify the key in Vercel env
matches the one in Inngest cloud → Manage → Signing keys (rotate
on either side wipes the other).

### Wallet connections fail in production

`NEXT_PUBLIC_APP_URL` mismatch. Privy's allowed origins list must
include the deployed URL. Update in Privy dashboard → Settings →
Domains.

### Build hangs / runs forever

`turbo-ignore` may be misbehaving on the first deploy (no previous
commit to diff against). Force a clean deploy by removing the
`ignoreCommand` from `apps/web/vercel.json` temporarily, or trigger
a manual deploy with "Skip Build Cache".

---

## What's next (after demo deploy works)

The bigger production path (VPS + self-hosted Postgres) is a
separate write-up. Key differences:

- Drizzle works the same — just point `DATABASE_URL` at your VPS
  Postgres instead of Neon. `drizzle-orm/neon-serverless` is
  Neon-specific; for self-hosted Postgres swap to
  `drizzle-orm/postgres-js` or `drizzle-orm/node-postgres`. One
  file change in `packages/db/src/client.ts`.
- Inngest can stay on cloud OR self-host their open-source dev
  server. Webhook URL stays the same.
- Privy stays as-is (their hosted service).
- Vercel's Edge / Serverless caching → swap for a normal Node
  process behind Caddy / Nginx. Run `pnpm start` after `pnpm build`.

Don't migrate until the demo proves the use case.
