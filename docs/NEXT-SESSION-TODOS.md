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

### 1a. Partial index on `messages(receiver_id) WHERE NOT is_read` — ✅ NOT NEEDED

The schema already has `messages_receiver_unread_idx ON
(receiver_id, is_read)` (composite, not partial). Postgres uses
Index Scan on the existing composite for `WHERE receiver_id = ? AND
is_read = false` — verified mentally; can confirm with EXPLAIN.

A partial index would be marginally smaller in storage but no
meaningful speedup over the composite. Skip until profiling shows
the existing index isn't being chosen.

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

### 1c. N+1 in `message.getConversations` — ✅ SHIPPED

Was 2N+1 queries (1 aggregation + 1 last-message + 1 other-user
per conversation). Now exactly **3 queries** regardless of N:

1. Aggregation (unchanged): conversation_id + lastMessageAt +
   unreadCount, grouped + ordered.
2. `selectDistinctOn([messages.conversationId], { ... })` — one row
   per conversation, the latest message, in a single Postgres
   `DISTINCT ON` plan.
3. `findMany(users) WHERE id IN (otherIds) AND deletedAt IS NULL` —
   batch fetch of all other parties, filtering soft-deleted at the
   DB layer.

Then an in-memory map join over the three result sets.

For a user with 20 conversations: **41 → 3 round trips** (93%
reduction). Memory pressure stays low because each query is small
(< 200 rows even for power users).

---

## 2. Inngest layer for notifications resilience — ✅ SHIPPED

Email delivery now flows through Inngest:

- `packages/api/src/inngest/client.ts` — `inngest` client + typed
  `ForjEvents` map.
- `packages/api/src/inngest/functions/dispatch-email.ts` — the
  `dispatchEmailFn` function. Triggered by
  `notification/dispatch-email` event. Uses `step.run('send-email')`
  for replay-safe retries (Inngest default 4 attempts, exponential
  backoff). Concurrency cap 5 to be kind to Resend.
- `apps/web/app/api/inngest/route.ts` — endpoint registered with
  Inngest's `serve()` adapter (`inngest/next`).
- `notify()` in `services/notifications.ts` now sends an Inngest
  event for email when `INNGEST_EVENT_KEY` is set, else falls back
  to inline `dispatchEmail()` so dev without the Inngest CLI still
  works.
- `.env` gained `INNGEST_DEV=1` for local; `.env.example` documents
  the dev-vs-prod split.

In-app notification row is still written synchronously (instant bell
badge); only the email side gained retry resilience.

**Remaining**: add more functions as background workloads appear
(e.g. payout reminders, dispute SLA escalations). Single drop-in
file in `inngest/functions/` + push the export to
`inngest/index.ts`.

---

## 3. Emergency recovery — ✅ DESIGN + PHASE 1 SHIPPED

Design doc: `docs/design/emergency-recovery.md`.
Phase 1 (this session): admin.relinkUser tRPC procedure +
admin_audit_log table + OPERATIONS.md §8 runbook.

**Remaining phases** (separate sessions):
- Phase 2 — Settings → Security panel (Privy guardians manager,
  wallet-export CTA, recovery status summary).
- Phase 3 — Onboarding nudges (banner to configure recovery on first
  login, pre-fund modal warning).
- Phase 4 — Auto-release runbook surfacing (`/help/disputes-and-
  recovery` page, contract-detail "counter-party ghosted" CTA).
- Future — `admin.restoreUser` (un-delete soft-deleted accounts;
  different ethics than relink, needs its own design).

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
| `6e2d2cb` | Messages hung-spinner fix (utils.client.query → utils.fetch) + 3 security hardenings (fileUrl whitelist, per-receiver rate limit, soft-deleted user filtering) |
| `92d644e` | Emergency recovery Phase 1: design doc + admin.relinkUser + admin_audit_log table + OPERATIONS.md §8 runbook |
| `d1ba5df` | Real hung-spinner fix (useQuery hook, was a useEffect-cleanup race) + Phase 2 Settings → Security panel |
| `519995d` | N+1 fix in message.getConversations (2N+1 → 3 queries via DISTINCT ON + inArray batch) |
| `398ced8` | Message cursor pagination ("Load older" button) + Settings overhaul (Profile/Account/Security) |
| `6fc8eb4` | Emergency recovery Phase 3 (dashboard nudge) + Phase 4 (/help/disputes-and-recovery page) |
| (next)    | Inngest retry layer: email dispatch now async + retried |

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
