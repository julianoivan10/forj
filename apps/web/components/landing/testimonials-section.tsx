'use client';

import { motion } from 'framer-motion';
import { Code2, Rocket, Palette, Megaphone } from 'lucide-react';

const USE_CASES = [
  {
    icon: Code2,
    persona: 'Developers',
    headline: 'Ship code, get paid — without the invoice dance.',
    bullets: [
      'Escrow funded before you write a line',
      'On-chain reputation moves with you',
      'Payout the moment work is approved',
    ],
  },
  {
    icon: Rocket,
    persona: 'Founders & Startups',
    headline: 'Hire globally with the same trust as hiring locally.',
    bullets: [
      'Fund once, release on delivery',
      'No platform-held balances or withheld payouts',
      'Dispute resolution with on-chain evidence',
    ],
  },
  {
    icon: Palette,
    persona: 'Designers',
    headline: 'Your portfolio, your rating, your money — yours.',
    bullets: [
      'Verifiable track record that is not platform-locked',
      'Tiered reputation from Bronze to Diamond',
      'USDC payouts with no currency conversion fees',
    ],
  },
  {
    icon: Megaphone,
    persona: 'Consultants & Agencies',
    headline: 'Milestone-based contracts that enforce themselves.',
    bullets: [
      'Split one engagement into funded milestones',
      'Client pays by card — you receive USDC',
      'Auto-release if client goes silent',
    ],
  },
];

export function TestimonialsSection() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-medium uppercase tracking-widest text-[var(--color-brand-primary)]">
            Who it&apos;s for
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            Built for independent professionals
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            Whether you bill by the hour, by the milestone, or by the project — Forj settles it the same way: fast, transparent, and trustless.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {USE_CASES.map((uc, i) => (
            <motion.div
              key={uc.persona}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="group relative flex flex-col rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-7 transition-all duration-200 hover:border-[var(--color-border-brand)]"
            >
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--color-brand-primary)]/15 to-[var(--color-brand-secondary)]/15 ring-1 ring-[var(--color-border-brand)]">
                  <uc.icon className="size-6 text-[var(--color-brand-primary)]" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">
                    For
                  </p>
                  <p className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                    {uc.persona}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-base font-medium leading-snug text-[var(--color-text-primary)]">
                {uc.headline}
              </p>

              <ul className="mt-4 space-y-2">
                {uc.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block size-1.5 flex-shrink-0 rounded-full bg-[var(--color-brand-primary)]"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
