'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Public error boundary for `/services/*`. Same shape as `jobs/error.tsx`
 * — keeps the marketplace shell intact when an inner page errors.
 */
export default function ServicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[services/error]', error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-background-secondary)] p-10 text-center">
      <AlertTriangle className="size-7 text-[var(--color-error)]" />
      <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
        Couldn't load this service
      </h2>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        The marketplace might be busy, or this listing was removed while you
        were viewing it.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={reset} leftIcon={<RefreshCw />}>
          Try again
        </Button>
        <Link href="/services">
          <Button variant="secondary">Browse services</Button>
        </Link>
      </div>
    </div>
  );
}
