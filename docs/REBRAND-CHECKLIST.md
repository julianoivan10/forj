# Rebrand checklist

Heads-up doc: a name change before launch is on the table, so this
captures every place the current brand ("Forj") shows up + the
recommended order of operations when it's time to swap.

The good news: i18n already exists with `brand.name` / `brand.tagline`
keys in all six locales (`en/id/tl/zh/es/vi`). Most user-visible
strings flow through there, so a rebrand is largely a config change
+ a single SQL-level rename. The bad news: not 100% of strings are
i18n'd; some hardcoded references need a manual pass.

---

## Categories of references

### 1. i18n keys — the easy ones (~6 files)

Update all six `apps/web/lib/i18n/messages/<locale>.json` files:

- `brand.name` — display name. Currently "Forj".
- `brand.tagline` — short pitch. Currently "Work, forged in trust."
  (etc per locale).
- `hero.body` — landing page hero copy mentions "Forj" indirectly.
- `auth.signInBody` — "Sign in to your Forj account."
- `auth.signUpBody` — "Pick how you'd like to sign up. We'll create a wallet for you automatically." (no brand name but matches voice)
- `auth.joinForj` — "Join Forj" (literal key includes brand).
- `auth.newToForj` — "New to Forj?"
- `footer.rights` — "© {year} Forj. All rights reserved."

**Note**: `auth.joinForj` and `auth.newToForj` are keys WITH the
brand baked in. Rename to `auth.joinUs` / `auth.newToUs` (or
similar) AND swap callsites. Otherwise the key reads strange after
rebrand.

### 2. Hardcoded UI strings — manual sweep (~15 files)

Grep `\bForj\b` finds these (non-exhaustive — search current repo
for the live list):

- `components/layout/footer.tsx` — copyright line, sometimes brand
  name inline.
- `components/layout/navbar.tsx` — logo + brand mark.
- `components/landing/hero-section.tsx` — hero copy with brand
  references.
- `components/onboarding/dashboard-tour.tsx` — "Welcome to Forj"
  tour copy.
- `app/(auth)/login/login-card.tsx`, `app/(auth)/onboarding/onboarding-form.tsx` — auth flow copy.
- `app/u/[username]/user-profile.tsx` — "Joined Forj on..." style.
- `app/proof/[id]/proof-view.tsx` — proof-of-work page brand line.
- `app/admin/page.tsx`, `app/admin/layout.tsx` — admin chrome.
- `app/dashboard/settings/page.tsx`, `app/dashboard/page.tsx` —
  scattered "Forj" mentions in setting descriptions.
- `components/settings/security-tab.tsx` — recovery copy mentions
  Forj.
- `app/dashboard/contracts/[id]/page.tsx` — possibly in copy.

**Recommendation when rebranding**: move all of these to i18n
keys in one PR. Lengthy but mechanical. Use a `find-and-replace`
with case sensitivity ("Forj" → "{new brand}") as a starting
point, then audit the diff for context.

### 3. Logo asset — `apps/web/public/logo.svg`

Single file. Replace with the new logo SVG. References in
`app/icon.svg` and `app/apple-icon.png` if those exist.

### 4. Env vars / config (~5 lines)

- `.env` / `.env.example`: `NEXT_PUBLIC_APP_NAME` (if it exists),
  Resend `RESEND_FROM_EMAIL` (currently looks like
  `Forj <noreply@forj.app>`), Sentry project name.
- `apps/web/lib/env.ts`: any default that references the brand.
- `apps/web/lib/constants.ts`: brand-themed constants like
  badge tier names.

### 5. Smart contracts — irreversible

The deployed `ForjEscrow` contract literally has "Forj" in its
name on-chain. **You cannot rename a deployed contract.** Options:

- **Keep the on-chain name.** Most users never see the contract
  source — they see the UI. The name on Basescan stays "Forj"
  forever; that's an acceptable artifact of history.
- **Deploy a new contract** under the new name. Means migration:
  freeze old contract for new funding, document the address swap,
  ensure in-flight contracts complete on the old one. Heavy lift,
  only worth it if the brand mismatch is a real liability (e.g.
  legal).

**Recommended**: keep the on-chain name unless legal forces a
rename. Add a docstring/README note explaining the history.

### 6. Domain + email

- `forj.app` / `forj.com` (or whatever the registered domain) —
  obvious.
- Email `from` address (`noreply@forj.app`) — Resend config.
- Help center URL (`/help/disputes-and-recovery`) — internal path,
  no change needed.

### 7. Package names — internal, optional

The monorepo uses `@forj/api`, `@forj/db`, etc. Internal
identifiers — users don't see them. Renaming is a search-and-
replace + pnpm reinstall, low priority. Defer unless audit-by-
external-party requires consistency.

### 8. Repo + GitHub

- Rename the GitHub repo (auto-redirect from old URL).
- Update any CI yaml / Vercel project names.
- Update README header + tagline.

### 9. Documentation references

Docs under `/docs/`:

- `OPERATIONS.md`, `SETUP.md`, `MULTISIG-MIGRATION.md`, etc.
- Comments inside source files (less critical — find-and-replace
  pass).

---

## Recommended PR sequence (when the time comes)

1. **PR-1 — config + locales.** All six i18n files + env vars +
   logo asset. No code logic changes. Visible result: brand name
   in the UI flips everywhere it flowed through i18n.
2. **PR-2 — hardcoded strings.** The ~15 files listed in §2. Move
   each "Forj" literal to a new or existing i18n key. Add the
   key to all six locales. Long but mechanical.
3. **PR-3 — internal naming.** Package names (`@forj/*` → `@<new>/*`),
   docstrings, comments. Optional, only if you want everything
   consistent for an audit.
4. **PR-4 — domain + email.** DNS swap, Resend `from` update,
   redirect old domain to new one for a few months.

Estimated work: PR-1 + PR-2 are a half-day total if done with
focus. PR-3 is busywork (~2-3 hours of mechanical find-replace).
PR-4 is ops + DNS, not code.

---

## What NOT to change (intentionally)

- Deployed smart-contract names — see §5.
- Database schema column/table names — they reference logic, not
  brand. Renaming would break every migration history reference.
- Privy app name — internal Privy dashboard label, no user impact.
- BaseScan contract verification — keep historical record intact.

---

## Acceptance test post-rebrand

Hit these surfaces and verify the new brand renders correctly:

- [ ] Marketing home `/`
- [ ] Marketing about / how-it-works / privacy / terms
- [ ] Login + Signup flows
- [ ] Dashboard overview + sidebar + header
- [ ] Settings (all four tabs)
- [ ] Public profile `/u/{any-username}`
- [ ] Admin chrome (`/admin`)
- [ ] Transactional emails (proposal-received, contract-funded,
      welcome — fire one of each via Inngest dev CLI)
- [ ] Browser tab title for each route (Next.js metadata.title)
- [ ] OpenGraph card via `https://metatags.io`

If all green, ship.
