# Pricing & Revenue Model

> Reference for setting platform fees, projecting unit economics, and
> deciding which surfaces to monetise. Numbers below assume USDC on Base
> mainnet at MVP scale (~100-1000 contracts/month).

## TL;DR — recommended fee structure

| Surface | Fee | Who pays | Rationale |
|---|---|---|---|
| **Escrow contract** | **5% client + 2% freelancer = 7% combined** | Both | Primary revenue. Below market (Upwork = 20%, Fiverr = 20%) → sticky for early adopters |
| Submit work / approve / dispute | $0 | — | Sponsored by paymaster. Cost ~$0.005/op |
| Top-up smart wallet (deposit) | $0 | — | Sponsored. Encourage on-platform balances |
| Withdraw to external wallet | $0 | — | Sponsored. User's money, don't gate it |
| Withdraw to bank (off-ramp) | 0% platform + Transak fee (~3-4%) | User | Pure pass-through. Don't double-dip |
| Featured job listing | $5 / 7 days | Client | Optional growth revenue |
| Pro membership | $9/month | Optional | Advanced filters, priority support, analytics |

**Why split 5%/2% instead of 5% from one side**:
- Client sees: "$100 job → I pay $105" (5% fee)
- Freelancer sees: "$100 job → I receive $98" (2% fee)
- Both sides feel fair contribution. Combined 7% = our take.
- A single-side 7% feels heavier to whoever bears it.
- Easy to A/B test later (e.g. flat 5% combined, or 8/0 from client only).

## Why 5%+2% (and not 5% alone or 10%+)

Competitive landscape:

| Platform | Combined fee | Notes |
|---|---|---|
| Upwork | ~20% (10% client + 10% freelancer + payment fees) | Industry leader, dominant |
| Fiverr | ~20% (mostly from freelancer) | High-volume gig platform |
| Freelancer.com | ~13-23% | Lower end, with paid listings |
| Toptal | ~30-40% | Premium curated |
| Direct contract (no platform) | 0% | What we compete with for trust |

**Our positioning**: trust-as-a-service via on-chain escrow. We charge less than incumbents because:
1. Smart contract handles escrow → no claims-handling cost
2. No payment processor fees (USDC native)
3. Crypto-native users have higher trust in code than in courts

But we charge **more than 0%** because:
1. We provide UX abstraction (smart wallets, sponsored gas) that crypto-native direct contracts don't
2. We provide reputation, dispute resolution, profile discovery
3. Off-ramp + on-ramp infrastructure costs real money to maintain

5%+2% lands us in a sweet spot: ~3-4× cheaper than Upwork, but with positive unit economics.

## Unit economics — per-contract breakdown

Assume average contract size **$100 USD** on Base mainnet:

### Revenue (per contract)
- Client fee (5%): $5.00
- Freelancer fee (2%): $2.00
- **Total revenue**: $7.00

### Variable costs (per contract)
- Pimlico paymaster gas (5 sponsored UserOps × ~$0.005): $0.025
  - Fund escrow (1 op)
  - Submit work (no on-chain tx — just DB)
  - Approve / release (1 op from client + 1 op from freelancer claim)
  - Optional revisions / disputes
- Smart wallet first-time deployment (one-time, amortise over user's lifetime ~10 contracts): $0.001
- UploadThing storage (avg 2 attachments × 1MB): negligible at MVP
- Resend email notifications (3 emails per contract): $0.003
- **Total variable**: ~$0.03

### Fixed costs (monthly, amortised across contracts)
At 100 contracts/month: $0.50/contract amortised
At 1000 contracts/month: $0.05/contract amortised

| Item | Monthly cost |
|---|---|
| Vercel hosting (Pro) | $20 |
| Neon Postgres (Scale) | $19 |
| Privy (after free tier) | $99 |
| Resend (after free tier) | $20 |
| UploadThing | $10 |
| Sentry | $26 |
| Domain + misc | $10 |
| Founder time / support (1h/day @ $30/h) | $900 |
| **Total fixed** | **~$1,100/month** |

### Net margin per contract

At average $100 contract:
- Revenue: $7.00
- Variable cost: $0.03
- Fixed cost (1000 contracts/mo): $0.05 amortised
- Fixed cost (100 contracts/mo): $0.50 amortised
- **Margin (high-volume)**: $6.92 (98.9%)
- **Margin (low-volume)**: $6.47 (92.4%)

### Break-even

$1,100/month fixed cost ÷ $7 revenue/contract = **~157 contracts/month** at $100 average.

That's ~5 contracts/day. Doable in month 2-3 with light marketing.

### Sensitivity table

| Avg contract size | Combined fee | Revenue/contract | Break-even contracts/mo |
|---|---|---|---|
| $20 (small gig) | 7% | $1.40 | 786 |
| $50 | 7% | $3.50 | 314 |
| **$100 (assumed)** | **7%** | **$7.00** | **157** |
| $300 | 7% | $21.00 | 53 |
| $1,000 (premium) | 7% | $70.00 | 16 |

**Implication**: target users posting jobs in the **$50-$500 range** for fastest break-even.

### Scaling to $10K MRR

$10K / $7 = 1,429 contracts/month at $100 average = ~$143K GMV/month.
That's 48 contracts/day. Achievable in year 1 with PMF.

## Tiered fee experiment (post-MVP idea)

Once we have data, consider tiered fees instead of flat 7%:

| Contract size | Combined fee | Reasoning |
|---|---|---|
| < $20 | $1 flat | Tiny gigs would pay <$0.50 at 5% — not worth our gas costs |
| $20 – $500 | 7% | Sweet spot, default |
| $500 – $5,000 | 5% | Reduces psychological friction on bigger contracts |
| > $5,000 | 3% | Premium tier — competing with direct contracts |

This protects against the "5% on a $10,000 contract feels insulting" reaction while floor-protecting tiny gigs.

## Off-ramp strategy — without a legal entity yet

Transak (and Coinbase, MoonPay, Banxa, Onramp) require **business KYB**:
- Legal entity (PT in Indonesia, BV in Netherlands, LLC in US, etc.)
- Business bank account
- Privacy policy + terms reviewed
- AML/KYC procedures documented
- Sometimes: minimum monthly volume commitment

**You don't have this yet.** Realistic timeline for incorporation:
- PT (Perseroan Terbatas) Indonesia: 2-4 weeks, IDR 5-15jt cost
- PT PMA (foreign-owned PT): 1-2 months, IDR 15-30jt
- Singapore Pte Ltd: 1-2 weeks, ~$1,000 USD

### What you CAN do without legal entity (ship now)

**Option A: Manual exchange flow (zero cost, MVP-ready)**

Users withdraw USDC from smart wallet to **their own** Indodax / Pintu / Tokocrypto / Binance account, then sell to IDR there.

UI: just the "Send to crypto wallet" form (already built). Add a help tooltip:
> Don't have an exchange account? Sign up at [Indodax](https://indodax.com), [Pintu](https://pintu.co.id), or [Tokocrypto](https://tokocrypto.com). Withdraw USDC on Base network to your account's deposit address there.

This works today. No legal entity, no API, no compliance overhead. Users are "DIY-ing" the off-ramp.

**Pros**: ship in 0 days, zero compliance risk, users learn the ecosystem
**Cons**: friction for non-crypto users (they have to sign up for an exchange)

**Option B: P2P / payment links (gray zone, not recommended)**

Skip — too risky for compliance.

**Option C: Wait until incorporation, integrate Transak**

Once you have a legal entity, sign up at [transak.com/business](https://transak.com/business). Process:
1. Apply with KYB documents
2. They review (~1-2 weeks)
3. Issue API keys (test + prod)
4. Integrate Transak SDK widget (we already have placeholder UI)
5. Pre-fill widget with: walletAddress, asset=USDC, network=base, fiatCurrency=IDR

Transak gives you ~0.25-0.50% revenue share as the integrator. On $10K monthly off-ramp volume, that's $25-50/month — not a major revenue line, but covers the integration cost.

### Recommended sequence

1. **Now (week 0)**: Ship Option A. The "Withdraw → Send to crypto wallet" flow already works. Add Indonesian exchange names as helper text.
2. **Week 4-8**: Start incorporation paperwork in parallel with growth.
3. **Week 10-12**: Apply to Transak / MoonPay / Coinbase Pay. Start with one, expand later.
4. **Week 14+**: Transak widget live. Now you have BOTH paths (manual + automated).

## Other revenue streams to consider

### High-conviction (build year 1)
- **Featured job listings** — $5/week to boost a job to top of search. Pure margin (negligible cost). Pattern proven by Upwork, Fiverr.
- **Pro membership** — $9/month. Unlocks: advanced search filters, analytics dashboard, priority email support, badge on profile, no ads. Targets power-user freelancers who use the platform daily.

### Medium-conviction (test year 1)
- **Reputation NFTs** — completing 10/50/100 contracts auto-mints a tier badge NFT to the user's smart wallet. Free to user, but creates lock-in (NFT lives in their wallet, visible on their profile). Bonus: a tiny resale market on OpenSea is free marketing.
- **Off-ramp affiliate** — 0.25% kickback from Transak. Negligible until volume scales.

### Low-conviction (year 2+)
- **Yield on escrowed funds** — while $X is locked in escrow, deploy it to Aave or Morpho to earn ~3-5% APY on the float. Take half, share half with users (or take all, if disclosure is upfront). At $1M GMV/month with 14-day average escrow time, that's ~$5K/year of yield. Adds smart contract risk + audit cost.
- **B2B API** — let other apps post jobs to Forj via API for a higher fee (15-20%). Acts as a freelancer marketplace aggregator.
- **Insurance / dispute bond** — for premium contracts >$1K, optional 0.5% bond that pays out within 24h if dispute decision goes against the bondholder. Insurance is a real product category with strong margins.

## Decisions to make NOW

Before we change the contract code:

1. **Confirm the fee split**: 5%/2% or 7%/0% or 10% combined elsewhere?
2. **Set platform fee recipient**: currently `PLATFORM_FEE_RECIPIENT=0x7B3E…d8322`. Is this your personal wallet or a multisig? Recommend a multisig (Safe) for production.
3. **Withdraw flow MVP**: ship Option A only (manual exchange) for now? Or also start Transak conversation in parallel?

Once you confirm, the contract fee logic in `WorkChainEscrow.sol` needs to mirror this structure (currently it's a single `platformFeeBps` — would need to add `freelancerFeeBps` for the split).
