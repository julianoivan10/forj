import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Hammer, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Forj is a freelance marketplace where the contract between a client and a freelancer lives on-chain. Trust without paperwork.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-primary)]">
          About
        </p>
        <h1 className="mt-3 font-display text-[clamp(2.4rem,6vw,4rem)] font-extrabold leading-[1.02] tracking-tight text-[var(--color-text-primary)]">
          Trust used to be a contract.
          <br />
          Now it&rsquo;s code.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
          Forj is a freelance marketplace where the agreement between a client
          and a freelancer is enforced by a smart contract on the Base network.
          No chargebacks, no platform-controlled holds, no &ldquo;funds will be
          released in 30 business days&rdquo; — just code that does what it
          says.
        </p>
      </header>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        <Pillar
          icon={Shield}
          title="Escrow that can&rsquo;t be paused"
          body="USDC is locked in a smart contract the moment a job is funded. Forj cannot freeze it. Only the parties — or, in deadlock, the on-chain arbiter — can move it."
        />
        <Pillar
          icon={Sparkles}
          title="Reputation you take with you"
          body="Every completed contract, every review, every payout is on-chain. Your portfolio isn&rsquo;t locked inside a marketplace — anyone with the URL can verify it."
        />
        <Pillar
          icon={Hammer}
          title="Built for non-crypto users"
          body="Sign in with email. Skip MetaMask. We sponsor your gas. The Web3 plumbing is invisible — you just get a receipt that&rsquo;s impossible to forge."
        />
      </div>

      <section className="mt-20 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-8 sm:p-12">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          What &ldquo;forged&rdquo; means here
        </h2>
        <div className="mt-5 grid gap-6 text-[var(--color-text-secondary)] sm:grid-cols-2">
          <p>
            A blacksmith doesn&rsquo;t apologise for honest work. They show the
            piece, the marks of the hammer, the heat that shaped it. Forj is the
            same idea applied to digital work: the receipt of what was done,
            visible, and impossible to forge later.
          </p>
          <p>
            We&rsquo;re building this for the freelancer who&rsquo;s tired of
            chasing invoices, the client who&rsquo;s tired of guessing whether a
            new freelancer will deliver, and anyone who&rsquo;d rather have a
            cryptographic receipt than a customer-support ticket.
          </p>
        </div>
      </section>

      <section className="mt-20 flex flex-col items-start gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-primary)]">
            Currently on testnet
          </p>
          <p className="mt-2 max-w-xl text-base text-[var(--color-text-primary)]">
            We&rsquo;re shipping the platform on Base Sepolia first so we can
            iterate without real money on the line. Mainnet rollout follows
            once the testnet flow is fully green.
          </p>
        </div>
        <Link href="/jobs">
          <Button>
            Browse jobs
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </section>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6">
      <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)]">
        <Icon className="size-5 text-[var(--color-brand-primary)]" />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {body}
      </p>
    </div>
  );
}
