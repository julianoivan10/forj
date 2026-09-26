import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CHAIN } from './chain-facts';
import { EscrowLedger } from './escrow-ledger';
import { landingLinkPrimary, landingLinkSecondary } from './section-heading';

export function Hero() {
  return (
    <section className="relative border-b border-[var(--color-border-default)] pt-28 pb-16 sm:pt-32 lg:pb-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <div className="lg:col-span-7 lg:pt-6">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
            <span aria-hidden className="size-1.5 bg-[var(--color-brand-primary)]" />
            {CHAIN.stageLabel}
          </p>

          <h1 className="mt-6 font-display text-[clamp(3rem,9vw,7rem)] leading-[0.9] font-semibold tracking-[-0.045em] text-[var(--color-text-primary)]">
            Work,
            <br />
            <span className="text-[var(--color-brand-primary)]">forged</span> in trust.
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)] text-pretty">
            A freelance marketplace where the payment is locked in escrow before work starts,
            released when the client approves, and recorded on Base as part of your history.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/jobs" className={landingLinkPrimary}>
              Find work
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/jobs/post" className={landingLinkSecondary}>
              Post a job
            </Link>
          </div>

          <dl className="mt-14 grid max-w-xl grid-cols-3 gap-x-4 border-t border-[var(--color-border-default)] pt-5">
            {[
              ['Custody', 'Smart contract'],
              ['Settlement', 'USDC'],
              ['Network', CHAIN.networkName],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                  {term}
                </dt>
                <dd className="mt-1 font-display text-sm leading-snug font-semibold text-[var(--color-text-primary)] sm:text-lg">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-5">
          <EscrowLedger />
        </div>
      </div>
    </section>
  );
}
