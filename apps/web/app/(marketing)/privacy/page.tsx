import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell } from '../legal-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Forj collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updatedAt="May 2026">
      <p className="lede">
        Forj is a freelance marketplace that connects clients and freelancers
        through smart-contract escrow. This policy explains what personal data
        we collect, how we use it, and the choices you have.
      </p>

      <h2>1. Data we collect</h2>
      <h3>You give us directly</h3>
      <ul>
        <li>Email address (via Privy auth)</li>
        <li>Display name, username, bio, avatar, and skills (during onboarding)</li>
        <li>Job descriptions, proposal cover letters, deliverable files, messages,
            and reviews you write</li>
        <li>Wallet address (smart wallet or external wallet) — this is also
            cryptographically verifiable on-chain</li>
      </ul>

      <h3>We collect automatically</h3>
      <ul>
        <li>Basic device + browser info (user agent, screen size) for layout
            optimisation</li>
        <li>IP address (logged at request edge by hosting provider for abuse
            prevention; not retained beyond 30 days)</li>
        <li>On-chain transactions you make through the platform — these are
            permanently public on Base, by design</li>
      </ul>

      <h3>We do NOT collect</h3>
      <ul>
        <li>Private keys or seed phrases. Your embedded wallet&rsquo;s private
            key lives in Privy&rsquo;s key management infrastructure — Forj
            never has access to it.</li>
        <li>Banking details. Off-ramp flows (when launched) are handled by
            licensed third parties (e.g. Transak), not by us.</li>
        <li>Government IDs. The MVP does not perform KYC. This may change for
            high-value contracts as the platform scales.</li>
      </ul>

      <h2>2. How we use your data</h2>
      <ul>
        <li>To provide the platform — match jobs to freelancers, render
            proposals, run escrows</li>
        <li>To send transactional emails (proposals received, escrow funded,
            work submitted, dispute raised) via Resend</li>
        <li>To prevent fraud + maintain platform integrity</li>
        <li>To analyse aggregate usage so we can improve the product</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal data, and we do not run
        third-party advertising networks or behavioural ad trackers on the
        platform.
      </p>

      <h2>3. Third-party processors</h2>
      <p>
        We use these vendors to operate the platform. Each processes a limited
        slice of your data on our behalf:
      </p>
      <ul>
        <li><strong>Privy</strong> — authentication + embedded wallet management</li>
        <li><strong>Pimlico</strong> — sponsored gas (paymaster)</li>
        <li><strong>Neon</strong> — hosted PostgreSQL (where your profile,
            jobs, contracts, and messages live)</li>
        <li><strong>UploadThing</strong> — file uploads (avatars, attachments,
            cover images, deliverables)</li>
        <li><strong>Resend</strong> — transactional email</li>
        <li><strong>Vercel</strong> — hosting + edge runtime</li>
        <li><strong>Sentry</strong> (when enabled) — error monitoring; PII is
            scrubbed before being sent</li>
      </ul>

      <h2>4. On-chain data is public, forever</h2>
      <p>
        Anything settled on the blockchain (wallet address, escrow amounts,
        funding/release timestamps, dispute outcomes) is part of the public
        ledger and cannot be deleted by us or anyone else. Treat your wallet
        address as a pseudonym that is permanently linked to its history.
      </p>

      <h2>5. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete your personal data. The Settings page includes an
        <strong> Export my data </strong>button (downloads all DB-stored data
        we hold about you) and a <strong>Delete account</strong> action (soft-
        deletes your row and anonymises personally-identifying fields). On-chain
        records are not deleted — see section 4.
      </p>

      <h2>6. Data retention</h2>
      <ul>
        <li>Account data: retained while your account is active; soft-deleted
            for 90 days after deletion request, then hard-deleted (except where
            we&rsquo;re required to retain it for tax / legal reasons)</li>
        <li>IP / device logs: 30 days</li>
        <li>Email logs (Resend): 90 days</li>
        <li>On-chain data: permanent (cannot be deleted)</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Data in transit is encrypted with TLS. Database backups are encrypted at
        rest. We follow least-privilege access controls — only authorised team
        members access production data, and only when investigating issues you
        report. Smart contracts are open source and verifiable on Basescan.
      </p>

      <h2>8. Children</h2>
      <p>
        Forj is not intended for users under 18. If you believe a child has
        signed up, please <Link href="/contact" className="link">contact us</Link>
        {' '}and we&rsquo;ll close the account.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        Material changes will be announced via in-app notification and email at
        least 14 days before they take effect.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about your data?{' '}
        <Link href="/contact" className="link">
          Reach out
        </Link>
        .
      </p>
    </LegalShell>
  );
}
