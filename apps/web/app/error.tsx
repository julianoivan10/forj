'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service (Sentry, etc.)
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="dot-grid pointer-events-none fixed inset-0 opacity-40" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="flex size-20 items-center justify-center rounded-full bg-[var(--color-error)]/10 ring-1 ring-[var(--color-error)]/30">
          <svg
            className="size-10 text-[var(--color-error)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          Something went wrong
        </h1>

        <p className="max-w-md text-[var(--color-text-secondary)]">
          An unexpected error occurred. Our team has been notified.
          {error.digest && (
            <span className="mt-2 block font-mono text-xs text-[var(--color-text-tertiary)]">
              Error ID: {error.digest}
            </span>
          )}
        </p>

        <div className="mt-4 flex gap-3">
          <button
            onClick={reset}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-8 text-base font-semibold text-white shadow-[0_0_20px_var(--color-glow-brand)] transition-all duration-200 hover:bg-[#c73e1d] hover:shadow-[0_0_40px_var(--color-glow-brand-strong)] active:scale-[0.97]"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-8 text-base font-medium text-[var(--color-text-primary)] transition-all duration-200 hover:border-[var(--color-border-strong)] active:scale-[0.97]"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
