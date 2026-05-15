'use client';

import { motion } from 'framer-motion';
import { CreditCard, ArrowRight, Wallet, ShieldCheck, CheckCircle2 } from 'lucide-react';

const FLOW_STEPS = [
  {
    icon: CreditCard,
    label: 'Fiat Payment',
    sublabel: 'Credit card / Bank',
    color: 'var(--color-brand-secondary)',
    bg: 'rgba(124, 58, 237, 0.12)',
  },
  {
    icon: Wallet,
    label: 'Convert to USDC',
    sublabel: 'Via Transak',
    color: 'var(--color-brand-primary)',
    bg: 'rgba(0, 212, 255, 0.12)',
  },
  {
    icon: ShieldCheck,
    label: 'Smart Escrow',
    sublabel: 'On Base chain',
    color: 'var(--color-warning)',
    bg: 'rgba(255, 184, 0, 0.1)',
  },
  {
    icon: CheckCircle2,
    label: 'Freelancer Paid',
    sublabel: 'Instant release',
    color: 'var(--color-success)',
    bg: 'rgba(0, 255, 148, 0.1)',
  },
];

export function PaymentFlowSection() {
  return (
    <section className="relative py-20 sm:py-28">
      {/* Background accent */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-brand-primary)]/[0.03] to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-medium uppercase tracking-widest text-[var(--color-brand-primary)]">
            Payment Flow
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            From credit card to crypto — seamlessly
          </h2>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
            Clients can pay with fiat. Freelancers receive USDC. Everyone benefits from blockchain transparency.
          </p>
        </motion.div>

        {/* Flow diagram */}
        <div className="relative mt-16">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-0">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                  className="flex w-[180px] flex-col items-center gap-3 sm:w-[200px]"
                >
                  <div
                    className="flex size-16 items-center justify-center rounded-[var(--radius-xl)] border border-[var(--color-border-default)]"
                    style={{
                      backgroundColor: step.bg,
                      boxShadow: `0 0 40px ${step.bg}`,
                    }}
                  >
                    <step.icon className="size-7" style={{ color: step.color }} />
                  </div>
                  <div className="text-center">
                    <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{step.sublabel}</p>
                  </div>
                </motion.div>

                {/* Arrow between steps */}
                {i < FLOW_STEPS.length - 1 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.1 }}
                    className="hidden px-2 sm:block"
                  >
                    <ArrowRight className="size-5 text-[var(--color-text-tertiary)]" />
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom pill */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mx-auto mt-12 flex max-w-lg items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] px-6 py-4"
        >
          <ShieldCheck className="size-5 shrink-0 text-[var(--color-success)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text-primary)]">5% platform fee</span>
            {' '}— only charged when work is completed and payment is released.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
