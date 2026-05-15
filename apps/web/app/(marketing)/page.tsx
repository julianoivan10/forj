import { HeroSection } from '@/components/landing/hero-section';
import { StatsSection } from '@/components/landing/stats-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { PaymentFlowSection } from '@/components/landing/payment-flow-section';
import { ReputationSection } from '@/components/landing/reputation-section';
import { CategoriesSection } from '@/components/landing/categories-section';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import { CtaSection } from '@/components/landing/cta-section';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forj — Work, forged in trust.',
  description:
    'A freelance platform built on Base. Smart-contract escrow, on-chain reputation, and frictionless payouts — without the Web3 jargon.',
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PaymentFlowSection />
      <ReputationSection />
      <CategoriesSection />
      <TestimonialsSection />
      <CtaSection />
    </>
  );
}
