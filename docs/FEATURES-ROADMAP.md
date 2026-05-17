# Features roadmap

Captured from competitive analysis vs Upwork, Fiverr, Toptal,
Sribulancer, Braintrust, Deel. Filtered through Forj's actual
positioning: Indonesian gig economy + Web3-native + dual-mode
account. Each item has effort + impact estimates so you can sequence
based on resource availability.

This is a roadmap, not a wishlist — items here passed the test of
"why this matters for Forj specifically" rather than "every feature
ever shipped in this category."

---

## Top 10 to consider first

Ranked by impact ÷ effort, weighted toward items that build on Forj's
existing differentiators (escrow data, dual-mode account, on-chain
reputation):

| # | Feature | Impact | Effort | Why now |
|---|---|---|---|---|
| 1 | **Pre-Funding Verification Badge** | 5★ | S | Free trust win — data already exists on chain (`contracts.status = 'funded'`). Surface client funding rate on profile + job listing. Eliminates the #1 freelancer complaint on Upwork (ghost clients). |
| 2 | **IDR On/Off-Ramp** (Xendit/Midtrans) | 5★ | XL | Without this, TAM is capped at crypto-natives (~2% of Indonesian freelance market). Single biggest unlock. Start integration now even though it's XL — long pole. |
| 3 | **WhatsApp Notification Bridge** | 5★ | M | Indonesian users live on WhatsApp. Email open rates in ID are notoriously low. Mirror critical notifications (new message, milestone submitted, dispute opened) via Meta Business API or Wablas. |
| 4 | **Bahasa-First Onboarding** | 5★ | M | i18n covers translation but not localization. Onboarding copy should be Indonesian-default with local examples ("misalnya, desain logo untuk warung kopi"), IDR-first pricing display, Indonesian testimonials. |
| 5 | **Client Reputation Score (Public)** | 5★ | M | Most platforms hide client quality. Surface payment speed, dispute rate, average response time, % of jobs that actually fund. Forj's dual-mode account makes this natural — everyone is rated. Differentiator vs Upwork. |
| 6 | **AI Job ↔ Freelancer Matching** | 5★ | L | Embedding-based recommendations via pgvector using job description + freelancer skills/portfolio. Solves the Indonesian skill-tag mismatch (SMEs write job posts in Bahasa, don't know right English tags). |
| 7 | **On-Chain USDC Referrals** | 5★ | M | Refer freelancer/client, earn % of platform fees on their first 3 contracts, paid in USDC. Transparent + automatic via smart contract. Upwork/Fiverr referral programs are notoriously opaque and slow. |
| 8 | **Category SEO Landing Pages** | 5★ | M | `/jobs/web-development-indonesia`, `/services/logo-design-jakarta`. Sribulancer dominates Indonesian SEO; Forj needs this to escape paid-acquisition dependency. Static-generate from Postgres. |
| 9 | **KTP-Based KYC Tier** | 5★ | L | Integrate Privy.com.id or Verihubs for KTP+selfie. Optional badge ("Verified Indonesian"), but **prerequisite for IDR off-ramp compliance**. Unlocks higher contract values + B2B credibility. |
| 10 | **Verified Past Work Imports** | 4★ | M | Import GitHub commits, Behance projects, Dribbble shots — pin with a signed proof linking to wallet. Indonesia has tons of self-taught designers/devs without "official" credentials but strong public portfolios. |

**Sequencing recommendation:**
- **Weeks 1-2** — Ship #1, #3, #4, #5 (cheap + addresses worst gaps vs local incumbents).
- **Weeks 3-8** — Track #2 + #9 in parallel (XL effort, but it's the bet that makes Forj the *Indonesian* Web3 platform rather than a generic one).
- **Defer until volume justifies** — streaming payments, yield-on-idle, EAS attestations. Cool, but premature without demand-side traction.

---

## Full list by category

### Trust + reputation

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Pre-funding verification badge (#1 above) | 5★ | S | Yes (data on chain) |
| Client reputation score public (#5 above) | 5★ | M | No |
| On-chain skill attestations (EAS) — peers/past clients sign "shipped React component for X". Portable across platforms. | 4★ | L | Yes |
| Verified past work imports (#10 above) | 4★ | M | Light |
| Reputation lending / co-sign — gold-tier freelancer co-signs a bronze freelancer's proposal, staking reputation. Solves cold-start better than Toptal gatekeeping; mirrors gotong-royong culture. | 4★ | L | Yes |

### Marketplace discovery

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| AI matching (#6 above) | 5★ | L | No |
| Category SEO landing pages (#8 above) | 5★ | M | No |
| "Available now" + response SLA — surface freelancers actively online with stated response window. Indonesian clients heavily favour fast chat-driven hiring (WhatsApp culture). | 4★ | S | No |
| Saved search + job alerts — email/in-app alerts when a job matching saved filters drops. Currently have saved bookmarks but no proactive notification. | 3★ | S | No |

### Payment + financial

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| IDR on/off-ramp (#2 above) | 5★ | XL | Yes (hybrid rail) |
| Auto tax document generation — Bukti Potong PPh 21/23 templates + annual SPT-ready exports. Deel does this globally; nobody for Indonesia + crypto. | 4★ | M | No |
| Early wage access / invoice factoring — once milestone submitted but not approved, freelancer borrows 70% against future release. Critical for Indonesia (thin cash buffers). Trustless underwriting because escrow is on-chain. | 4★ | XL | Yes |
| Milestone streaming (Sablier/Superfluid) — continuous payment for retainer-style work ("social media manager, $200/mo streamed per-second"). Web3-native. | 3★ | L | Yes |
| Stablecoin yield on idle escrow — funded escrow earning Aave/Morpho yield until release, split between client and platform. Risk: requires multisig comfort with DeFi exposure. | 3★ | L | Yes |

### Collaboration tools

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| WhatsApp notification bridge (#3 above) | 5★ | M | No |
| Built-in file sharing on contracts — currently messages have attachments but no contract-scoped deliverable storage. Add S3-backed attachments + a "final deliverable" slot that triggers `submitted` state. | 4★ | M | No |
| Contract templates / scope library — pre-built scopes ("Shopee store setup," "TikTok video editor, 4 videos/mo"). Reduces job-posting friction for non-technical Indonesian SMEs. | 3★ | M | No |
| Time tracker (hourly contracts) — start with self-reported hours + optional screenshots. Forj's contract states assume milestone/fixed-fee currently; hourly is big in Upwork. | 3★ | L | No |

### Indonesia-specific

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Bahasa-first onboarding (#4 above) | 5★ | M | No |
| KTP-based KYC tier (#9 above) | 5★ | L | No |
| NPWP linking for tax-compliant invoicing — tie freelancer's NPWP (tax ID) to profile so business clients can claim PPh credits. What makes Indonesian B2B choose Forj over Fiverr (which can't issue compliant invoices). | 4★ | M | No |
| City-tier pricing hints — "typical rate in Jakarta vs Yogyakarta vs Medan" benchmarks. Helps clients price fairly, helps freelancers in lower-cost cities compete without underbidding desperately. | 3★ | S | No |
| Local community channels — curated Discord/Telegram per category-region ("Designer Jakarta," "Dev Bandung"). Indonesian freelance culture is community-driven. | 3★ | S | No |

### Growth / referral

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| On-chain USDC referrals (#7 above) | 5★ | M | Yes |
| Affiliate job-board syndication — cross-post jobs to Glints, Kalibrr, LinkedIn via API. Solves demand-side cold start. Risk: cannibalises if mishandled — only syndicate jobs that haven't received proposals in 48h. | 4★ | L | No |
| Public leaderboards (weekly) — top earners by category-region with badges. Gamification works exceptionally well in Indonesia (look at Shopee). Drives FOMO + supply-side activity. | 3★ | S | No |
| Embeddable profile widgets — freelancers embed their Forj profile + WorkScore on personal sites / LinkedIn. Every embed is a backlink + acquisition surface. | 3★ | M | No |

### Risk + safety

| Feature | Impact | Effort | Web3? |
|---|---|---|---|
| Sybil-resistant identity (World ID / Privy KYC) — prevent fake-account farming since wallets are cheap to create. World ID or Sumsub liveness on signup for any account that wants to apply/post. | 4★ | M | Optional |
| AI proposal spam filter — generic AI-generated proposals are flooding Upwork. Score proposals for personalisation (mentions job specifics, asks questions) before showing to client. | 4★ | M | No |
| Escrow insurance pool — small % of fees feed a pool that reimburses victims of arbiter errors or smart-contract bugs. Builds trust during the period when on-chain reputation is thin. Pool is transparent on-chain. | 4★ | L | Yes |
| Two-person approval for large withdrawals — optional security setting. Freelancer can require email+wallet confirmation for withdrawals above a threshold, mitigating Privy account compromise. | 3★ | M | Light |

---

## What we explicitly are NOT building

Not because they're bad ideas, but because they don't fit Forj's
current positioning. Documenting so we don't drift:

- **Recruitment / staffing / payroll** — Deel territory. Forj is a
  project marketplace, not an employer-of-record.
- **DAOs as clients** — interesting but tiny TAM in Indonesia. Add
  if/when a real DAO client shows up.
- **Cross-chain payments** — Base is enough for MVP. Multi-chain
  splits fee economics + UX without unlocking new users.
- **NFT-based reputation** — soulbound badges are gimmicky. We
  already have on-chain reviews; that's better as a primitive.
- **Open-source-only positioning** — has cultural cachet but limits
  paying-customer pool. Don't gate features on OSS contribution.

---

## How this doc gets used

When you have a working day to spend on roadmap, pick from the
"Top 10" table. When you have a half-day, look in the category
tables for an S/M-effort item with 4★+ impact. When you're tempted
by something not on this list, ask: does it leverage on-chain
data, dual-mode accounts, or the Indonesian market? If no to all
three, it's probably not the right time.

Doc updated when shipping a feature (mark it `✅ SHIPPED` with
commit hash) so the list stays honest about current state.
