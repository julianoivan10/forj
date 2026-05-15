import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginCard } from './login-card';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Forj with email, Google, or wallet.',
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
