'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Public-surface error boundary for `/jobs/*`. Keeps the navbar/footer
 * intact (provided by `app/jobs/layout.tsx`) and only swaps the inner
 * content when something explodes — visitors don't lose their way back to
 * the rest of the site.
 */
export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[jobs/error]', error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-background-secondary)] p-10 text-center">
      <AlertTriangle className="size-7 text-[var(--color-error)]" />
      <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
        We couldn't load this page
      </h2>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        Either the server hiccupped or the data isn't available right now.
        Most of the time a retry is enough.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={reset} leftIcon={<RefreshCw />}>
          Try again
        </Button>
        <Link href="/">
          <Button variant="secondary">Back home</Button>
        </Link>
      </div>
    </div>
  );
}
