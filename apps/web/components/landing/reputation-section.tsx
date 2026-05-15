'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const TIERS = [
  {
    name: 'Bronze',
    emoji: '🥉',
    range: '1–5 jobs',
    score: '10–29',
    color: '#CD7F32',
    glow: 'rgba(205, 127, 50, 0.15)',
    benefits: ['Basic profile badge', 'Access to all jobs'],
  },
  {
    name: 'Silver',
    emoji: '🥈',
    range: '6–15 jobs',
    score: '30–59',
    color: '#C0C0C0',
    glow: 'rgba(192, 192, 192, 0.15)',
    benefits: ['Priority in search', 'Profile highlight'],
  },
  {
    name: 'Gold',
    emoji: '🥇',
    range: '16–30 jobs',
    score: '60–84',
    color: '#FFD700',
    glow: 'rgba(255, 215, 0, 0.15)',
    benefits: ['Featured profile', 'Early access to jobs', 'Reduced fees'],
  },
  {
    name: 'Diamond',
    emoji: '💎',
    range: '30+ jobs',
    score: '85–100',
    color: '#2E4FE0',
    glow: 'rgba(46, 79, 224, 0.22)',
    benefits: ['Top-tier badge', 'Maximum visibility', 'Lowest fees', 'Invite-only jobs'],
  },
];

export function ReputationSection() {
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
            Reputation System
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            Your reputation, owned by you
          </h2>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
            Every completed job mints a Soulbound Token on Base. Your WorkScore grows with each success — permanent, portable, and verifiable by anyone.
          </p>
        </motion.div>

        {/* Badge tiers */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="group relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 transition-all duration-300 hover:border-[var(--color-border-strong)] hover:-translate-y-1"
            >
              {/* Glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(300px circle at top center, ${tier.glow}, transparent 70%)`,
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{tier.emoji}</span>
                  <span
                    className="rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      color: tier.color,
                      borderColor: `${tier.color}40`,
                      backgroundColor: `${tier.color}10`,
                    }}
                  >
                    {tier.name}
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-[var(--color-text-tertiary)]">WorkScore</p>
                  <p className="font-display text-xl font-bold text-[var(--color-text-primary)]">
                    {tier.score}
                  </p>
                </div>

                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{tier.range}</p>

                <ul className="mt-4 space-y-1.5 border-t border-[var(--color-border-subtle)] pt-4">
                  {tier.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                      <span className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tier.color }} />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
