# Emergency recovery — design doc

> "What happens if a user loses access to their Privy account?"
> Answer: layered safety — three independent recovery paths, plus a
> counter-party escape valve for the *other* side of an in-flight
> contract.
>
> This doc captures the design before implementation lands. Code paths
> reference each section by number.

---

## 1. Failure modes we're designing for

A Forj account is anchored to a Privy identity. Privy controls the
embedded wallet. If a user loses one of the following, they can lose
access to:

| Loss event | What breaks | Funds at risk |
|---|---|---|
| Email forgotten / inbox deleted | Magic-link login | None (escrow still works, just can't sign in) |
| OAuth provider revokes account | Google/Twitter login | None |
| Privy session cookie + no recovery | Re-login flow | None (recovery flows still work) |
| Embedded wallet seed lost AND no guardian set | Wallet itself | **Yes** — any USDC sitting on the wallet, and ability to release funded escrows as freelancer |
| Total identity loss (no recovery option pre-configured) | Everything | Yes — same as above, plus reputation orphaned |

The first three are recoverable via Privy's standard flows. The last
two are what *we* have to design around — because no amount of Privy
recovery helps if the user pre-emptively skipped configuring it.

**What's NOT at risk regardless**: funds inside a *funded* escrow.
The escrow contract release path is gated on the freelancer's wallet
signing, but the contract itself doesn't get destroyed when the
wallet is lost. Worst case: funds stay locked until auto-release
window expires (7 days post-submission), at which point the client
can call `claimRelease()` or `refund()` depending on the state.

---

## 2. Layered recovery — three independent paths

The principle: any one of these three is enough to recover an
account. We never depend on all three at once.

### 2a. Privy guardians (pro-active, user-driven)

Privy supports guardian-based recovery for embedded wallets — the
user nominates 1+ external addresses (or other Privy users) who can
cosign a recovery transaction.

**Surface**: `/dashboard/settings → Security → Recovery guardians`
section. Empty state explains the trade-off ("guardians can help you
recover if you lose access — they can't move your funds"). Add /
remove buttons launch Privy's `usePrivy().setRecoveryAddress()` and
sibling flows.

**Default**: not configured. We strongly recommend configuring at
least one guardian on first login (banner in dashboard for 30 days
after signup, dismissible).

Docs: <https://docs.privy.io/guide/react/recovery>

### 2b. Wallet export (pro-active, user-driven)

Privy lets the user export the embedded wallet private key — they can
then re-import into MetaMask, Rabby, etc. After export, they own the
key independently of Privy. If Privy itself disappears tomorrow, they
still have funds.

**Surface**: `/dashboard/settings → Security → Export wallet`. The
CTA opens Privy's confirmation flow with strong warnings ("Anyone with
this key can move your funds. Store it offline."). One-shot — the key
is shown once.

**Behaviour**: we don't store the exported key anywhere. The flow is
entirely between the user and Privy's iframe. We only know that
export *happened* (Privy emits an event we can persist for support
context).

API: `usePrivy().exportWallet()`.

### 2c. Admin re-link (reactive, support-driven)

If the user shows up via support claiming they lost access, an admin
needs to bind a new `privyId` to their existing DB row. Otherwise
their reviews, contracts, work history are orphaned — they'd have to
start over with zero reputation.

Two automatic re-link paths already exist in `getUserFromToken`:

- **Wallet-match re-link** (existing): if the user signs in with a
  new Privy session but proves ownership of the same wallet address
  (cryptographic signature, verified by Privy), we auto-re-link by
  updating the row's `privyId` to the new one. This covers "I lost my
  Google account but still have MetaMask".

- **No-match → JIT provision** (existing): brand-new user gets a
  fresh row.

What's missing: a **manual** path for "I lost both my Google account
AND my wallet, but I can prove I'm me via off-chain evidence" — needs
admin intervention.

**Surface**: new tRPC procedure `admin.relinkUser({ targetUserId,
newPrivyId })`. Gated by `ADMIN_USER_IDS` env (same gate as
`/admin/disputes`). Logs every call to a new `admin_audit_log` table
(actor admin, target user, before-after privyId, reason free-text).

**Process** (in `docs/OPERATIONS.md`):
1. User contacts support with proof of identity (e.g. screenshot of
   old proposal email, signed message from a known-linked wallet,
   government ID — TBD per jurisdiction).
2. Support verifies proof off-chain.
3. Support asks the user to sign up fresh via Privy. Now there's a
   "ghost" new row + the "orphan" old row.
4. Support gets both rows' UUIDs from Privy dashboard / our DB.
5. Admin runs `admin.relinkUser({ targetUserId: <old>, newPrivyId:
   <new privyId from the ghost row> })`.
6. Admin runs `admin.deleteUser({ targetUserId: <ghost row> })` to
   clean up the orphan provisioned during signup.
7. User logs out + back in. Their new Privy session now points at
   the recovered row.

Audit log is non-negotiable — this procedure trivially enables
account takeover if abused. Every call gets logged with admin
identity, timestamp, reason, and the old/new privyId values. Reads
of the audit log are admin-only.

---

## 3. Counter-party escape valve

If a freelancer loses access mid-contract, the client shouldn't be
stuck either. Today's gates:

| Contract state | Client can | Freelancer can |
|---|---|---|
| funded | refund, cancel | submit work |
| submitted | approve, request revision | (waiting) |
| revision_requested | (waiting) | resubmit |
| 7 days post-submit | **claim auto-release** (current code) | — |

The 7-day auto-release IS the escape valve for clients waiting on a
non-responsive freelancer — `contract.claimRelease()` exists and
fires `transfer` on the escrow contract from the client's wallet.
No freelancer signature needed.

Symmetric for the other direction: if a *client* loses access after
funding, the **freelancer can still receive payout via auto-release**.
After submitting work + waiting 7 days with no client response,
freelancer calls `claimRelease()` and the escrow pays them out.

**Documentation gap**: this exists in code but isn't surfaced in the
UI as a "what to do if the other party ghosts you" runbook. Add a
section to OPERATIONS.md (support-facing) and a help-page
`/help/disputes-and-recovery` (user-facing).

---

## 4. Anti-takeover guarantees

Recovery flows are the most dangerous code in the app — they bypass
the "wallet-signs-or-no-recovery" guarantee that protects everything
else. Three rules:

1. **Wallet match is the only auto path.** Same-wallet → auto-re-link
   is safe because Privy verifies wallet signature. Email match,
   phone match, or display-name match are NEVER used for auto re-link
   — those are unverified or easily spoofed.

2. **Manual paths require admin + reason + audit.** No silent backend
   re-link. Even support tier 1 doesn't get a button; they file a
   ticket, an admin reviews, the admin runs the procedure with a
   written reason captured in the audit log.

3. **Soft-deleted accounts cannot log back in via auto-paths.**
   `getUserFromToken` already blocks login attempts that match a
   `deletedAt` row — see soft-delete branch. Recovery from a deleted
   account is admin-only and requires a different procedure
   (`admin.restoreUser`) — separate from re-link, because restoring
   data has different ethics (the user chose to leave, may not want
   to come back the same way).

---

## 5. Implementation plan

### Phase 1 — Doc + admin procedure (this PR)

- This design doc.
- `admin.relinkUser` tRPC procedure (with audit log table + write).
- OPERATIONS.md runbook section.

### Phase 2 — Settings surfaces (next PR)

- `/dashboard/settings → Security` panel with:
  - Recovery guardians manager (wraps Privy's flows).
  - Export wallet CTA with warning copy.
  - Audit log: "Last export: 2 weeks ago", "Guardians: 1 configured".

### Phase 3 — Onboarding nudges (later)

- After first successful login, banner: "Set up recovery (30s)".
- Banner survives until guardian configured OR explicitly dismissed
  for 30 days.
- Pre-checkout nudge: before user funds their first escrow, blocking
  modal: "You're about to lock funds in a smart contract. Take 30
  seconds to configure recovery — otherwise losing your account
  means losing access to these funds."

### Phase 4 — Auto-release runbook surfacing (parallel)

- Help page `/help/disputes-and-recovery` explaining the auto-release
  flow + how to invoke it from the contract detail page when the
  counter-party ghosts.
- Contract detail page surfaces "Counter-party hasn't responded for
  X days — you can [auto-release | dispute]" CTA once the contract
  has been in `submitted` or `funded` state past the relevant
  window.

---

## 6. Open questions

1. **Identity proof bar for admin re-link**: too low = takeover
   vector, too high = users locked out permanently. Initial proposal:
   require ONE of (a) screenshot of an old proposal email from our
   Resend logs, (b) signed message from any wallet ever linked to the
   account, (c) government ID + selfie matching profile photo. Refine
   based on first 20 real cases.

2. **Audit log retention**: keep forever, or rotate after N years?
   GDPR right-to-erasure complicates this — anonymise admin identity
   in records older than 5 years? Defer until counsel review.

3. **Cross-jurisdiction**: Indonesian KYC norms vs EU GDPR vs US KYC
   — proof bar differs. Probably need a regional config map
   eventually. Out of scope for MVP.

4. **Multisig accounts**: a future "team" account would have multiple
   wallets/owners. Recovery becomes a multisig threshold problem
   (any K-of-N can re-link). Out of scope for MVP — single-user
   accounts only.
