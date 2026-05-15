'use client';

import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Fingerprint,
  CreditCard,
  Award,
  Zap,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Smart Escrow',
    description:
      'Funds are locked in an audited smart contract on Base. Released only when work is approved — no trust required.',
    color: 'var(--color-brand-primary)',
    glowColor: 'rgba(0, 212, 255, 0.12)',
    span: 'lg:col-span-2 lg:row-span-2',
    large: true,
  },
  {
    icon: Fingerprint,
    title: 'Hybrid Auth',
    description:
      'Sign in with email, Google, or wallet. We auto-create an embedded wallet so everyone is Web3-ready.',
    color: 'var(--color-brand-secondary)',
    glowColor: 'rgba(124, 58, 237, 0.12)',
    span: 'lg:col-span-1',
    large: false,
  },
  {
    icon: CreditCard,
    title: 'Fiat On-Ramp',
    description:
      'Fund escrow with credit card or bank transfer via Transak. Converted to USDC automatically.',
    color: 'var(--color-success)',
    glowColor: 'rgba(0, 255, 148, 0.1)',
    span: 'lg:col-span-1',
    large: false,
  },
  {
    icon: Award,
    title: 'On-Chain Reputation',
    description:
      'Every completed job mints a Soulbound Token. Your track record is permanent, portable, and verifiable.',
    color: '#FFD700',
    glowColor: 'rgba(255, 215, 0, 0.1)',
    span: 'lg:col-span-1',
    large: false,
  },
  {
    icon: Zap,
    title: 'Instant Settlement',
    description:
      'No 14-day holds. Payment releases the moment work is approved — directly to your wallet.',
    color: 'var(--color-brand-primary)',
    glowColor: 'rgba(0, 212, 255, 0.1)',
    span: 'lg:col-span-1',
    large: false,
  },
  {
    icon: Scale,
    title: 'Dispute Resolution',
    description:
      'Disagreements are handled fairly with built-in dispute mechanisms. Transparent process, verifiable outcomes.',
    color: 'var(--color-warning)',
    glowColor: 'rgba(255, 184, 0, 0.1)',
    span: 'lg:col-span-1',
    large: false,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-medium uppercase tracking-widest text-[var(--color-brand-primary)]">
            Features
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            Everything you need to work trustlessly
          </h2>
        </motion.div>

        {/* Bento Grid */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className={cn(
                'group relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 transition-all duration-300',
                'hover:border-[var(--color-border-strong)] hover:-translate-y-1 hover:shadow-lg',
                feature.span,
                feature.large && 'p-8',
              )}
            >
              {/* Glow on hover */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(400px circle at top left, ${feature.glowColor}, transparent 70%)`,
                }}
              />

              <div className="relative z-10">
                <div
                  className="mb-4 flex size-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)]"
                  style={{ boxShadow: `0 0 20px ${feature.glowColor}` }}
                >
                  <feature.icon className="size-5" style={{ color: feature.color }} />
                </div>
                <h3
                  className={cn(
                    'font-display font-semibold tracking-tight text-[var(--color-text-primary)]',
                    feature.large ? 'text-xl' : 'text-lg',
                  )}
                >
                  {feature.title}
                </h3>
                <p
                  className={cn(
                    'mt-2 leading-relaxed text-[var(--color-text-secondary)]',
                    feature.large ? 'text-base' : 'text-sm',
                  )}
                >
                  {feature.description}
                </p>

                {/* Extra content for the large card */}
                {feature.large && (
                  <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background)]/50 p-4">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                      <span>Escrow Contract</span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block size-1.5 rounded-full bg-[var(--color-success)]" />
                        Verified
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {['Created', 'Funded', 'In Progress', 'Completed'].map((status, si) => (
                        <div key={status} className="flex items-center gap-3">
                          <div
                            className={cn(
                              'size-3 rounded-full border-2',
                              si <= 2
                                ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]'
                                : 'border-[var(--color-border-strong)] bg-transparent',
                            )}
                          />
                          <span
                            className={cn(
                              'text-sm',
                              si <= 2
                                ? 'text-[var(--color-text-primary)]'
                                : 'text-[var(--color-text-tertiary)]',
                            )}
                          >
                            {status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
