'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth, hasPrivy } from '@/hooks/use-auth';

type Mode = 'authenticated' | 'onboarded';

interface AuthGateProps {
  mode?: Mode;
  children: React.ReactNode;
}

/**
 * Client-side route gate.
 *
 * - `mode="authenticated"` (default): allows onboarding-in-progress users through.
 *   Redirects unauthenticated users to /login.
 * - `mode="onboarded"`: additionally requires the user to have finished onboarding.
 *   Redirects to /onboarding if the flag isn't set.
 *
 * When Privy isn't configured we fall through so local dev without keys still works.
 */
export function AuthGate({ mode = 'onboarded', children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isReady, isAuthenticated, isLoading, user, needsOnboarding } = useAuth();

  useEffect(() => {
    if (!hasPrivy) return;
    if (!isReady) return;

    if (!isAuthenticated) {
      const next = encodeURIComponent(pathname ?? '/');
      router.replace(`/login?next=${next}`);
      return;
    }

    if (mode === 'onboarded' && user && needsOnboarding && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [isReady, isAuthenticated, user, needsOnboarding, mode, router, pathname]);

  if (!hasPrivy) return <>{children}</>;

  const isGateBlocking =
    !isReady ||
    isLoading ||
    !isAuthenticated ||
    (mode === 'onboarded' && needsOnboarding && pathname !== '/onboarding');

  if (isGateBlocking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--color-brand-primary)]" />
      </div>
    );
  }

  return <>{children}</>;
}
