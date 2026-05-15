'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Briefcase } from 'lucide-react';

export function CtaSection() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)]"
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-brand-primary)]/10 via-[var(--color-background-secondary)] to-[var(--color-brand-secondary)]/10" />
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-20" />

          {/* Glow orbs */}
          <div className="pointer-events-none absolute -top-20 -left-20 h-[300px] w-[300px] rounded-full bg-[var(--color-brand-primary)]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-[var(--color-brand-secondary)]/10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center px-6 py-16 text-center sm:px-12 sm:py-20">
            <h2 className="font-display text-[clamp(1.8rem,5vw,3rem)] font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)]">
              Ready to work on{' '}
              <span className="text-gradient-brand">the chain of trust?</span>
            </h2>

            <p className="mt-6 max-w-xl text-lg text-[var(--color-text-secondary)]">
              Be among the first to build a freelance career on trustless rails — transparent, fair, and decentralized from day one.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-14 items-center gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-brand-primary)] px-8 text-base font-semibold text-white shadow-[0_0_30px_var(--color-glow-brand)] transition-all duration-200 hover:bg-[#c73e1d] hover:shadow-[0_0_60px_var(--color-glow-brand-strong)] active:scale-[0.97]"
              >
                Get Started Free
                <ArrowRight className="size-5" />
              </Link>
              <Link
                href="/jobs"
                className="inline-flex h-14 items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)]/80 px-8 text-base font-medium text-[var(--color-text-primary)] backdrop-blur-sm transition-all duration-200 hover:border-[var(--color-border-strong)] active:scale-[0.97]"
              >
                <Briefcase className="size-5 text-[var(--color-brand-primary)]" />
                Browse Jobs
              </Link>
            </div>

            <p className="mt-6 text-sm text-[var(--color-text-tertiary)]">
              No credit card required · Free to join · Start in 2 minutes
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
