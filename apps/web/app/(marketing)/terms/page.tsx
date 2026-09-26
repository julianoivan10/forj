import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell } from '../legal-shell';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of Forj.',
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updatedAt="May 2026">
      <p className="lede">
        These terms govern your use of Forj — a freelance marketplace where work
        agreements are settled by smart contracts on the Base network. By creating
        an account, posting a job, submitting a proposal, or funding an escrow,
        you agree to be bound by these terms.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Forj is operated as a pre-incorporation venture during the testnet phase.
        These terms will be amended once a legal entity is registered and a
        finalised set of terms is reviewed by counsel. Use the platform on the
        understanding that the formal company structure is forthcoming.
      </p>

      <h2>2. The role of Forj</h2>
      <p>
        Forj is a <strong>marketplace and software service</strong>, not an employer,
        agent, or party to any work agreement between you and another user. Contracts
        formed through the platform are between the client and the freelancer. Forj
        provides the escrow smart contract and the user interface — but does not
        deliver the work, set the scope, or guarantee the outcome.
      </p>

      <h2>3. Escrow & payments</h2>
      <p>
        All payments settle on-chain in USDC on Base. When a client funds a contract,
        USDC moves into the <code>ForjEscrowV3</code> smart contract, whose address is shown
        on each contract page and is independently verifiable on Basescan. The contract
        enforces these rules:
      </p>
      <ul>
        <li>The client can release payment at any time before a dispute.</li>
        <li>After each submission the client has 7 days to approve, request a revision or
            open a dispute. If the client does nothing, anyone can release the payment to the
            freelancer.</li>
        <li>The client can request at most 2 revisions per contract.</li>
        <li>The client gets a full refund only if the freelancer cancels, or if no
            submission (or resubmission) arrives before the work deadline.</li>
        <li>In a dispute, the arbiter decides how the work amount is split between client and
            freelancer. Platform fees apply only to the freelancer&rsquo;s share. If the arbiter
            doesn&rsquo;t decide within 14 days, the contract splits the work amount 50/50 and
            charges no fee.</li>
      </ul>
      <p>
        Forj does not custody funds. The smart contract holds them. Contracts funded before
        ForjEscrowV3 follow the rules of the contract they were funded under.
      </p>

      <h2>4. Platform fees</h2>
      <p>
        Forj charges a <strong>5% client fee + 2% freelancer fee</strong> on each
        contract. The client fee is added on top of the agreed work amount; the
        freelancer fee is deducted from the payout at release. Fees are collected
        by the smart contract automatically and routed to the platform&rsquo;s fee
        recipient address.
      </p>

      <h2>5. Account, identity & content</h2>
      <p>
        You agree to provide accurate information during onboarding, to keep your
        wallet credentials secure, and not to impersonate another person. You are
        responsible for any content you post — job descriptions, proposals,
        deliverables, profile bio, reviews — and represent that you have the
        right to post it.
      </p>

      <h2>6. Prohibited conduct</h2>
      <ul>
        <li>Fraud, money laundering, or sanctions evasion</li>
        <li>Posting work that is illegal, malicious, or infringes third-party
            rights</li>
        <li>Manipulating reviews, reputation, or proposal counts</li>
        <li>Attempting to compromise the smart contract, the platform&rsquo;s
            infrastructure, or other users&rsquo; accounts</li>
      </ul>
      <p>
        Violations may result in your account being suspended and (where the
        smart contract permits) any active escrows being routed to dispute
        resolution.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        Forj is provided <strong>&ldquo;as is&rdquo;</strong>. Smart contracts are
        immutable code; bugs and exploits can exist despite best-effort review.
        Cryptocurrency networks experience congestion, fee spikes, and outages
        outside our control. We do not guarantee continuous availability,
        bug-free operation, or specific transaction settlement times.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Forj is not liable for indirect,
        incidental, or consequential damages arising from your use of the
        platform. Our total liability for any claim is limited to the platform
        fees you paid in the 12 months preceding the claim.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. Material changes will be
        announced via in-app notification and email at least 14 days before they
        take effect, unless the change is required to comply with law.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms?{' '}
        <Link href="/contact" className="link">
          Get in touch
        </Link>
        .
      </p>
    </LegalShell>
  );
}
