import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginCard } from '../login/login-card';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a Forj account with email, Google, or your wallet.',
};

export default function SignupPage() {
  return (
    <Suspense>
      <LoginCard mode="signup" />
    </Suspense>
  );
}
