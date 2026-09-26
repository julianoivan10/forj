'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Github, Twitter } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';

/**
 * Footer link sections. Every entry resolves to a real route — placeholder
 * `#` links are deliberately not allowed here (they erode trust on a
 * platform that markets itself on transparency). When a destination
 * doesn't exist yet, prefer to drop the link entirely rather than leave
 * a dead anchor in the footer.
 *
 * `external: true` opens in a new tab + adds `rel="noreferrer"`.
 */
const FOOTER_SECTIONS = [
  {
    title: 'Platform',
    links: [
      { label: 'Browse jobs', href: '/jobs' },
      { label: 'Browse services', href: '/services' },
      { label: 'Post a job', href: '/jobs/post' },
      { label: 'How it works', href: '/how-it-works' },
    ],
  },
  {
    title: 'On-chain',
    links: [
      {
        label: 'Escrow contract',
        href: 'https://sepolia.basescan.org/address/0x079fe8805faac09fead18eb56a37967311e4cf8b',
        external: true,
      },
      { label: 'Base network', href: 'https://base.org', external: true },
      {
        label: 'USDC on Base',
        href: 'https://www.circle.com/usdc',
        external: true,
      },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

export function Footer() {
  const t = useT();
  // Map section title strings to i18n keys at render time. This keeps
  // the FOOTER_SECTIONS const declarative + grep-able while still
  // translating the visible labels.
  const sectionTitle = (raw: string) => {
    const k = raw.toLowerCase();
    if (k === 'platform') return t('footer.platform');
    if (k === 'on-chain') return t('footer.onChain');
    if (k === 'company') return t('footer.company');
    if (k === 'legal') return t('footer.legal');
    return raw;
  };
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Top section */}
        <div className="grid gap-12 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Forj Home">
              <Image src="/logo.svg" alt="" width={32} height={32} className="size-8" />
              <span className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
                Forj
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              A freelance platform built on Base. Smart-contract escrow,
              on-chain reputation, and frictionless payouts — without the
              Web3 jargon.
            </p>
            {/* Social links */}
            <div className="mt-6 flex gap-3">
              <a
                href="https://twitter.com/forj"
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                aria-label="Twitter"
              >
                <Twitter className="size-4" />
              </a>
              <a
                href="https://github.com/forj"
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                aria-label="GitHub"
              >
                <Github className="size-4" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
            {FOOTER_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {sectionTitle(section.title)}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {section.links.map((link) =>
                    'external' in link && link.external ? (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
                        >
                          {link.label}
                        </a>
                      </li>
                    ) : (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center gap-4 border-t border-[var(--color-border-subtle)] pt-8 sm:flex-row sm:justify-between">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {t('footer.rights', { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span className="inline-block size-2 rounded-full bg-[var(--color-success)]" />
            {t('footer.builtOn')}
          </div>
        </div>
      </div>
    </footer>
  );
}
