# Features roadmap

Captured from competitive analysis vs Upwork, Fiverr, Toptal,
Braintrust, Deel. Filtered through Forj's actual positioning:
**global Web3-native freelance marketplace** with dual-mode accounts
(any account does both hiring + freelancing) and smart-contract
escrow on Base.

Each item has effort + impact estimates so you can sequence based on
resource availability. This is a roadmap, not a wishlist — items
here passed the test of "why this matters for Forj specifically"
rather than "every feature ever shipped in this category."

---

## Top 10 to consider first

Ranked by impact ÷ effort, weighted toward items that build on
Forj's existing differentiators (on-chain escrow data, dual-mode
account, on-chain reputation). Web3-native items get a slight edge
because they're features Upwork/Fiverr structurally can't ship.

| # | Feature | Impact | Effort | Why now |
|---|---|---|---|---|
| 1 | **Pre-Funding Verification Badge** | 5★ | S | Free trust win — data already exists on chain (`contracts.status = 'funded'`). Surface client funding rate on profile + job listing. Eliminates the #1 freelancer complaint on Upwork ("ghost clients" who post but never hire). Forj is the only platform that can prove this on-chain. |
| 2 | **AI Job ↔ Freelancer Matching** | 5★ | L | Embedding-based recommendations via pgvector using job description + freelancer skills + portfolio + past contract titles. Upwork's matching is keyword-based and notoriously bad. Solves cold-start for both sides — supply-side gets relevant invites, demand-side gets surfaced before they bid blindly. |
| 3 | **Client Reputation Score (Public)** | 5★ | M | Most platforms hide client quality. Surface payment speed, dispute rate, average response time, % of jobs that actually fund escrow. Forj's dual-mode account makes this natural — everyone is rated, freelancers AND clients. Web3-native differentiator (Upwork structurally can't reveal client data this way). |
| 4 | **On-Chain Skill Attestations (EAS)** | 5★ | L | EAS on Base lets peers, past clients, or partner DAOs sign attestations like "shipped React component for X." Unlike Upwork's skill tests (gameable, internal), these are portable + verifiable + follow the wallet across platforms. Pairs with WorkScore as a richer reputation primitive. Pure Web3-native win. |
| 5 | **On-Chain USDC Referrals** | 5★ | M | Refer freelancer/client, earn % of platform fees on their first 3 contracts, paid in USDC. Transparent + automatic via smart contract. Upwork/Fiverr referral programs are notoriously opaque + slow to pay. Web3 native. Growth flywheel. |
| 6 | **Category SEO Landing Pages** | 5★ | M | `/jobs/web-development`, `/services/logo-design`, `/jobs/smart-contract-audit`. Static-generate from Postgres. Owned-acquisition channel that doesn't depend on paid ads. Critical for early-stage discoverability when the platform is < 10k jobs. |
| 7 | **Saved Search + Job Alerts** | 4★ | S | Email/in-app alerts when a job matching saved filters lands. Currently saved jobs exist but no proactive notification. Drives daily-active retention for freelancers — the lowest-cost retention lever in the platform. |
| 8 | **Verified Past Work Imports** | 4★ | M | Import GitHub commits, Behance projects, Dribbble shots, Vercel deployments — pin with a signed proof linking to wallet. Helps self-taught freelancers without traditional credentials demonstrate competence. Light Web3 leverage (signed proofs). |
| 9 | **Built-in File Sharing on Contracts** | 4★ | M | Currently messages have attachments but no contract-scoped deliverable storage. Add S3-backed attachments + a "final deliverable" slot that triggers `submitted` state. Reduces "where did the files go" support tickets. |
| 10 | **Saved Search → Email Digest** | 4★ | S | Weekly digest of jobs matching saved searches + new services in followed categories. Re-engagement for users who churned. Pairs naturally with #7. |

**Sequencing recommendation:**
- **Weeks 1-2** — Ship #1, #3, #7 (all S/M effort, immediate trust + retention wins).
- **Weeks 3-6** — #5 (referrals) + #6 (SEO) — both growth-oriented, ship together for compounding effect.
- **Weeks 6-12** — #2 (AI matching) + #4 (EAS attestations) — bigger bets that lean into Forj's Web3 differentiation.
- **Defer until volume justifies** — streaming payments, yield-on-idle, escrow insurance pool. Cool, but premature without demand-side traction.

---

## Full list by category

### Trust + reputation

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Pre-funding verification badge (#1 above) | 5★ | S | Yes (data on chain) |
| Client reputation score public (#3 above) | 5★ | M | No |
| On-chain skill attestations / EAS (#4 above) | 5★ | L | Yes |
| Verified past work imports (#8 above) | 4★ | M | Light |
| Reputation lending / co-sign — gold-tier freelancer co-signs a junior's proposal, staking reputation. Solves cold-start better than Toptal's gatekeeping. | 4★ | L | Yes |
| Anti-AI-spam proposal filter — generic AI-written proposals are flooding Upwork. Score proposals for personalisation (mentions job specifics, asks concrete questions) before showing to client. | 4★ | M | No |

### Marketplace discovery

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| AI matching (#2 above) | 5★ | L | No |
| Category SEO landing pages (#6 above) | 5★ | M | No |
| Saved search + job alerts (#7 above) | 4★ | S | No |
| Saved-search email digest (#10 above) | 4★ | S | No |
| "Available now" + response SLA — surface freelancers actively online with a stated response window ("replies within 2h"). Fiverr does this well; helps fast-turnaround clients filter. | 4★ | S | No |
| Embeddable profile widget — freelancers embed their Forj profile + WorkScore on personal sites / LinkedIn. Every embed is a backlink + acquisition surface. | 3★ | M | No |
| Featured-service slots (paid) — let freelancers boost visibility in their category for a fee. Revenue + supply-side investment signal. | 3★ | M | No |

### Payment + financial

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Multi-currency on/off-ramp via Stripe + Wise + Transak — let clients pay invoice in their local fiat (EUR, GBP, USD, etc.), platform converts to USDC into escrow. Same on withdrawal — freelancer gets local-currency to their bank. **The biggest TAM unlock for global**: without it, only crypto-natives can use Forj. | 5★ | XL | Yes (hybrid rail) |
| Auto tax document generation — W-8BEN / W-9 for US freelancers, EU VAT-compliant invoices, UK Making Tax Digital exports. Deel does this globally; nobody for crypto-paid contracts. Critical for legitimacy + repeat business. | 4★ | L | No |
| Milestone streaming payments (Sablier/Superfluid) — continuous payment for retainer-style work ("social media manager, $200/mo streamed per-second"). Upwork can't do this. Web3-native. | 3★ | L | Yes |
| Stablecoin yield on idle escrow — funded escrow earning Aave/Morpho yield until release, split between client and platform. Reduces effective fee, makes early funding attractive. Risk: multisig DeFi exposure — start cautious. | 3★ | L | Yes |
| Early wage access / invoice factoring — once milestone submitted but not approved, freelancer can borrow 70% of it against future release. Forj uniquely positioned because escrow state is verifiable on-chain — lenders can underwrite trustlessly. | 4★ | XL | Yes |

### Collaboration tools

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Built-in file sharing on contracts (#9 above) | 4★ | M | No |
| Contract templates / scope library — pre-built scopes for common gigs ("Smart contract audit", "Logo + brand identity", "Next.js dashboard build"). Reduces job-posting friction. | 3★ | M | No |
| Time tracker (hourly contracts) — start with self-reported hours + optional screenshots. Forj's contract state machine assumes milestone/fixed-fee; hourly is the second-biggest contract type on Upwork. | 3★ | L | No |
| Multi-channel notifications (Telegram, Discord webhooks, WhatsApp) — let users pick where critical events arrive. Currently email + in-app. For global users with varying email habits, alternative channels meaningfully boost engagement. | 4★ | M | No |
| Video meeting integration (Whereby / Daily.co) — embedded video calls scoped to a contract. Removes the "share your Zoom link" friction; events visible in contract timeline. | 3★ | L | No |

### Growth / referral

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| On-chain USDC referrals (#5 above) | 5★ | M | Yes |
| Affiliate job-board syndication — cross-post Forj jobs to LinkedIn Jobs, RemoteOK, We Work Remotely via API. Solves demand-side cold start. Risk: cannibalises if mishandled — only syndicate jobs that haven't received proposals in 48h. | 4★ | L | No |
| Public leaderboards — top earners by category-region with badges. Gamification works globally; drives FOMO + supply-side activity. Weekly resets keep newcomers competitive. | 3★ | S | No |
| Ambassador program — power users get an upgraded badge + revenue share in exchange for content / community / referrals. Web3-friendly because revenue share can be paid on-chain transparently. | 3★ | M | Light |

### Risk + safety

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Global KYC tier (Sumsub / Persona / Onfido) — optional verification badge unlocks higher contract values + protects against sanction-list users. Required for serious fiat-rail integration (#11 above). Persona is the easiest international integration; Sumsub has best coverage for emerging markets. | 5★ | L | No |
| Sybil-resistant identity (World ID) — prevent fake-account farming since wallets are cheap to create. World ID liveness on signup for any account that wants to apply/post. Pairs with the KYC tier (KYC = legal identity, World ID = unique-human proof). | 4★ | M | Optional |
| Escrow insurance pool — small % of fees feed a pool that reimburses victims of arbiter errors or smart-contract bugs. Builds trust during the period when on-chain reputation is thin. Pool is transparent on-chain. | 4★ | L | Yes |
| Two-person approval for large withdrawals — optional security setting. Freelancer can require email+wallet confirmation for withdrawals above a threshold, mitigating Privy account compromise. | 3★ | M | Light |
| Sanctions / OFAC screening — automated check on wallet addresses against the OFAC SDN list before allowing a contract to fund. Required for US client acceptance + compliance posture. Chainalysis / TRM offer APIs. | 4★ | M | Yes |

---

## What we explicitly are NOT building

Not because they're bad ideas, but because they don't fit Forj's
current positioning. Documenting so we don't drift:

- **Recruitment / staffing / payroll** — Deel territory. Forj is a
  project marketplace, not an employer-of-record.
- **Region-specific localization beyond i18n** — we ship 6 locales
  via i18n; we don't build region-specific UI shells (Brazilian-
  CPF tax fields, Indian-GST splits, etc.). Use Persona/Sumsub for
  KYC + Stripe/Wise for fiat rails — they handle the regional
  complexity for us.
- **DAOs as clients (first-class)** — interesting but tiny TAM. Add
  when a real DAO client shows up; until then, treat them as a
  normal multi-sig client account.
- **Cross-chain payments** — Base is enough for MVP. Multi-chain
  fragments fee economics + UX without unlocking new users.
- **NFT-based reputation** — soulbound badges are gimmicky. We
  already have on-chain reviews + WorkScore; that's better as a
  primitive than yet another token type.
- **Open-source-only positioning** — has cultural cachet but limits
  paying-customer pool. Don't gate features on OSS contribution.

---

## How this doc gets used

When you have a working day to spend on roadmap, pick from the
"Top 10" table. When you have a half-day, look in the category
tables for an S/M-effort item with 4★+ impact. When you're tempted
by something not on this list, ask: does it leverage on-chain
data, dual-mode accounts, or the global remote-work shift away
from Upwork's keyword-search model? If no to all three, it's
probably not the right time.

Doc updated when shipping a feature (mark it `✅ SHIPPED` with
commit hash) so the list stays honest about current state.
