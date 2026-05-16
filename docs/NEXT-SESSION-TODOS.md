# Next-session backlog

Carry-over from the 2026-05-16 working session. The "quick wins"
shipped this session (sidebar restructure, messages composer, multisig
handoff, message notifications, mobile critical fixes, inbox.summary
combine). The items below are intentionally deferred — each is a
multi-hour task that deserves its own focused session.

Pick them up in any order; they're independent.

---

## 1. Performance — DB triggers + index + N+1 (~3-4h)

Three follow-ups from the tRPC perf audit (full report in commit
`27704b2` chat). Combined effort because they touch the same query
paths.

### 1a. Partial index on `messages(receiver_id) WHERE NOT is_read`

The `inbox.summary` endpoint runs:
```sql
SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND is_read = false
```
Currently a full scan. Add a partial index — small (only unread rows)
and matches the hot predicate exactly.

```sql
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread
  ON messages (receiver_id) WHERE is_read = false;
```

Mirror as a Drizzle index helper in `packages/db/src/schema/messages.ts`
so the migration stays generated. Verify with `EXPLAIN ANALYZE` —
should switch from `Seq Scan` to `Index Scan`.

### 1b. Denormalised unread counts on `users`

Long-term: keep `users.message_unread_count` and
`users.notification_unread_count` as columns maintained by Postgres
triggers. Read becomes a single indexed row lookup instead of two
COUNTs.

Out of scope for MVP — the partial index in 1a is probably enough for
the next ~10k users. Note the migration sketch:

```sql
ALTER TABLE users ADD COLUMN message_unread_count int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notification_unread_count int NOT NULL DEFAULT 0;

CREATE FUNCTION bump_message_unread() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_read = false THEN
    UPDATE users SET message_unread_count = message_unread_count + 1
    WHERE id = NEW.receiver_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_read = false AND NEW.is_read = true THEN
    UPDATE users SET message_unread_count = message_unread_count - 1
    WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Add matching trigger for notifications.

### 1c. N+1 in `message.getConversations`

`packages/api/src/routers/message.ts` lines 32-87 fetch latest message
+ other-party user per conversation in a `Promise.all` loop. For a
user with 20 conversations that's ~40 round-trips on inbox load.

Rewrite as a single SQL using:
- Window function `ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC)` to get the latest message per conversation
- LEFT JOIN against `users` to get the other party in the same query

Drizzle's TS support for window functions is weak — likely needs raw
SQL via `sql<>` template. Document the SQL in a code comment.

---

## 2. Inngest layer for notifications resilience (~2h)

Today `notify()` (`packages/api/src/services/notifications.ts`) calls
`dispatchEmail()` inline. If Resend has a hiccup, the email is
silently dropped — no retry.

Pattern:

1. `notify()` instead does `inngest.send({ name: 'notif.delivery', data: {...} })`.
2. Inngest function consumes the event, retries on failure with
   exponential backoff (`@inngest/sdk` does this by default with step
   functions).
3. Same function emits in-app row AND triggers email — separately
   retriable.

Env already has `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` slots in
`.env.example`. Set up the Inngest dev server (`npx inngest-cli dev`)
and wire `/api/inngest` route.

Don't bother until message volume grows past ~100/day or you see real
delivery drops — premature for MVP.

---

## 3. Emergency recovery — design + implementation (~4-6h, design-heavy)

What happens when a user loses access to their Privy account?

**Today's failure mode**: Privy login via embedded wallet means losing
the email / OAuth identity = losing the wallet = losing access to
funded escrows (as freelancer) and ability to release escrows (as
client). On-chain funds aren't lost (escrow contract doesn't depend on
Privy), but the UI can't surface them without the user being able to
log in.

**Design considerations**:

a. **Social recovery via Privy guardians** — Privy supports
   guardian-based recovery for embedded wallets. Surface this in
   `/dashboard/settings → Security` so users can configure guardians
   pro-actively. Doc: <https://docs.privy.io/guide/react/recovery>

b. **Wallet-export escape hatch** — Let users export their embedded
   private key to MetaMask before they lose access. Privy provides
   `exportWallet()`. Surface as a "Backup access" CTA on first login,
   with a strong warning.

c. **Admin re-link path** — If a user contacts support claiming they
   lost access, an admin needs a way to re-bind a new `privyId` to
   their existing DB row (otherwise reviews, contracts, work history
   are orphaned). The `getUserFromToken` re-link heuristic does this
   automatically when the new Privy login uses the same verified
   wallet address — document this path, add an admin tRPC procedure
   for manual override (gated by `ADMIN_USER_IDS`).

d. **Counter-party escape valve** — If a freelancer loses access mid-
   contract, the client needs to be able to refund or dispute without
   the freelancer cosigning. Today `requestRevision()` and
   `raiseDispute()` are gated correctly; document the flow in
   OPERATIONS.md so support can talk people through it.

Start with a design doc (`docs/design/emergency-recovery.md`) before
writing code. Capture: trigger events, threat model (don't make this
an account-takeover vector), UI surface, support runbook.

---

## 4. Lazy freelancer escalation — ✅ SHIPPED (`c80755d`)

Apply-to-job flow now gates on `useHasFreelancerProfile()`. Missing
skills/rate → `EscalationModal` collects them, promotes role, then
auto-opens the proposal form.

**Remaining**: wire `intent="publish-service"` on
`/dashboard/services/new` if/when that page is streamlined (currently
it collects skills inline so doesn't need the gate yet).

---

## 5. Lower-priority mobile follow-ups

From the mobile audit not addressed this session (all "low" severity):

- **Dashboard quick actions wrap** — `app/dashboard/page.tsx` action
  cards on mobile, button text "Post a job" wraps. Add `grid-cols-1
  sm:grid-cols-2 lg:grid-cols-3` and bump padding.
- **Contracts/Proposals list cards** — base `flex flex-col` was
  implicit, make it explicit so 375px doesn't render the avatar +
  name + amount stacked weird.
- **Message composer min-height** — bump from `min-h-[44px]` to
  `min-h-[48px]` for keyboard-collision comfort.
- **Notif bell badge** — verify the `-right-1 -top-1` positioning
  doesn't clip when adjacent icons squeeze close on mobile.
- **Jobs page filter sidebar** — currently 280px column above the
  list on mobile (because grid stacks). Real fix is a bottom-sheet
  filter drawer triggered by a button. New component required.

---

## Index of commits across the working day

| Commit | What |
|---|---|
| `29259eb` | Sidebar split into Hiring/Work groups + messages composer + i18n |
| `393b3e8` | Multisig transfer-ownership script + env vars |
| `9ef988d` | Safe TX Builder JSON for acceptOwnership |
| `27704b2` | Message notifications wired + inbox.summary combine |
| `8e82556` | Mobile critical + medium fixes |
| `5b24c62` | This doc — next-session backlog (now updated) |
| `e54f497` | Messages `?to=` query handler + Contracts moved into Hiring/Work + Both mode dropped from selector |
| `c80755d` | Lazy freelancer escalation modal + apply-to-job gating |

On-chain state on Base Sepolia (current, multisig fully in control):

```
ForjEscrow v2  0x09fb654f30637258d30e3f03b06f5370a0cf8954
  owner          0x2332373BEB6A13A61bf45881808327406DD9D5e6  ✅ multisig
  pendingOwner   0x0000…0000                                  ✅ cleared
  feeRecipient   0x2332373BEB6A13A61bf45881808327406DD9D5e6  ✅ multisig
```

acceptOwnership was executed by the Safe — handoff complete. Future
admin operations (pause, dispute resolution, fee changes, etc.) now
require the multisig threshold of signatures.
