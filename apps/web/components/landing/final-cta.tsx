import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CHAIN } from './chain-facts';
import { landingLinkPrimary, landingLinkSecondary } from './section-heading';

export function FinalCta() {
  return (
    <section className="border-t border-[var(--color-border-strong)] bg-[var(--color-background-secondary)]">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
          <span className="text-[var(--color-brand-primary)]">06</span>
          <span aria-hidden> — </span>
          Get started
        </p>
        <h2 className="mt-4 max-w-4xl font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] text-balance">
          Start with one small contract.
        </h2>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className={landingLinkPrimary}>
            Create an account
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/how-it-works" className={landingLinkSecondary}>
            How it works
          </Link>
        </div>

        {!CHAIN.isMainnet && (
          <p className="mt-12 max-w-2xl border-l-2 border-[var(--color-brand-accent)] pl-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Forj is in public testnet on {CHAIN.networkName}. Contracts settle in test USDC, which
            has no monetary value. Read how{' '}
            <Link
              href="/help/disputes-and-recovery"
              className="text-[var(--color-text-primary)] underline underline-offset-4"
            >
              disputes and recovery
            </Link>{' '}
            work before you rely on them.
          </p>
        )}
      </div>
    </section>
  );
}
