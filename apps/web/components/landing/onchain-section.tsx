import { ArrowUpRight } from 'lucide-react';
import { CHAIN, FEES, shortAddress } from './chain-facts';
import { SectionHeading } from './section-heading';

function ExplorerLink({ address }: { address: string }) {
  return (
    <a
      href={`${CHAIN.explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-sm text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-brand-primary)]"
    >
      {shortAddress(address)}
      <ArrowUpRight className="size-3.5" aria-hidden />
      <span className="sr-only">(opens block explorer)</span>
    </a>
  );
}

export function OnchainSection() {
  const rows: Array<[string, React.ReactNode]> = [
    ['Network', `${CHAIN.networkName} (chain ${CHAIN.id})`],
    ['Settlement token', CHAIN.usdc ? <ExplorerLink address={CHAIN.usdc} /> : 'USDC'],
    ['Escrow contract', CHAIN.escrow ? <ExplorerLink address={CHAIN.escrow} /> : 'Not yet deployed'],
    ['Fees', `${FEES.clientLabel} client · ${FEES.freelancerLabel} freelancer`],
    ['Review window', `${FEES.reviewDays} days after delivery`],
    [
      'Arbitration',
      CHAIN.isMainnet
        ? 'Designated arbiter, bounded by the contract'
        : 'Forj team key during testnet, bounded by the contract',
    ],
    ['Revisions', 'Up to 2 per contract'],
    ['Sign-in', 'Email, Google, X or your own wallet'],
  ];

  return (
    <section aria-labelledby="onchain" className="py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <SectionHeading id="onchain" index="04" label="Built on-chain" title="What’s on-chain, and what isn’t." />
          <p className="mt-6 text-lg leading-relaxed text-[var(--color-text-secondary)] text-pretty">
            Money moves through the escrow contract: deposits, releases, refunds and arbitration
            payouts. Everything else, like job posts, proposals, messages, files, milestones and
            reviews, runs on Forj’s servers.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-text-tertiary)]">
            In a dispute the arbiter can only choose how the work amount is split between client
            and freelancer. The fee is capped at what was agreed, and if the arbiter misses its
            deadline the contract applies a 50/50 split with no fee.
          </p>
        </div>

        <dl className="self-start border-t border-[var(--color-border-strong)] lg:col-span-6 lg:col-start-7">
          {rows.map(([term, value]) => (
            <div
              key={term}
              className="grid gap-1 border-b border-[var(--color-border-default)] py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6"
            >
              <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)] sm:pt-0.5">
                {term}
              </dt>
              <dd className="text-[15px] text-[var(--color-text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
