import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  HandCoins,
  ShieldCheck,
  Star,
  Upload,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Step-by-step: how a job goes from posted, to funded, to released — all on-chain, with no platform-controlled holds.',
};

const STEPS = [
  {
    icon: UserPlus,
    title: 'Sign up with email',
    body: "We provision a smart wallet for you behind the scenes. No browser extensions, no seed phrase. You don't need to know what 'gas' is.",
  },
  {
    icon: FileText,
    title: 'Post a job — or apply',
    body: "Clients describe the work and a USDC budget. Freelancers submit a proposal with their bid, timeline, and (optionally) a milestone breakdown.",
  },
  {
    icon: Coins,
    title: 'Fund the escrow in USDC',
    body: "When you accept a proposal, the client moves USDC into the on-chain escrow. The smart contract holds it — Forj never touches the funds.",
  },
  {
    icon: Upload,
    title: 'Submit the work',
    body: "The freelancer ships deliverables (text, files, links). The client gets 7 days to review. If they go silent, the freelancer can claim release automatically.",
  },
  {
    icon: HandCoins,
    title: 'Release on approval',
    body: "Client clicks Approve → smart contract releases USDC to the freelancer's wallet, minus the platform fee. ~3 seconds, no bank.",
  },
  {
    icon: Star,
    title: 'Reviews live on-chain',
    body: "Both parties leave a review. Together with the on-chain receipt, this becomes part of your portable reputation. Take it anywhere.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-primary)]">
          How it works
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--color-text-primary)]">
          Six steps from &ldquo;hello&rdquo; to paid.
        </h1>
        <p className="mt-4 text-base text-[var(--color-text-secondary)] sm:text-lg">
          Forj packages the messy parts of a freelance contract — escrow,
          chargebacks, dispute resolution, reputation — into a flow that
          looks like any other product, but settles on-chain.
        </p>
      </header>

      <ol className="mt-14 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
          >
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)]">
                  <s.icon className="size-5 text-[var(--color-brand-primary)]" />
                </div>
                <span className="absolute -right-1.5 -top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-brand-primary)] font-display text-[11px] font-bold text-[#14130E]">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {s.body}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-20 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-8 sm:p-12">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          What if something goes wrong?
        </h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <DisputeCard
            title="The freelancer goes silent"
            body="The escrow has a deadline. After it passes, the client can refund themselves — funds return automatically."
          />
          <DisputeCard
            title="The client goes silent after submission"
            body="Auto-release. Seven days after work is submitted, anyone can trigger the release. Funds go to the freelancer."
          />
          <DisputeCard
            title="Genuine disagreement on quality"
            body="Either party raises a dispute. Funds freeze on-chain. An arbiter reviews evidence from both sides and splits the funds."
          />
          <DisputeCard
            title="Client wants revisions"
            body="Request a revision before approving. The freelancer fixes and re-submits. Auto-release timer resets each cycle."
          />
        </div>
      </section>

      <section className="mt-12 flex flex-col items-start gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <h3 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
            Ready to try the flow?
          </h3>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-secondary)]">
            Browse open jobs, or post one. Testnet is free — you can experience
            the full flow with no real money on the line.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jobs">
            <Button>
              Browse jobs
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="/jobs/post">
            <Button variant="secondary">Post a job</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function DisputeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--color-brand-primary)]" />
      <div>
        <h4 className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </h4>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{body}</p>
      </div>
    </div>
  );
}

// CheckCircle2 imported but only kept here so future "step done" badges
// can re-use it without re-importing. Tree-shaking keeps the bundle clean.
void CheckCircle2;
