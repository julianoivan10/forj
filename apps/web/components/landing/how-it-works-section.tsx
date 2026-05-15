'use client';

import { motion } from 'framer-motion';
import { UserPlus, FileSearch, ShieldCheck, Banknote } from 'lucide-react';

const STEPS = [
  {
    icon: UserPlus,
    title: 'Sign Up & Create Profile',
    description: 'Connect with email, Google, or your wallet. Choose your role and set up your profile in minutes.',
    color: 'var(--color-brand-primary)',
  },
  {
    icon: FileSearch,
    title: 'Post or Find Work',
    description: 'Clients post jobs with clear budgets. Freelancers browse, filter, and submit compelling proposals.',
    color: 'var(--color-brand-secondary)',
  },
  {
    icon: ShieldCheck,
    title: 'Escrow & Build',
    description: 'Funds are locked in a smart-contract escrow. Work begins with full transparency and trust for both sides.',
    color: 'var(--color-brand-accent)',
  },
  {
    icon: Banknote,
    title: 'Get Paid Instantly',
    description: 'Client approves → payment releases automatically. On-chain reputation grows with every completed job.',
    color: 'var(--color-brand-primary)',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-20 sm:py-28">
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
            How It Works
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            From hire to pay in four simple steps
          </h2>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
            No intermediaries, no delays, no disputes left unresolved.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative mt-16">
          {/* Connector line — desktop */}
          <div className="absolute top-12 left-[calc(12.5%+24px)] right-[calc(12.5%+24px)] hidden h-px bg-gradient-to-r from-[var(--color-brand-primary)]/30 via-[var(--color-brand-secondary)]/30 to-[var(--color-brand-primary)]/30 lg:block" />

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="relative flex flex-col items-center text-center"
              >
                {/* Step number + icon */}
                <div className="relative z-10 mb-6">
                  <div
                    className="flex size-12 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]"
                    style={{
                      boxShadow: `0 0 30px ${step.color}20`,
                    }}
                  >
                    <step.icon className="size-5" style={{ color: step.color }} />
                  </div>
                  {/* Step number badge */}
                  <span
                    className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: step.color }}
                  >
                    {i + 1}
                  </span>
                </div>

                <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
