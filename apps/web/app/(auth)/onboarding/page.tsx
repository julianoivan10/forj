import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth/auth-gate';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = {
  title: 'Complete your profile',
  description: 'Set up your Forj profile in a few steps.',
};

export default function OnboardingPage() {
  return (
    <AuthGate mode="authenticated">
      <OnboardingForm />
    </AuthGate>
  );
}
