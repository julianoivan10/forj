import { SectionHeading } from './section-heading';

const PILLARS = [
  {
    title: 'Escrow before work',
    body: 'The client locks USDC in the ForjEscrow contract before anything starts. Forj never holds the funds in a company account.',
  },
  {
    title: 'Payment you can check',
    body: 'Every deposit and release is a Base transaction with a public receipt. Both fees are shown before anyone signs.',
  },
  {
    title: 'Milestone tracking',
    body: 'Split a contract into stages and deliver them in order, so both sides agree on progress. Payment is released when the client approves the contract.',
  },
  {
    title: 'A record that travels',
    body: 'Each completed contract gets a public proof page linked to its on-chain release, so your track record isn’t locked inside one platform.',
  },
] as const;

export function TrustGapSection() {
  return (
    <section aria-labelledby="trust-gap" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="trust-gap"
          index="01"
          label="Why Forj"
          title="Work without the trust gap."
        />
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)] text-pretty">
          Freelancers worry about getting paid. Clients worry about getting the work. Forj puts
          the money where both sides can see it, before either side takes a risk.
        </p>

        <ol className="mt-14 grid border-t border-[var(--color-border-strong)] sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar, i) => (
            <li
              key={pillar.title}
              className="border-b border-[var(--color-border-default)] py-8 sm:px-6 sm:odd:pl-0 lg:border-b-0 lg:border-l lg:first:border-l-0 lg:first:pl-0 lg:px-6"
            >
              <span className="font-mono text-xs text-[var(--color-brand-primary)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                {pillar.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
                {pillar.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
