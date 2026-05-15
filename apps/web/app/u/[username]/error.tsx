'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Error boundary for public profile pages. The most common failure here is
 * a deleted account or typo'd username — render a friendly "couldn't load"
 * with a path back to /jobs (the highest-engagement public surface).
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[u/error]', error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-background-secondary)] p-10 text-center">
      <AlertTriangle className="size-7 text-[var(--color-error)]" />
      <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
        Profile unavailable
      </h2>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        This profile may have been removed, or the username is mistyped.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={reset} leftIcon={<RefreshCw />}>
          Try again
        </Button>
        <Link href="/jobs">
          <Button variant="secondary">Browse jobs instead</Button>
        </Link>
      </div>
    </div>
  );
}
