'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/auth/user-menu';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { SearchTrigger } from '@/components/search/search-trigger';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useT } from '@/lib/i18n/provider';
import { useAuth, hasPrivy } from '@/hooks/use-auth';

// Nav links reference i18n keys (`nav.*`) — resolved per-render so a
// language switch re-renders the link labels without a reload.
const NAV_LINKS = [
  { labelKey: 'nav.browseJobs', href: '/jobs' },
  { labelKey: 'nav.browseServices', href: '/services' },
  { labelKey: 'nav.howItWorks', href: '/#how-it-works' },
  { labelKey: 'nav.about', href: '/about' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isReady, isAuthenticated, user } = useAuth();
  const t = useT();
  const showUserMenu = hasPrivy && isReady && isAuthenticated && Boolean(user);
  const showAuthCtas = !hasPrivy || (isReady && !isAuthenticated);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          scrolled
            ? 'glass shadow-lg shadow-black/20'
            : 'bg-transparent',
        )}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5" aria-label="Forj Home">
            <Image src="/logo.svg" alt="" width={32} height={32} className="size-8" />
            <span className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              For<span className="text-[var(--color-brand-primary)]">j</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[var(--radius-sm)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:bg-[var(--color-text-primary)]/[0.04]"
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </div>

          {/* Desktop CTA / User menu */}
          <div className="hidden items-center gap-3 md:flex">
            <SearchTrigger />
            <LanguageSwitcher />
            <ThemeToggle />
            {showUserMenu ? (
              <UserMenu />
            ) : showAuthCtas ? (
              <>
                <Link
                  href="/login"
                  className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  {t('nav.signIn')}
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[#c73e1d] shadow-[0_0_20px_var(--color-glow-brand)] transition-all duration-200 hover:shadow-[0_0_40px_var(--color-glow-brand-strong)] active:scale-[0.97]"
                >
                  {t('nav.signUp')}
                  <ChevronRight className="size-4" />
                </Link>
              </>
            ) : (
              <Loader2 className="size-5 animate-spin text-[var(--color-text-tertiary)]" />
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.06] md:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>
      </header>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile menu panel */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed top-0 right-0 z-50 flex h-full w-[280px] flex-col bg-[var(--color-background-secondary)] border-l border-[var(--color-border-default)] md:hidden"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <span className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                Menu
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.06]"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-1 px-3 py-2">
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-[var(--radius-md)] px-4 py-3 text-base font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]"
                  >
                    {t(link.labelKey)}
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-[var(--color-border-default)] p-4">
              {showUserMenu ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] text-sm font-semibold text-white hover:bg-[#c73e1d]"
                >
                  Go to dashboard
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04]"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] text-sm font-semibold text-white hover:bg-[#c73e1d]"
                  >
                    Get Started
                    <ChevronRight className="size-4" />
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
