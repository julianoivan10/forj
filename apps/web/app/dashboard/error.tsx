'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Dashboard-scoped error boundary. Catches errors INSIDE the dashboard so
 * the user keeps the sidebar / nav and only the content area is replaced
 * with the error message. A platform-wide error would still bubble up to
 * the root `app/error.tsx`.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[dashboard/error]', error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-background-secondary)] p-10 text-center">
      <AlertTriangle className="size-7 text-[var(--color-error)]" />
      <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
        We couldn't load this page
      </h2>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        Either the server hiccupped or the data isn't available right now. Most of
        the time a retry is enough.
      </p>
      <Button onClick={reset} leftIcon={<RefreshCw />} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
