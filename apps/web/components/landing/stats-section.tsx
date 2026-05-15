'use client';

import { motion } from 'framer-motion';

import { PLATFORM_FEE_LABEL } from '@/lib/constants';

const METRICS = [
  {
    value: PLATFORM_FEE_LABEL,
    label: 'Platform Fee',
    hint: 'vs 10–20% on legacy platforms',
  },
  {
    value: '< 60s',
    label: 'Payment Release',
    hint: 'on-chain, after client approval',
  },
  {
    value: '100%',
    label: 'USDC Settlement',
    hint: 'no volatility, no chargebacks',
  },
  {
    value: '0',
    label: 'Middlemen',
    hint: 'funds go directly from client to you',
  },
];

const INFRASTRUCTURE = [
  { name: 'Base', sub: 'L2 Network' },
  { name: 'USDC', sub: 'Circle' },
  { name: 'Privy', sub: 'Auth' },
  { name: 'Coinbase Wallet', sub: 'Smart Wallet' },
  { name: 'Neon', sub: 'Postgres' },
];

export function StatsSection() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Powered by strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-20 text-center"
        >
          <p className="text-sm font-medium uppercase tracking-widest text-[var(--color-text-tertiary)]">
            Powered by proven infrastructure
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 sm:gap-x-14">
            {INFRASTRUCTURE.map((item) => (
              <div key={item.name} className="flex flex-col items-center opacity-60 transition-opacity duration-200 hover:opacity-100">
                <span className="font-display text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
                  {item.name}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)]">
                  {item.sub}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-medium uppercase tracking-widest text-[var(--color-brand-primary)]">
            Built different
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            The numbers that actually matter
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            Not adoption metrics — the structural advantages that make Forj fundamentally fairer than the freelance status quo.
          </p>
        </motion.div>

        {/* Value metrics */}
        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] px-6 py-8 text-center transition-all duration-200 hover:border-[var(--color-border-brand)]"
            >
              <span className="font-display text-[clamp(2rem,4vw,3.25rem)] font-extrabold tracking-tighter text-gradient-brand">
                {stat.value}
              </span>
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                {stat.label}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {stat.hint}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
