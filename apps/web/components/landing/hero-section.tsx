'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Coins,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

import { PLATFORM_FEE_LABEL } from '@/lib/constants';

/**
 * Hero section.
 *
 * Design intent:
 *   The previous hero was a generic "headline + CTAs + stats grid" SaaS
 *   template that could belong to any startup. Here we:
 *
 *   1. Lead with the value prop in plain English ("Trust Built In") — but
 *      pair it with a visual demonstration on the right (the proof card).
 *      Showing > telling: visitors *see* an on-chain receipt instead of
 *      reading bullet points about it.
 *
 *   2. Fix the original CTA mismatch — "Find Talent" linked to `/jobs`
 *      which is the freelancer-side browse page, not the client-side
 *      hire page. Now: "Browse open jobs" (freelancer) + "Hire on-chain"
 *      (client).
 *
 *   3. Pair the heading with the brand stat row directly underneath
 *      rather than as a separate boxed grid — softer, more editorial,
 *      less "metric template".
 *
 *   4. Replace the dot grid with layered radial gradients tinted in
 *      brand colours. Adds depth and a sense that the whole surface is
 *      "alive" without using any imagery.
 */

const STATS = [
  { label: 'Platform fee', value: PLATFORM_FEE_LABEL },
  { label: 'Settlement', value: 'USDC' },
  { label: 'Network', value: 'Base' },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
      {/* Bauhaus motif background:
            - Two layered radial washes (vermillion + cobalt) for warmth
            - A large saffron triangle floats off the top-right corner
            - A cobalt circle anchors the bottom-left
            - Dot grid carries texture without competing for attention
          The geometric primitives belong to the brand language we set up
          in JobCoverFallback — keeping the hero in the same family. */}
      <div className="pointer-events-none absolute inset-0">
        {/* Soft colour washes */}
        <div className="absolute -top-32 left-1/2 h-[680px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-glow-brand-strong),transparent_70%)] blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[700px] rounded-full bg-[radial-gradient(closest-side,var(--color-glow-violet),transparent_70%)] blur-3xl" />
        <div className="absolute -bottom-20 -left-32 h-[420px] w-[620px] rounded-full bg-[radial-gradient(closest-side,var(--color-glow-brand),transparent_70%)] blur-3xl" />

        {/* Geometric primitives — only render at lg+ so mobile stays clean */}
        <svg
          aria-hidden
          viewBox="0 0 1440 800"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 hidden size-full lg:block"
        >
          {/* Saffron triangle, top-right, low opacity */}
          <polygon
            points="1440,0 1440,260 1200,0"
            fill="var(--color-brand-accent)"
            opacity="0.08"
          />
          {/* Cobalt circle, bottom-left */}
          <circle
            cx="120"
            cy="720"
            r="180"
            fill="var(--color-brand-secondary)"
            opacity="0.06"
          />
          {/* Vermillion thin slab, mid-right — echoes the anvil base on the logo */}
          <rect
            x="1200"
            y="540"
            width="240"
            height="6"
            fill="var(--color-brand-primary)"
            opacity="0.4"
          />
        </svg>

        <div className="dot-grid absolute inset-0 opacity-[0.18]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          {/* Left column: copy */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-start text-left"
          >
            <motion.span
              variants={itemVariants}
              className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3.5 py-1 text-xs font-medium text-[var(--color-brand-primary)]"
            >
              <span className="relative inline-flex">
                <span className="inline-block size-2 rounded-full bg-[var(--color-brand-primary)]" />
                <span className="absolute inset-0 inline-block size-2 animate-ping rounded-full bg-[var(--color-brand-primary)] opacity-75" />
              </span>
              Live on Base &middot; Open beta
            </motion.span>

            <motion.h1
              variants={itemVariants}
              className="mt-6 font-display text-[clamp(2.4rem,5.5vw,4.25rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-[var(--color-text-primary)]"
            >
              Work,{' '}
              <span className="relative inline-block">
                <span className="text-gradient-brand">forged in trust.</span>
                {/* Hand-drawn cobalt slab underline — Bauhaus mark over
                    the punchline word, gives the headline a craft-pressed
                    feel rather than corporate gradient text. */}
                <span
                  aria-hidden
                  className="absolute -bottom-1 left-0 right-0 h-1.5 rounded-full bg-[var(--color-brand-secondary)]/35"
                />
              </span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="mt-6 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg"
            >
              Smart-contract escrow holds the payment until the work lands.
              Reviews and receipts live on-chain, so a freelancer&rsquo;s track
              record follows them anywhere. No middlemen, no withdrawal queues —
              just{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">
                a receipt that can&rsquo;t be forged later.
              </span>
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
            >
              <Link
                href="/jobs"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-6 text-sm font-semibold text-[#FFFFFF] shadow-[0_0_28px_var(--color-glow-brand)] transition-all duration-200 hover:bg-[#c73e1d] hover:shadow-[0_0_50px_var(--color-glow-brand-strong)] active:scale-[0.97]"
              >
                Browse open jobs
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/jobs/post"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)]/70 px-6 text-sm font-medium text-[var(--color-text-primary)] backdrop-blur-sm transition-all duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-background-tertiary)] active:scale-[0.97]"
              >
                <Briefcase className="size-4 text-[var(--color-brand-primary)]" />
                Hire on-chain
              </Link>
            </motion.div>

            {/* Stat row — flat editorial style instead of boxed grid */}
            <motion.dl
              variants={itemVariants}
              className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3"
            >
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                    {stat.label}
                  </dt>
                  <dd className="mt-0.5 font-display text-xl font-bold text-[var(--color-text-primary)]">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </motion.dl>
          </motion.div>

          {/* Right column: live proof card mock */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative hidden lg:block"
          >
            <ProofCardMock />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/**
 * Static visual mock of the public proof page (`/proof/[id]`). Communicates
 * the platform's main differentiator (cryptographic receipts) at a glance,
 * so visitors leave the hero understanding *what* Forj does that
 * Fiverr can't. Not interactive — clicks scroll to /jobs.
 */
function ProofCardMock() {
  return (
    <div className="relative">
      {/* Floating glow behind card */}
      <div className="absolute -inset-6 -z-10 rounded-[var(--radius-xl)] bg-gradient-to-br from-[var(--color-glow-brand)] via-[var(--color-glow-violet)] to-transparent opacity-60 blur-3xl" />

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-background-secondary)]/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-primary)]">
            <ShieldCheck className="size-3.5" />
            Verified on Forj
          </span>
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
            <CheckCircle2 className="size-3" />
            Completed
          </span>
        </div>

        <p className="mt-4 font-display text-lg font-bold leading-tight text-[var(--color-text-primary)]">
          Build a Next.js dashboard for an analytics startup
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <ProofStat icon={Coins} label="Total" value="$2,400" highlight={false} />
          <ProofStat icon={Sparkles} label="Paid out" value="$2,280" highlight />
        </div>

        <div className="mt-5 space-y-2.5 border-t border-[var(--color-border-subtle)] pt-4">
          <ProofRow label="Funded" hash="0xa3b1…f7c2" />
          <ProofRow label="Released" hash="0xc04d…91a8" />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-4">
          <div className="flex -space-x-1.5">
            <div className="size-7 rounded-full border-2 border-[var(--color-background-secondary)] bg-gradient-to-br from-[#dc4c2a] to-[#f2c14e]" />
            <div className="size-7 rounded-full border-2 border-[var(--color-background-secondary)] bg-gradient-to-br from-[#2e4fe0] to-[#dc4c2a]" />
          </div>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            Two-sided review · 5★
          </span>
        </div>
      </div>
    </div>
  );
}

function ProofStat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'rounded-[var(--radius-md)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-3'
          : 'rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40 p-3'
      }
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function ProofRow({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="inline-flex items-center gap-1 font-mono text-[var(--color-brand-primary)]">
        {hash}
        <ExternalLink className="size-3 opacity-60" />
      </span>
    </div>
  );
}
