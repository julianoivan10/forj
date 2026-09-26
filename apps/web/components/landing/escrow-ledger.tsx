import { FEES, feeExample, formatUsdc } from './chain-facts';

const example = feeExample(1_000n);

const STEPS = [
  { label: 'Job posted', actor: 'Client', meta: 'Landing page rebuild · fixed price' },
  { label: 'Proposal accepted', actor: 'Client', meta: `${formatUsdc(example.amount)} USDC · 14 days` },
  { label: 'Escrow funded', actor: 'Client wallet', meta: `${formatUsdc(example.deposit)} USDC locked` },
  { label: 'Work delivered', actor: 'Freelancer', meta: `3 files · ${FEES.reviewDays}-day review window` },
  { label: 'Approved', actor: 'Client', meta: 'release() signed' },
  { label: 'Paid', actor: 'ForjEscrow', meta: `${formatUsdc(example.payout)} USDC → freelancer` },
] as const;

/**
 * The hero visual: one contract moving through its lifecycle, rendered as
 * a ledger rather than an illustration. Rows reveal in sequence with a
 * CSS-only animation (`.ledger-*` in globals.css); with reduced motion the
 * final state renders immediately.
 */
export function EscrowLedger() {
  return (
    <figure
      className="relative border border-[var(--color-border-strong)] bg-[var(--color-background-secondary)]"
      aria-label="Example contract lifecycle"
    >
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
        <span>Contract #0042</span>
        <span>Example</span>
      </header>

      <ol className="relative px-5 py-2">
        {/* Progress rail: a static track plus a fill that grows with the rows. */}
        <span aria-hidden className="absolute top-6 bottom-6 left-[1.9rem] w-px bg-[var(--color-border-default)]" />
        <span
          aria-hidden
          className="ledger-rail absolute top-6 bottom-6 left-[1.9rem] w-px bg-[var(--color-brand-primary)]"
        />
        {STEPS.map((step, i) => {
          const last = i === STEPS.length - 1;
          return (
            <li
              key={step.label}
              className="ledger-row relative grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-4 py-3"
              style={{ '--i': i } as React.CSSProperties}
            >
              <span
                aria-hidden
                className={
                  last
                    ? 'relative z-10 mt-1 size-2.5 justify-self-center bg-[var(--color-brand-primary)] ring-4 ring-[var(--color-glow-brand)]'
                    : 'relative z-10 mt-1 size-2.5 justify-self-center border border-[var(--color-brand-primary)] bg-[var(--color-background-secondary)]'
                }
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-display text-[15px] font-semibold text-[var(--color-text-primary)]">
                    {step.label}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                    {step.actor}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
                  {step.meta}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <figcaption className="grid grid-cols-3 border-t border-[var(--color-border-default)] font-mono text-[11px] text-[var(--color-text-tertiary)]">
        <span className="border-r border-[var(--color-border-default)] px-4 py-3">
          Client fee
          <span className="mt-0.5 block text-[var(--color-text-primary)]">{FEES.clientLabel}</span>
        </span>
        <span className="border-r border-[var(--color-border-default)] px-4 py-3">
          Freelancer fee
          <span className="mt-0.5 block text-[var(--color-text-primary)]">{FEES.freelancerLabel}</span>
        </span>
        <span className="px-4 py-3">
          Settles in
          <span className="mt-0.5 block text-[var(--color-text-primary)]">USDC</span>
        </span>
      </figcaption>
    </figure>
  );
}
