import Link from 'next/link';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[var(--color-glow-brand)] blur-3xl" />
        <div className="dot-grid absolute inset-0 opacity-20" />
      </div>

      {/* Minimal nav */}
      <header className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Forj Home">
          <Image src="/logo.svg" alt="" width={32} height={32} className="size-8" />
          <span className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Forj
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        {children}
      </main>

      <footer className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">
        <span>Secure auth powered by </span>
        <span className="font-semibold text-[var(--color-text-secondary)]">Privy</span>
        <span> · </span>
        <Link href="/" className="hover:text-[var(--color-text-primary)]">Back to home</Link>
      </footer>
    </div>
  );
}
