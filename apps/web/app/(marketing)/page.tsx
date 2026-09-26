import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { OnchainSection } from '@/components/landing/onchain-section';
import { OwnershipSection } from '@/components/landing/ownership-section';
import { TrustGapSection } from '@/components/landing/trust-gap-section';
import { WorkflowsSection } from '@/components/landing/workflows-section';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // `absolute` skips the root `%s | Forj` template, which produced
  // "Forj — Work, forged in trust. | Forj".
  title: { absolute: 'Forj — Work, forged in trust.' },
  alternates: { canonical: '/' },
  description:
    'A freelance marketplace where payment is locked in USDC escrow on Base before work starts and released when the client approves.',
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustGapSection />
      <WorkflowsSection />
      <OnchainSection />
      <OwnershipSection />
      <FinalCta />
    </>
  );
}
