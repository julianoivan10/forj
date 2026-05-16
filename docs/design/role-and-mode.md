# Role + mode architecture

> "Should a Forj account be 'client OR freelancer', or 'both'?"
> Answer: **both at the data layer, soft mode switcher at the UI layer.**
> This doc explains why, and how to wire it.

---

## The three options

### Option A — Hard role at signup (Upwork classic)
On registration, user picks Client or Freelancer. Account is permanently
that role. To use the other side, they create a second account.

**Pros**: clear mental model, simpler queries, easier abuse-prevention
("client accounts can't apply to jobs").

**Cons**: huge friction for users who need both. A developer who hires
a designer once a quarter would have to remember which email/password
combo is the "hiring" account. Indonesian gig economy specifically is
heavily dual-use (designers who outsource copy; founders who freelance
on the side).

### Option B — Dual role, single dashboard (current Forj)
Every account can post jobs AND apply to jobs. The dashboard shows
everything.

**Pros**: zero friction, future-proof, captures the "I might want
both" user without forcing a decision upfront.

**Cons**: cluttered nav (every menu item even if you've never used
it), unclear "what am I supposed to do here" on first login, freelancer-
specific profile fields (skills, hourly rate) are mandatory for
everyone — drops conversion.

### Option C — Dual role + soft mode switcher (recommended)
Account is dual at the data layer. UI has a **mode** (`client` /
`freelancer` / `both`) the user can flip anytime. Each mode shows the
nav relevant to that side. Freelancer-side profile fields are
collected lazily — only when the user FIRST tries to do a freelancer
action (apply to a job, post a service).

**Pros**: clean default flow per mode, no signup friction, full
flexibility, future-compatible.

**Cons**: slightly more state to manage (mode flag), a UI element
(toggle) takes up screen space.

**Recommendation**: **Option C**. Best UX with no data-model lock-in.

---

## Implementation

### 1. Add `preferredMode` to users schema

```ts
// packages/db/src/schema/users.ts
preferredMode: text('preferred_mode', { enum: ['client', 'freelancer', 'both'] })
  .notNull()
  .default('both'),
```

Existing users default to `'both'` — backward-compatible (everyone sees
everything, same as today). New users get their mode from the
onboarding answer.

### 2. Update onboarding form to set initial mode

Current onboarding asks "What brings you to Forj?" with three
options. Map those answers to `preferredMode`:

| Onboarding answer | preferredMode |
|---|---|
| "Hire freelancers" | `client` |
| "Find work" | `freelancer` |
| "Both" | `both` |

(This already exists in the data model — just persist it.)

### 3. Mode switcher in sidebar header

Above the nav groups, add a compact switcher:

```
┌──────────────────────────────┐
│ 🔨 Forj                       │  <- logo
│ ─────────────────────────────  │
│ ⊞  Client view   ▾            │  <- mode switcher
│ ─────────────────────────────  │
│ ▸ Overview                    │
│ ▸ My Jobs                     │  <- only client-mode items
│ ...                           │
└──────────────────────────────┘
```

Dropdown shows three options (Client / Freelancer / Both). Selection
persists to `users.preferredMode` AND localStorage (immediate UI flip
without round-trip).

### 4. Filter NAV_GROUPS by mode

```ts
function getNavGroupsForMode(mode: PreferredMode): NavGroup[] {
  if (mode === 'both') return NAV_GROUPS;   // current behaviour
  
  const visibleByMode = {
    client: new Set([
      'sidebar.overview',
      'sidebar.myJobs',
      'sidebar.savedServices',     // <- buyer's bookmarks
      'sidebar.contracts',
      'sidebar.messages',
      'sidebar.notifications',
      'sidebar.settings',
    ]),
    freelancer: new Set([
      'sidebar.overview',
      'sidebar.myProposals',
      'sidebar.myServices',
      'sidebar.savedJobs',         // <- worker's bookmarks
      'sidebar.contracts',
      'sidebar.messages',
      'sidebar.notifications',
      'sidebar.settings',
    ]),
  };
  
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => visibleByMode[mode].has(item.labelKey)),
  })).filter((g) => g.items.length > 0);
}
```

### 5. Lazy freelancer profile collection

When a user in `client` mode clicks "Apply to a job" or "Post a
service" for the first time, intercept with a modal:

> *"Quick step — to receive payouts as a freelancer, we need your
> skills + hourly rate. 30 seconds."*

Collect: skills (array), hourlyRate (numeric), portfolio link
(optional). Save to `users` row. Flip `preferredMode` to `'both'`
(now they're both). Proceed with the original action.

This is the SOFT escalation — no one is forced to commit upfront,
but full data is captured at the moment of intent.

### 6. Saved bookmarks per mode

- **Client mode** users save services they might purchase. Use
  `saved_services` table (parallel to `saved_jobs`).
- **Freelancer mode** users save jobs they might apply to. Use existing
  `saved_jobs`.
- **Both mode** users see both bookmark surfaces in the nav.

---

## Edge cases

### What if a `client`-mode user gets a proposal accepted (became a freelancer through legacy data)?

The actions don't depend on mode — mode is purely UI. The user still
has a `contracts` row where they're the freelancer. They'll see it in
the **Contracts** tab (which is shown in client mode too because every
account has contracts). When they open that contract, the UI shows
freelancer actions (submit work, etc.) because actions are gated on
party membership, not mode.

Mode just controls *which menu items are prominent by default*, not
what the user can actually do.

### What if a user has data in BOTH (jobs posted + proposals submitted)?

Show "Both" mode. Or let them pick. Either is fine — mode is reversible.

### Can users hide their proposals / jobs from each other?

Public profile `/u/{username}` shows everything they consent to. Mode
doesn't change this — privacy is a separate setting.

---

## Open questions

1. **Default mode for new signups**: should the onboarding "I want both"
   option still exist, or force a primary mode? My take: keep it —
   "both" is the dominant Indonesian use case.
2. **Mode-specific dashboard hero**: "Welcome back, Charlie" stays the
   same regardless. But the recommended actions below could adapt:
   client mode → "Post a job", freelancer mode → "Browse jobs". Worth
   doing.
3. **Service-buying side**: a client buys a service from a freelancer.
   Currently nothing in the UI calls out "I bought a service". Should
   it appear in their Contracts list? Yes — it already does, because a
   service purchase creates a contract row. ✓

---

## Migration path

This is non-breaking:

1. Add `preferredMode` column to users (default `'both'`).
2. Update onboarding form to set the value.
3. Ship the mode switcher. Existing users see `'both'` mode → sidebar
   identical to today. They can opt into `client` or `freelancer` mode.
4. After ~30 days of switcher being live: analyse `preferredMode`
   distribution. If `'both'` is < 20%, consider making the onboarding
   choice mandatory (no "Both" option, force a pick) for cleaner default.
5. Long-term (post-PMF): a/b test the mode-aware dashboard hero
   recommendations.

No data loss, no forced migration, no user-visible disruption.
