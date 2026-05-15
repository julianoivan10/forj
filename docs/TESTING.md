# Forj — Testing Guide

> Comprehensive test plan. Run this top-to-bottom before any branch
> claims it's "ready to merge". Each section ends with a checkbox you
> can tick mentally (or copy into a PR description).
>
> **Test accounts**: use freshly created users for each major flow
> rather than re-using prior state. The platform supports multiple
> users per browser via different Privy sessions / fresh profiles.

---

## Table of contents

1. [Smoke tests (every dev cycle)](#1-smoke-tests-every-dev-cycle)
2. [Auth + onboarding](#2-auth--onboarding)
3. [Smart wallet provisioning](#3-smart-wallet-provisioning)
4. [Job posting](#4-job-posting)
5. [Proposal flow](#5-proposal-flow)
6. [Contract funding (smart wallet, sponsored)](#6-contract-funding-smart-wallet-sponsored)
7. [Submit work → approve → release](#7-submit-work--approve--release)
8. [Reviews + public proof](#8-reviews--public-proof)
9. [Saved jobs](#9-saved-jobs)
10. [Command palette (cmd+k)](#10-command-palette-cmdk)
11. [Onboarding tour](#11-onboarding-tour)
12. [Empty states](#12-empty-states)
13. [Mobile responsive](#13-mobile-responsive)
14. [Theme switching](#14-theme-switching)
15. [Failure modes (negative paths)](#15-failure-modes-negative-paths)
16. [Performance + perf budget](#16-performance--perf-budget)

---

## 1. Smoke tests (every dev cycle)

Run after every `git pull`, every dependency bump, every config change.

```bash
# 1. Typecheck the whole monorepo
pnpm typecheck
# Expected: 5 successful, 0 errors

# 2. Linter
pnpm lint
# Expected: no errors (warnings OK during MVP)

# 3. Boot dev server
pnpm --filter @forj/web dev
# Expected: ready at http://localhost:3000 within 8s
```

In the browser:

- [ ] `/` (marketing) loads, hero is visible, no console errors
- [ ] `/jobs` loads, shows the job listing (or empty state with Bauhaus illustration)
- [ ] `/login` loads, Privy modal can be opened
- [ ] Theme toggle (top-right or in user menu) flips dark ↔ light, no broken colours

If any of these fail, **stop**. Don't proceed to feature testing.

---

## 2. Auth + onboarding

### Fresh sign-up (email)

1. Use an email you haven't signed in with before
2. Click "Sign in" → choose Email → enter email → check inbox → enter code
3. **Expected**: redirected to `/onboarding`
4. Pick role (Client / Freelancer / Both)
5. Pick username (must be unique)
6. Fill bio, skills (freelancer), hourly rate (freelancer)
7. Submit
8. **Expected**: redirected to `/dashboard`. User row in DB has `is_onboarded=true`, `walletAddress` populated.

- [ ] New email account → onboarding completes → dashboard renders
- [ ] Username collision → server returns "username taken" error
- [ ] Reload during onboarding → resumes at the right step
- [ ] Reload after onboarding → goes straight to dashboard (no redirect loop)

### Sign-in (existing user)

1. Sign out (user menu → Sign out)
2. Click "Sign in" → same email/method as before
3. **Expected**: lands on `/dashboard` directly, skips onboarding

- [ ] Existing user → no onboarding replay
- [ ] Sign-out clears all client cache (notifications badge zero, etc.)

### Soft-deleted account

1. Delete account via Settings → "Delete my account"
2. Sign out
3. Try to sign back in with the same email
4. **Expected**: bounced back to `/login` with a notice. DB row has `deletedAt` set but `privyId` tombstoned.

- [ ] Soft-deleted user can't log back in
- [ ] Display name on legacy contracts shows "Deleted user" instead of the original name

---

## 3. Smart wallet provisioning

Pre-req: `NEXT_PUBLIC_USE_SMART_WALLETS=true` + Privy dashboard configured per `docs/PIMLICO-SETUP.md`.

### Email-only user (the happy path)

1. Sign up via **email only** (don't connect MetaMask)
2. Settings → Account → Wallet card
3. **Expected**: address shown is a smart-wallet address (different from any EOA you own). USDC balance: 0. Network: Base Sepolia.

- [ ] Smart wallet address rendered (not the underlying EOA)
- [ ] "Different wallet detected" warning is **absent** in SW mode
- [ ] Deposit card QR encodes the same address
- [ ] Withdraw card → "Send to crypto wallet" form is enabled

### MetaMask user (still gets smart wallet)

With `embeddedWallets.createOnLogin: 'all-users'` (current config), MetaMask-connected users **also** get a smart wallet.

1. Sign up with MetaMask connected
2. Settings → wallet address should NOT match your MetaMask EOA
3. **Expected**: same smart wallet UX as email user

- [ ] MetaMask login still provisions smart wallet
- [ ] No funding popup asks for MetaMask gas (sponsored path used)

### USDC top-up

1. Settings → "Get testnet USDC from faucet" link → opens Circle faucet
2. Paste **smart wallet address** (not MetaMask address)
3. Claim 10 USDC → wait ~30 s for confirmation
4. Refresh app → USDC balance card shows 10 USDC

- [ ] Faucet drop confirmed on Basescan
- [ ] Balance refreshes within 30 s of confirmation

---

## 4. Job posting

### Successful post

1. Logged-in client → /dashboard → "Post a job" CTA
2. Fill title (≥ 8 chars), description (≥ 50 chars), pick category
3. Add 1+ skill
4. **Optional**: upload cover image (PNG/JPG ≤ 4 MB)
5. Set budget (min, max — min ≤ max)
6. Pick duration + experience level
7. Submit

- [ ] Job posted successfully → redirects to `/dashboard/jobs/[id]`
- [ ] Cover image renders on `/jobs/[slug]` and the listing
- [ ] **No** cover image → Bauhaus generative pattern renders (category-coloured)
- [ ] Public `/jobs` lists the new job within ~5 s

### Validation errors

- [ ] Title < 8 chars → form blocks submit with inline error
- [ ] Description < 50 chars → blocked
- [ ] No skills added → blocked
- [ ] Budget min > max → blocked
- [ ] Negative budget → blocked

---

## 5. Proposal flow

### Single-payment proposal

1. Switch to a freelancer account
2. Browse to a job → "Apply"
3. Cover letter (≥ 50 chars), bid amount, estimated duration
4. Leave "Split into milestones" toggle OFF
5. Submit

- [ ] Proposal sent → redirects to `/dashboard/proposals`
- [ ] Client sees notification + proposal in their job's proposals list

### Milestone-based proposal

1. Repeat above, toggle **Split into milestones** ON
2. Start with 2 empty rows
3. Fill each: title, amount, duration, description
4. **Sum indicator** in the bottom right shows current total / bid
5. Click "Split bid evenly" — amounts distribute, sum = bid
6. Try removing a row → at least 1 always remains
7. Submit

- [ ] Sum < bid → submit blocked with "milestone amounts must total your bid"
- [ ] Sum > bid → same error
- [ ] Each row missing title → row-specific error
- [ ] Each row amount = 0 → row-specific error
- [ ] Successful submit → proposal row in DB has `milestones` JSONB populated

### Client accepts a milestone-based proposal

1. Switch to the client account
2. Open the job's proposals → Accept the milestone proposal
3. Contract created → check `/dashboard/contracts/[id]`
4. **Expected**: milestone tracker visible, first milestone status = `in_progress`, rest `pending`

- [ ] Other pending proposals on this job become `rejected`
- [ ] Accepted freelancer receives a notification

---

## 6. Contract funding (smart wallet, sponsored)

Pre-req: smart wallet has ≥ `amount × 1.05` USDC.

1. Client opens the contract → "Fund USDC escrow"
2. Single toast: "Preparing escrow — Building a sponsored transaction."
3. Privy popup: one in-app confirm (no MetaMask popup!)
4. ~3-5 s wait → toast flips to "Confirming on Base…"
5. Status: Funded ✓

- [ ] **One** Privy confirm popup (not two — the EOA "Step 1 of 2 / Step 2 of 2" copy must not appear in SW mode)
- [ ] No MetaMask popup at any point
- [ ] No ETH needed in the smart wallet
- [ ] Pimlico dashboard → User Operations → new sponsored UserOp visible
- [ ] On Basescan: `EscrowFunded` event emitted with correct `clientFee` (5% of amount) and `freelancerFeeBps=200`

### Insufficient USDC

If balance < amount + clientFee:
- [ ] Error toast decodes to "ERC20: transfer amount exceeds balance"
- [ ] User can claim more from Circle faucet + retry without restarting

### Different chain

If wallet is on Base mainnet (not Sepolia):
- [ ] Wallet card shows "Wrong network" warning
- [ ] Fund button is enabled (we attempt the chain switch via Privy)

---

## 7. Submit work → approve → release

### Submission with attachments

1. Freelancer opens the funded contract → "Submit work"
2. Modal opens with: message textarea, file picker
3. Drag-and-drop 1-2 images and/or a PDF
4. **Each file** uploads eagerly, chip appears with name + size
5. Submit

- [ ] File upload progress shown (loader on the chip)
- [ ] Max 5 files enforced (6th rejected with toast)
- [ ] Submit blocked if message < 10 chars
- [ ] After submit: contract status flips to `submitted`, auto-release timer starts (7 days)
- [ ] Client receives a notification

### Client approves

1. Client opens the contract → "Approve work"
2. Approval modal → confirm
3. Smart wallet popup → confirm release transaction
4. ~3 s → status flips to `completed`

- [ ] Freelancer receives `amount × 0.98` (2% deducted)
- [ ] Fee recipient receives `amount × 0.05 + amount × 0.02` = 7% combined
- [ ] On Basescan: `Released` event has `freelancerAmount` + `totalFee` matching the math
- [ ] Auto-release timer cleared from UI

### Auto-release after 7 days (cannot easily test without time travel)

For local testing: temporarily set `autoReleaseWindow` to 60 seconds via Hardhat console. Then:
- [ ] After window passes, anyone can call `claimAfterTimeout()`
- [ ] Funds go to the freelancer

### Revision flow

1. After submission, client clicks "Request revision" instead of approve
2. Modal: revision reason ≥ 10 chars
3. Submit

- [ ] Contract flips back to `funded` (revision_requested in DB), auto-release clock clears
- [ ] Freelancer sees the revision message + can re-submit
- [ ] Each revision increments `contracts.revisionCount`

### Dispute flow

1. Either party clicks "Raise dispute" on a funded or submitted contract
2. Reason ≥ 20 chars
3. Submit

- [ ] Status flips to `disputed`, funds frozen on-chain
- [ ] Admin (in `ADMIN_USER_IDS`) can see it at `/admin/disputes`
- [ ] Admin resolves with split: amounts must sum to `e.amount + e.clientFee`
- [ ] On-chain `DisputeResolved` event matches split

---

## 8. Reviews + public proof

After a contract is `completed`:

1. Client opens the contract → "Leave a review"
2. Star rating + breakdown (communication / quality / professionalism / would hire) + comment
3. Submit
4. Switch to freelancer → leaves their review too
5. Both reviews now appear on the contract page

- [ ] Both reviews appear on each party's `/u/[username]` profile
- [ ] `workScore` of each user recomputed
- [ ] Badge tier (bronze/silver/gold/diamond) updates if threshold crossed

### Public proof page

`/proof/[contractId]` — shareable, no auth required.

- [ ] Loads without sign-in
- [ ] Shows "Verified on Forj" badge
- [ ] Timeline: created → funded → submitted → completed with dates
- [ ] Basescan links on funded + released txs work
- [ ] Both reviews shown
- [ ] "Hire {freelancer}" CTA navigates to their profile
- [ ] Twitter / LinkedIn share renders OpenGraph card correctly

---

## 9. Saved jobs

1. Logged-in user → browse `/jobs` → click bookmark icon on a card
2. Icon fills vermillion **instantly** (optimistic update)
3. Sidebar nav → "Saved Jobs" → arrives at `/dashboard/saved`
4. Job appears in the list
5. Click bookmark again on the same job (either from card or saved list)
6. Job removed

- [ ] Bookmark click is instant (< 100ms perceived) — no flicker / rollback
- [ ] Server rejection (e.g. job deleted) rolls back the optimistic state + shows toast
- [ ] Saved Jobs page renders Bauhaus empty-state for users with 0 bookmarks
- [ ] Anonymous user clicks bookmark → toast: "Sign in to save jobs"

---

## 10. Command palette (cmd+k)

1. Press **Cmd+K** (Mac) or **Ctrl+K** (Windows/Linux) from any page
2. Palette opens, input focused, "Quick actions" header visible
3. Type a query — debounced 180ms, results appear

- [ ] Press **Esc** → palette closes
- [ ] **↑/↓** arrow keys move highlight (visible vermillion glow on the active row)
- [ ] **Enter** opens the highlighted result
- [ ] Search across jobs / services / users — section labels render between groups
- [ ] No results for a nonsense query → "No results for ..." empty hint
- [ ] Mobile (< md) → narrow modal with side gutters, kbd hints hidden
- [ ] Trigger button visible: navbar (desktop pill `Search… ⌘K`, mobile icon)
- [ ] Click "Full search →" footer link → navigates to `/jobs`

---

## 11. Onboarding tour

Run on a fresh user (clear `localStorage[forj:onboarding-tour:done:${userId}]`).

1. Complete signup + onboarding
2. Land on `/dashboard`
3. **Expected**: tour popover appears within 500ms with "Welcome to Forj." step

- [ ] Step 1 (welcome): centered popover, no spotlight
- [ ] Step 2 (Settings): spotlights sidebar "Settings" with vermillion glow ring
- [ ] Step 3 (search): spotlights the search trigger button
- [ ] Step 4 (Saved Jobs): spotlights sidebar "Saved Jobs"
- [ ] Step 5 (final): centered, "Let's go" button finishes
- [ ] **Back** button navigates to previous step
- [ ] **Skip tour** dismisses immediately
- [ ] After completion / skip, reload → tour does **not** replay
- [ ] Resize window during tour → popover repositions to stay in viewport

---

## 12. Empty states

Each surface should render a Bauhaus illustration variant (not generic Lucide icon):

- [ ] `/jobs` — no results: search variant (magnifying glass)
- [ ] `/dashboard` — recent activity zero state: contracts variant
- [ ] `/dashboard/jobs` — no jobs posted: jobs variant
- [ ] `/dashboard/proposals` — no proposals: proposals variant (paper plane)
- [ ] `/dashboard/contracts` — no contracts: contracts variant (interlocking rects)
- [ ] `/dashboard/services` — no services: services variant (spark)
- [ ] `/dashboard/saved` — no bookmarks: jobs variant with "Browse jobs" CTA

---

## 13. Mobile responsive

Use Chrome DevTools device emulation at three widths:

### 375px (iPhone SE — the smallest target)

- [ ] Navbar: hamburger menu + search icon + theme + user menu fit
- [ ] Hero stacks vertically, proof card hidden
- [ ] Job card readable, cover image scales, bookmark icon reachable
- [ ] Forms (proposal, job post): inputs stack, no horizontal scroll
- [ ] Modal (any): respects 1rem gutters, doesn't bleed off screen
- [ ] Dashboard sidebar replaced by drawer (hamburger toggles)
- [ ] Drawer nav items all visible (Overview, Jobs, Proposals, Services, Saved, Contracts, Messages, Notifications, Settings)
- [ ] Active drawer item has vermillion slab marker

### 768px (iPad portrait)

- [ ] Job listing grid: still single column for readability
- [ ] Cards stay full-width

### 1024px+ (desktop)

- [ ] Sidebar visible, content area at 260px-left offset
- [ ] Search pill in navbar shows `⌘K` hint

---

## 14. Theme switching

- [ ] Dark mode default on first visit (or follows `prefers-color-scheme`)
- [ ] Toggle in user menu / settings flips theme instantly
- [ ] Refresh → theme persists (localStorage `forj:theme`)
- [ ] Light mode: cream paper background, vermillion accent reads cleanly
- [ ] Light mode: no harsh white-on-white card stacking
- [ ] Dark mode: warm charcoal background (not pure black), cream text
- [ ] Both modes: vermillion CTA buttons remain accessible (AA contrast)
- [ ] Both modes: Bauhaus illustration colours adapt sensibly

---

## 15. Failure modes (negative paths)

### Network

- [ ] Disable network mid-fund → flow surfaces a real error message (not a hung spinner)
- [ ] Slow network (DevTools throttle "Slow 3G") → toasts narrate the slow step, no double-clicks possible

### Bad input

- [ ] Username with special chars → blocked
- [ ] Wallet address pasted wrong → 0x validation error
- [ ] File too big → upload rejected with a friendly toast
- [ ] File wrong type → upload rejected

### Concurrent actions

- [ ] Two clients accept the same proposal simultaneously → second one gets "Another proposal was just accepted"
- [ ] Two freelancers submit on the same contract (race) → only one gets through, the other sees a useful error

### On-chain races

- [ ] Fund the same contract twice (e.g. impatient double-click) → second tx reverts, no DB double-write
- [ ] Manually replay a fund txHash via curl → backend rejects (not our chain / wrong escrow / amount mismatch)

### Soft-delete edge cases

- [ ] Delete an account that owns active contracts → contracts remain; counterparty sees "Deleted user" label
- [ ] Deleted user's reviews stay on counterparty's profile
- [ ] Public proof page still loads for deleted-user contracts (with anonymised name)

---

## 16. Performance + perf budget

Run Lighthouse on production build (`pnpm --filter @forj/web build && pnpm --filter @forj/web start`):

- [ ] **First Contentful Paint** ≤ 1.5s on Fast 3G emulation
- [ ] **Largest Contentful Paint** ≤ 2.5s
- [ ] **Cumulative Layout Shift** < 0.1
- [ ] **Total Bundle (client JS)** ≤ 600 KB gzipped per route
- [ ] No console errors on first paint (Privy initialisation warnings excluded)

Bundle analysis:
```bash
ANALYZE=true pnpm --filter @forj/web build
# Inspect: large chunks should be code-split (Privy, viem, wagmi)
```

---

## Bug reporting template

When you find a bug during these tests, file it like this:

```
**What test were you running?** Section 6 — Contract funding
**Repro steps:**
1. Charlie smart wallet balance: $5
2. Try fund a $5 contract
3. Click "Fund USDC escrow"
**Expected:** error toast about insufficient funds (need $5.25 with client fee)
**Actual:** transaction goes through and reverts on Pimlico simulation, message is unparseable hex
**Browser / OS:** Brave on Windows 11
**On-chain receipt link (if any):** N/A
```

Open issues in `docs/known-issues.md` until we have a real bug tracker.
