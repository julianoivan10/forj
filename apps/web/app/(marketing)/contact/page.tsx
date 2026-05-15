import type { Metadata } from 'next';
import Link from 'next/link';
import { Github, Mail, MessageCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Forj team.',
};

const SUPPORT_EMAIL = 'hello@forj.work';

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-primary)]">
        Contact
      </p>
      <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.2rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--color-text-primary)]">
        We&rsquo;d love to hear from you.
      </h1>
      <p className="mt-4 max-w-2xl text-base text-[var(--color-text-secondary)]">
        Forj is in early access. Bug reports, feature ideas, partnership
        requests — drop us a line and a real human will respond, usually
        within a day.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <ContactTile
          icon={Mail}
          label="Email"
          value={SUPPORT_EMAIL}
          href={`mailto:${SUPPORT_EMAIL}`}
          hint="For everything — fastest path to a human."
        />
        <ContactTile
          icon={MessageCircle}
          label="Twitter"
          value="@forj"
          href="https://twitter.com/forj"
          hint="Public questions, product updates, banter."
        />
        <ContactTile
          icon={Github}
          label="GitHub"
          value="forj/forj"
          href="https://github.com/forj"
          hint="Smart contract source, issues, security disclosures."
        />
      </div>

      <section className="mt-16 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-8">
        <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
          Reporting a security issue
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Found a vulnerability in the smart contract or the platform? Please
          do <strong className="text-[var(--color-text-primary)]">not</strong>{' '}
          file a public GitHub issue — email{' '}
          <a
            href={`mailto:security@forj.work`}
            className="text-[var(--color-brand-primary)] underline-offset-4 hover:underline"
          >
            security@forj.work
          </a>{' '}
          with details and we&rsquo;ll triage within 24 hours. Responsible
          disclosures are eligible for a bounty once mainnet launches.
        </p>
      </section>

      <p className="mt-12 text-xs text-[var(--color-text-tertiary)]">
        Looking for the legal stuff? See{' '}
        <Link href="/terms" className="hover:text-[var(--color-text-secondary)]">
          Terms
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className="hover:text-[var(--color-text-secondary)]">
          Privacy
        </Link>
      </p>
    </div>
  );
}

function ContactTile({
  icon: Icon,
  label,
  value,
  href,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href: string;
  hint: string;
}) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="group flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5 transition-colors hover:border-[var(--color-border-brand)]"
    >
      <div className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] transition-colors group-hover:bg-[var(--color-glow-brand-strong)]">
        <Icon className="size-4 text-[var(--color-brand-primary)]" />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
      <p className="text-xs text-[var(--color-text-tertiary)]">{hint}</p>
    </a>
  );
}
