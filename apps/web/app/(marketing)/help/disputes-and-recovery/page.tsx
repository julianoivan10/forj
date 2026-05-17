import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  HandCoins,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserX,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Disputes & recovery',
  description:
    'What to do when a contract stalls, the other party stops responding, or you suspect a dispute. Step-by-step guide for clients and freelancers.',
};

// Mini design-doc page. Tone matches /how-it-works: plain language,
// numbered steps, no jargon. Bulleted "do this / not that" inserts
// where the answer is "it depends" so the user actually gets a
// decision instead of marketing copy.
export default function DisputesAndRecoveryPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      {/* Hero */}
      <header className="text-center">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
          <ShieldCheck className="size-3.5" />
          On-chain safety net
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Disputes &amp; recovery
        </h1>
        <p className="mt-3 text-base text-[var(--color-text-secondary)]">
          What to do when a contract stalls, the other party stops
          responding, or you need to recover funds. Every path below
          works without our intervention — the escrow contract is the
          referee.
        </p>
      </header>

      {/* Decision tree */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
          Which situation matches yours?
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <DecisionCard
            icon={UserX}
            label="They went silent"
            href="#auto-release"
            body="Other party hasn't responded in days, you need to move on."
          />
          <DecisionCard
            icon={RefreshCw}
            label="Work isn't right"
            href="#revisions"
            body="Deliverable came in but doesn't match what you agreed."
          />
          <DecisionCard
            icon={ShieldAlert}
            label="It's broken"
            href="#dispute"
            body="Real disagreement — needs the arbiter to settle."
          />
        </div>
      </section>

      {/* Section 1 — auto-release */}
      <Section
        id="auto-release"
        icon={Clock}
        title="The other party went silent"
      >
        <p>
          Every funded escrow has a 7-day auto-release window. After work
          is submitted, the timer starts; if the counter-party doesn&apos;t
          act before it expires, the funds move to the side that&apos;s
          waiting. No support ticket, no platform decision.
        </p>

        <Branch
          who="If you're the freelancer"
          steps={[
            'Submit your work via the contract page. The submission timestamp starts the 7-day clock.',
            'Wait. Check back any time — the contract page shows a countdown.',
            'After 7 days with no client response, the "Claim release" button appears. Click it. Funds + your fee flow to your wallet in one transaction.',
          ]}
        />

        <Branch
          who="If you're the client"
          steps={[
            'If the freelancer hasn\'t submitted work AND the deadline has passed, you can refund the escrow before they submit — "Refund" button on the contract page.',
            "If they submitted work but went silent on revisions, you have two choices: approve their work as-is (releases funds), or open a dispute (arbiter decides the split).",
            'If you also went silent and the freelancer auto-released, the engagement is closed — no further action available.',
          ]}
        />

        <Callout tone="info">
          <strong>Why 7 days?</strong> Long enough that someone on holiday
          or a slow client review doesn&apos;t lose funds; short enough that
          a true ghost doesn&apos;t freeze your money indefinitely. The
          window is configurable per-contract in the v3 milestone escrow
          (coming soon).
        </Callout>
      </Section>

      {/* Section 2 — revisions */}
      <Section
        id="revisions"
        icon={RefreshCw}
        title="The work isn't right"
      >
        <p>
          Before opening a dispute, try a revision round — most "this
          isn&apos;t what I asked for" cases get resolved with one specific
          piece of feedback.
        </p>

        <Branch
          who="As the client"
          steps={[
            'Open the contract page. With work submitted, you have three buttons: Approve, Request revision, Open dispute.',
            'Pick "Request revision" and write a concrete diff. "The hero image needs to be 1200x630, not 800x600" is actionable; "doesn\'t feel right" isn\'t.',
            'The 7-day timer resets when the freelancer re-submits.',
            'You can request multiple revisions, but each one is a clock reset. Be specific so this doesn\'t drag forever.',
          ]}
        />

        <Callout tone="warning">
          The auto-release window resets on each revision submission.
          Don&apos;t leave revision requests open forever — the contract
          is locked until you approve, dispute, or accept the work via
          a re-submission you ignore.
        </Callout>
      </Section>

      {/* Section 3 — dispute */}
      <Section
        id="dispute"
        icon={ShieldAlert}
        title="There's a real disagreement"
      >
        <p>
          Disputes are the last resort. They&apos;re settled by a neutral
          arbiter (a multisig that controls the escrow contract&apos;s
          dispute resolution function). The arbiter chooses a split:
          some/all of the funds to the freelancer, some/all back to the
          client, with the platform fee taken from whichever side
          benefits.
        </p>

        <Branch
          who="To open a dispute"
          steps={[
            'On the contract page, click "Open dispute". The contract state moves to "Disputed" — no funds can move outside arbiter action.',
            'Both parties get an email + in-app notification with a link to the dispute thread.',
            'Submit your evidence: messages, deliverables, the original brief. The arbiter reads both sides.',
            'Resolution typically lands within 72 hours. You\'ll get an email with the outcome + a link to the on-chain transaction so you can verify the split yourself.',
          ]}
        />

        <Callout tone="warning">
          <strong>Disputes are permanent.</strong> Once opened, the
          contract can&apos;t go back to "submitted" / "in progress". The
          arbiter&apos;s split is the final state. Use revision requests
          first if there&apos;s any chance of a normal resolution.
        </Callout>
      </Section>

      {/* Section 4 — losing access */}
      <Section
        id="access"
        icon={ShieldCheck}
        title="You lost access to your account"
      >
        <p>
          Three layers of protection. Configure them BEFORE you need
          them — they only work if set up in advance.
        </p>

        <ul className="mt-4 space-y-3 text-sm text-[var(--color-text-secondary)]">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
              1
            </span>
            <div>
              <strong className="text-[var(--color-text-primary)]">
                Backup sign-in method.
              </strong>{' '}
              Link a second email or Google account in{' '}
              <Link
                href="/dashboard/settings?tab=security"
                className="text-[var(--color-brand-primary)] hover:underline"
              >
                Settings → Security
              </Link>
              . Losing your primary email no longer locks you out.
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
              2
            </span>
            <div>
              <strong className="text-[var(--color-text-primary)]">
                Wallet recovery passcode.
              </strong>{' '}
              Same settings page — &quot;Configure recovery&quot;.
              Privy stores a recovery option so you can re-derive your
              wallet from a different device.
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
              3
            </span>
            <div>
              <strong className="text-[var(--color-text-primary)]">
                Export your wallet.
              </strong>{' '}
              One-shot private key reveal. Import into MetaMask or a
              hardware wallet — from then on you own the key
              independently of us.
            </div>
          </li>
        </ul>

        <Callout tone="warning">
          If you&apos;ve already lost access AND none of the three layers
          were configured, contact support. Recovery requires proving
          your identity via on-chain history or off-chain ID, and goes
          through manual admin review with an audit trail.
        </Callout>
      </Section>

      {/* Funds-at-risk callout */}
      <section className="mt-12 rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-6">
        <div className="flex items-start gap-3">
          <HandCoins className="size-6 shrink-0 text-[var(--color-brand-primary)]" />
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              What&apos;s never at risk
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Funds inside a funded escrow. The contract doesn&apos;t
              depend on your account — it depends on your wallet
              signing. Worst case (you lose access mid-contract), the
              7-day auto-release moves funds to whichever party is
              still around to claim. Your reputation, history, and
              contract terms are all on-chain too, so they survive a
              login loss.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-12 text-center">
        <Link href="/dashboard/settings?tab=security">
          <Button leftIcon={<ShieldCheck />}>
            Configure recovery now
            <ArrowRight className="size-4" />
          </Button>
        </Link>
        <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
          30 seconds. Once. Then forget it&apos;s there.
        </p>
      </section>
    </article>
  );
}

function DecisionCard({
  icon: Icon,
  label,
  body,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-4 transition-colors hover:border-[var(--color-border-brand)]"
    >
      <Icon className="size-5 text-[var(--color-brand-primary)]" />
      <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
        {label}
      </p>
      <p className="text-xs text-[var(--color-text-secondary)]">{body}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] group-hover:text-[var(--color-brand-primary)]">
        Jump to <ArrowRight className="size-3" />
      </span>
    </a>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
          <Icon className="size-5" />
        </div>
        <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
          {title}
        </h2>
      </div>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {children}
      </div>
    </section>
  );
}

function Branch({ who, steps }: { who: string; steps: string[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/60 p-4">
      <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
        {who}
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-[var(--color-text-secondary)]">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: 'info' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4 text-sm text-[var(--color-text-secondary)]'
          : 'flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-4 text-sm text-[var(--color-text-secondary)]'
      }
    >
      <AlertTriangle
        aria-hidden
        className={
          tone === 'warning'
            ? 'mt-0.5 size-4 shrink-0 text-[var(--color-warning)]'
            : 'mt-0.5 size-4 shrink-0 text-[var(--color-text-tertiary)]'
        }
      />
      <div>{children}</div>
    </div>
  );
}
