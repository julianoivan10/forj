import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FEES } from './chain-facts';

const FLOWS = [
  {
    id: 'clients',
    index: '02',
    label: 'For clients',
    title: 'Hire with the money already on the table.',
    steps: [
      ['Post a job', 'Describe the scope, budget and timeline. Freelancers apply with a price and plan.'],
      ['Compare proposals', 'Read each freelancer’s history and their proof pages from past contracts.'],
      ['Fund the escrow', `Sign once. The agreed amount plus a ${FEES.clientLabel} fee is held by the contract.`],
      ['Review and release', 'Approve the delivery to release payment, or ask for a revision. Disputes go to Forj arbitration.'],
    ],
    cta: { href: '/jobs/post', label: 'Post a job' },
  },
  {
    id: 'freelancers',
    index: '03',
    label: 'For freelancers',
    title: 'Start work knowing the payment exists.',
    steps: [
      ['Find work', 'Browse open jobs, or list a fixed-price service clients can order directly.'],
      ['Send a proposal', 'Quote your price and timeline, and split the work into milestones.'],
      ['Start when funded', 'The locked amount is visible on Base before you write a line.'],
      ['Deliver and get paid', `Released USDC goes to your wallet, minus a ${FEES.freelancerLabel} fee. The contract joins your record.`],
    ],
    cta: { href: '/jobs', label: 'Find work' },
  },
] as const;

export function WorkflowsSection() {
  return (
    <section className="border-y border-[var(--color-border-default)] bg-[var(--color-background-secondary)]">
      <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
        {FLOWS.map((flow, i) => (
          <div
            key={flow.id}
            aria-labelledby={`flow-${flow.id}`}
            className={
              i === 0
                ? 'px-4 py-20 sm:px-6 lg:border-r lg:border-[var(--color-border-default)] lg:py-24 lg:pr-12 lg:pl-8'
                : 'border-t border-[var(--color-border-default)] px-4 py-20 sm:px-6 lg:border-t-0 lg:py-24 lg:pr-8 lg:pl-12'
            }
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              <span className="text-[var(--color-brand-primary)]">{flow.index}</span>
              <span aria-hidden> — </span>
              {flow.label}
            </p>
            <h2
              id={`flow-${flow.id}`}
              className="mt-4 max-w-md font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] text-balance"
            >
              {flow.title}
            </h2>

            <ol className="mt-10">
              {flow.steps.map(([title, body], step) => (
                <li
                  key={title}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 border-t border-[var(--color-border-default)] py-5"
                >
                  <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                    {String(step + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
                      {title}
                    </h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <Link
              href={flow.cta.href}
              className="group mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)] underline decoration-[var(--color-brand-primary)] decoration-2 underline-offset-[6px]"
            >
              {flow.cta.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
