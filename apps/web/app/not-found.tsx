import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {/* Dot grid background */}
      <div className="dot-grid pointer-events-none fixed inset-0 opacity-40" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* 404 number */}
        <h1
          className="font-display text-gradient-brand text-[120px] font-extrabold leading-none tracking-tighter sm:text-[180px]"
        >
          404
        </h1>

        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          Page not found
        </h2>

        <p className="max-w-md text-[var(--color-text-secondary)]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on chain.
        </p>

        <Link
          href="/"
          className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-8 text-base font-semibold text-[var(--color-on-brand)] transition-all duration-200 hover:bg-[var(--color-brand-secondary)] active:scale-[0.97]"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
